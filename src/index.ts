import * as core from '@actions/core';
import { GitHubClient, getRepoContext } from './github';
import { runReview } from './reviewer';
import { buildCommentBody, verdictToEmoji } from './parser';
import { getBotCommentMarker } from './prompt';
import { ReviewBotError } from './types';
import type { ActionInputs } from './types';

async function main(): Promise<void> {
  const inputs = readInputs();
  const { owner, repo, pullNumber } = getRepoContext();

  const client = new GitHubClient(inputs.githubToken, owner, repo);

  await client.setCommitStatus(
    await getHeadSha(client, pullNumber),
    'pending',
    'AI review in progress...',
  );

  let headSha = '';

  try {
    const context = await client.fetchPRContext(
      pullNumber,
      inputs.maxFiles,
      inputs.maxDiffLines,
      inputs.ignoredPatterns,
    );

    headSha = context.headSha;

    await client.setCommitStatus(headSha, 'pending', 'AI review in progress...');

    const result = await runReview(context, inputs);

    const commentBody = buildCommentBody(result.rawContent, getBotCommentMarker());
    await client.upsertBotComment(pullNumber, commentBody);

    await client.createInlineComments(pullNumber, headSha, result.inlineComments);

    const statusDescription = buildStatusDescription(result.score, result.criticalIssuesCount);
    const commitState = result.verdict === 'CHANGES_REQUESTED' ? 'failure' : 'success';
    await client.setCommitStatus(headSha, commitState, statusDescription);

    core.setOutput('verdict', result.verdict);
    core.setOutput('score', String(result.score));
    core.setOutput('critical-issues', String(result.criticalIssuesCount));
    core.setOutput('review-url', `https://github.com/${owner}/${repo}/pull/${pullNumber}`);

    core.info(`Review complete: ${verdictToEmoji(result.verdict)} | Score: ${result.score}/10 | Duration: ${Math.round(result.durationMs / 1000)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isRetryable = err instanceof ReviewBotError ? err.retryable : false;

    if (headSha) {
      await client
        .setCommitStatus(headSha, 'error', `Review failed: ${message.slice(0, 100)}`)
        .catch(() => undefined);
    }

    if (err instanceof ReviewBotError && err.type === 'no_diff') {
      core.warning('No reviewable files in this PR — skipping review.');
      core.setOutput('verdict', 'APPROVED');
      core.setOutput('score', '10');
      core.setOutput('critical-issues', '0');
      return;
    }

    core.setFailed(`PR Review Bot failed: ${message}${isRetryable ? ' (retryable)' : ''}`);
  }
}

function readInputs(): ActionInputs {
  const ignoredPatternsRaw = core.getInput('ignored-patterns');
  const ignoredPatterns = ignoredPatternsRaw
    ? ignoredPatternsRaw
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return {
    githubToken: core.getInput('github-token', { required: true }),
    anthropicApiKey: core.getInput('anthropic-api-key', { required: true }),
    maxFiles: parseInt(core.getInput('max-files') || '30', 10),
    maxDiffLines: parseInt(core.getInput('max-diff-lines') || '500', 10),
    severityThreshold:
      (core.getInput('severity-threshold') as 'critical' | 'warning') || 'warning',
    ignoredPatterns,
  };
}

async function getHeadSha(client: GitHubClient, pullNumber: number): Promise<string> {
  const context = await client.fetchPRContext(pullNumber, 1, 1, []);
  return context.headSha;
}

function buildStatusDescription(score: number, criticalIssues: number): string {
  if (criticalIssues > 0) {
    return `Score: ${score}/10 — ${criticalIssues} critical issue(s) found`;
  }
  return `Score: ${score}/10 — Review complete`;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(`Unexpected error: ${message}`);
});
