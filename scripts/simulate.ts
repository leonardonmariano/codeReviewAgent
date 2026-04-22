import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, buildUserPrompt } from '../src/prompt';
import { parseReview, verdictToEmoji } from '../src/parser';
import type { PRContext, ActionInputs } from '../src/types';

// ─── ANSI colors ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgDark: '\x1b[48;5;235m',
  gray: '\x1b[90m',
};

// ─── Mock PR ──────────────────────────────────────────────────────────────────
const mockContext: PRContext = {
  owner: 'acme-corp',
  repo: 'payments-api',
  pullNumber: 87,
  headSha: 'f3a91c2',
  title: 'feat: add payment retry logic with exponential backoff',
  description: `## What
Adds automatic retry logic for failed payment processing calls.
Payments were silently failing when the gateway timed out — now they retry up to 3x.

## Why
We had ~2% silent payment failures in production last week (Grafana alert #204).

## How
- \`PaymentService.charge()\` now wraps gateway call with \`withRetry()\`
- Backoff: 500ms → 1s → 2s
- Non-retryable errors (card declined, invalid CVV) fail fast`,
  baseBranch: 'main',
  headBranch: 'feat/payment-retry',
  author: 'maria-santos',
  commits: [
    { sha: 'f3a91c2', message: 'feat: add withRetry helper with exponential backoff', author: 'maria-santos' },
    { sha: 'b2e84d1', message: 'feat: wrap PaymentService.charge with retry logic', author: 'maria-santos' },
    { sha: 'a1c73f0', message: 'test: add unit tests for retry logic', author: 'maria-santos' },
  ],
  files: [
    {
      filename: 'src/utils/retry.ts',
      status: 'added',
      additions: 42,
      deletions: 0,
      isTruncated: false,
      patch: `@@ -0,0 +1,42 @@
+export interface RetryOptions {
+  maxAttempts?: number;
+  baseDelayMs?: number;
+  shouldRetry?: (error: unknown) => boolean;
+}
+
+export class RetryExhaustedError extends Error {
+  constructor(public readonly attempts: number, public readonly lastError: unknown) {
+    super(\`Failed after \${attempts} attempts\`);
+    this.name = 'RetryExhaustedError';
+  }
+}
+
+export async function withRetry<T>(
+  fn: () => Promise<T>,
+  options: RetryOptions = {},
+): Promise<T> {
+  const maxAttempts = options.maxAttempts ?? 3;
+  const baseDelayMs = options.baseDelayMs ?? 500;
+  const shouldRetry = options.shouldRetry ?? (() => true);
+
+  let lastError: unknown;
+
+  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
+    try {
+      return await fn();
+    } catch (err) {
+      lastError = err;
+
+      if (!shouldRetry(err) || attempt === maxAttempts) {
+        throw err;
+      }
+
+      const delay = baseDelayMs * Math.pow(2, attempt - 1);
+      await new Promise((r) => setTimeout(r, delay));
+    }
+  }
+
+  throw new RetryExhaustedError(maxAttempts, lastError);
+}`,
    },
    {
      filename: 'src/services/payment.service.ts',
      status: 'modified',
      additions: 18,
      deletions: 7,
      isTruncated: false,
      patch: `@@ -1,14 +1,25 @@
 import { GatewayClient } from '../gateway/client';
+import { withRetry } from '../utils/retry';
 import type { ChargeResult, PaymentPayload } from '../types';

 export class PaymentService {
   constructor(private readonly gateway: GatewayClient) {}

-  async charge(payload: PaymentPayload): Promise<ChargeResult> {
-    const result = await this.gateway.charge(payload);
-    return result;
-  }
+  async charge(payload: PaymentPayload): Promise<ChargeResult> {
+    return withRetry(
+      () => this.gateway.charge(payload),
+      {
+        maxAttempts: 3,
+        baseDelayMs: 500,
+        shouldRetry: (err) => !isNonRetryable(err),
+      },
+    );
+  }
 }

+function isNonRetryable(err: unknown): boolean {
+  if (!(err instanceof Error)) return false;
+  const NON_RETRYABLE = ['card_declined', 'invalid_cvv', 'expired_card', 'insufficient_funds'];
+  return NON_RETRYABLE.some((code) => err.message.includes(code));
+}`,
    },
    {
      filename: 'src/utils/retry.test.ts',
      status: 'added',
      additions: 61,
      deletions: 0,
      isTruncated: false,
      patch: `@@ -0,0 +1,61 @@
+import { describe, it, expect, vi } from 'vitest';
+import { withRetry, RetryExhaustedError } from './retry';
+
+describe('withRetry', () => {
+  it('returns result on first success', async () => {
+    const fn = vi.fn().mockResolvedValue('ok');
+    expect(await withRetry(fn)).toBe('ok');
+    expect(fn).toHaveBeenCalledTimes(1);
+  });
+
+  it('retries on transient failure', async () => {
+    const fn = vi.fn()
+      .mockRejectedValueOnce(new Error('timeout'))
+      .mockResolvedValue('ok');
+    expect(await withRetry(fn, { baseDelayMs: 0 })).toBe('ok');
+    expect(fn).toHaveBeenCalledTimes(2);
+  });
+
+  it('throws after max attempts', async () => {
+    const fn = vi.fn().mockRejectedValue(new Error('timeout'));
+    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 }))
+      .rejects.toThrow('timeout');
+  });
+
+  it('does not retry when shouldRetry returns false', async () => {
+    const fn = vi.fn().mockRejectedValue(new Error('card_declined'));
+    await expect(
+      withRetry(fn, { shouldRetry: () => false, baseDelayMs: 0 }),
+    ).rejects.toThrow('card_declined');
+    expect(fn).toHaveBeenCalledTimes(1);
+  });
+});`,
    },
  ],
};

const mockInputs: ActionInputs = {
  githubToken: 'ghp_sim',
  anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
  maxFiles: 30,
  maxDiffLines: 500,
  severityThreshold: 'warning',
  ignoredPatterns: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function divider(char = '─', width = 72): string {
  return c.gray + char.repeat(width) + c.reset;
}

function header(): void {
  console.clear();
  console.log('\n' + divider('═'));
  console.log(
    `${c.bold}${c.magenta}  🤖  PR Review Bot${c.reset}${c.dim}  — local simulation${c.reset}`,
  );
  console.log(divider('═'));
  console.log(
    `${c.dim}  Repo   ${c.reset}${c.cyan}${mockContext.owner}/${mockContext.repo}${c.reset}`,
  );
  console.log(
    `${c.dim}  PR     ${c.reset}${c.bold}#${mockContext.pullNumber}${c.reset} ${mockContext.title}`,
  );
  console.log(
    `${c.dim}  Branch ${c.reset}${c.yellow}${mockContext.headBranch}${c.reset}${c.dim} → ${c.reset}${mockContext.baseBranch}`,
  );
  console.log(
    `${c.dim}  Author ${c.reset}${mockContext.author}   ${c.dim}Files ${c.reset}${mockContext.files.length}`,
  );
  console.log(divider('─') + '\n');
}

function spinner(msg: string): NodeJS.Timeout {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write('\n');
  return setInterval(() => {
    process.stdout.write(
      `\r  ${c.cyan}${frames[i++ % frames.length]}${c.reset}  ${c.dim}${msg}${c.reset}   `,
    );
  }, 80);
}

function verdictColor(verdict: string): string {
  if (verdict === 'APPROVED') return c.green;
  if (verdict === 'CHANGES_REQUESTED') return c.red;
  return c.yellow;
}

function scoreBar(score: number): string {
  const filled = Math.round(score);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = score >= 8 ? c.green : score >= 5 ? c.yellow : c.red;
  return `${color}${bar}${c.reset} ${c.bold}${score}/10${c.reset}`;
}

function printReview(raw: string, durationMs: number): void {
  const result = parseReview(raw, durationMs);
  const vColor = verdictColor(result.verdict);

  console.log('\n' + divider('═'));
  console.log(`${c.bold}${c.magenta}  📋  REVIEW RESULT${c.reset}`);
  console.log(divider('═'));

  // Score + Verdict
  console.log(`\n  Score    ${scoreBar(result.score)}`);
  console.log(
    `  Verdict  ${vColor}${c.bold}${verdictToEmoji(result.verdict)}${c.reset}`,
  );
  console.log(
    `  Critical ${result.criticalIssuesCount > 0 ? c.red : c.green}${result.criticalIssuesCount} issue(s)${c.reset}`,
  );
  console.log(`  Duration ${c.dim}${(durationMs / 1000).toFixed(1)}s${c.reset}`);

  if (result.inlineComments.length > 0) {
    console.log(
      `  Inline   ${c.cyan}${result.inlineComments.length} comment(s)${c.reset}`,
    );
  }

  console.log('\n' + divider('─'));
  console.log(`\n${c.bold}  Full Review:${c.reset}\n`);

  // Print the raw review with light indentation
  const indented = raw
    .split('\n')
    .map((line) => {
      if (line.startsWith('## ')) return `${c.bold}${c.cyan}  ${line}${c.reset}`;
      if (line.startsWith('**Score:')) return `  ${c.bold}${line}${c.reset}`;
      if (line.startsWith('**Veredicto:')) return `  ${c.bold}${line}${c.reset}`;
      if (line.startsWith('- ') || line.startsWith('* ')) return `  ${c.white}${line}${c.reset}`;
      if (line.startsWith('```')) return `  ${c.dim}${line}${c.reset}`;
      return `  ${line}`;
    })
    .join('\n');

  console.log(indented);
  console.log('\n' + divider('═') + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.error(
      `\n${c.red}${c.bold}  ✗  ANTHROPIC_API_KEY not set${c.reset}\n\n` +
        `  Create a ${c.cyan}.env${c.reset} file with:\n` +
        `  ${c.dim}ANTHROPIC_API_KEY=sk-ant-...${c.reset}\n`,
    );
    process.exit(1);
  }

  header();

  const spin = spinner('Calling Claude — this takes ~30s...');
  const start = Date.now();

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(mockContext, mockInputs) }],
    });

    clearInterval(spin);
    process.stdout.write('\r' + ' '.repeat(60) + '\r');

    const durationMs = Date.now() - start;
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response');

    printReview(textBlock.text, durationMs);
  } catch (err) {
    clearInterval(spin);
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    console.error(`\n${c.red}  ✗  ${err instanceof Error ? err.message : String(err)}${c.reset}\n`);
    process.exit(1);
  }
}

main();
