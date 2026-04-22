import Anthropic from '@anthropic-ai/sdk';
import type { ActionInputs, PRContext, ReviewResult } from './types';
import { ReviewBotError } from './types';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { parseReview } from './parser';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function runReview(context: PRContext, inputs: ActionInputs): Promise<ReviewResult> {
  if (context.files.length === 0) {
    throw new ReviewBotError('no_diff', 'No reviewable files found in this PR', false);
  }

  const client = new Anthropic({ apiKey: inputs.anthropicApiKey });
  const startMs = Date.now();
  const rawContent = await callClaudeWithRetry(client, context, inputs);
  const durationMs = Date.now() - startMs;

  return parseReview(rawContent, durationMs);
}

async function callClaudeWithRetry(
  client: Anthropic,
  context: PRContext,
  inputs: ActionInputs,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }

    try {
      return await callClaude(client, context, inputs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (isRateLimitError(err)) {
        const retryAfter = extractRetryAfter(err);
        await sleep(retryAfter ?? BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      if (isNonRetryableError(err)) {
        throw new ReviewBotError('api_error', lastError.message, false);
      }
    }
  }

  throw new ReviewBotError(
    'api_error',
    `Claude API failed after ${MAX_RETRIES} attempts: ${lastError?.message ?? 'unknown error'}`,
    false,
  );
}

async function callClaude(
  client: Anthropic,
  context: PRContext,
  inputs: ActionInputs,
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(context, inputs),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ReviewBotError('parse_error', 'Claude returned no text content', false);
  }

  return textBlock.text;
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Error && err.message.toLowerCase().includes('rate limit')) return true;
  return false;
}

function isNonRetryableError(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError) return true;
  if (err instanceof Anthropic.PermissionDeniedError) return true;
  if (err instanceof Anthropic.NotFoundError) return true;
  if (err instanceof Anthropic.BadRequestError) return true;
  return false;
}

function extractRetryAfter(err: unknown): number | null {
  if (err instanceof Anthropic.RateLimitError) {
    const header = (err as { headers?: Record<string, string> }).headers?.['retry-after'];
    if (header) {
      const seconds = parseInt(header, 10);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
