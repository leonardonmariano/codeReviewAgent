import * as github from '@actions/github';
import type { PRContext, FileChange, CommitInfo, InlineComment, CommitState } from './types';
import { BOT_COMMENT_MARKER } from './prompt';
import { ReviewBotError } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

const IGNORED_EXTENSIONS = new Set([
  'lock', 'snap', 'min.js', 'min.css', 'map',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp',
  'ttf', 'woff', 'woff2', 'eot', 'otf',
  'pdf', 'zip', 'tar', 'gz', 'rar',
  'mp3', 'mp4', 'wav', 'avi', 'mov',
]);

const IGNORED_PATH_PATTERNS = [
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^out\//,
  /^coverage\//,
  /node_modules\//,
  /^vendor\//,
  /^public\/assets\//,
  /\.generated\./,
  /\.min\./,
];

export class GitHubClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = github.getOctokit(token);
    this.owner = owner;
    this.repo = repo;
  }

  async fetchPRContext(
    pullNumber: number,
    maxFiles: number,
    maxDiffLines: number,
    ignoredPatterns: readonly string[],
  ): Promise<PRContext> {
    const [prData, filesData, commitsData] = await Promise.all([
      this.octokit.rest.pulls.get({ owner: this.owner, repo: this.repo, pull_number: pullNumber }),
      this.octokit.rest.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: pullNumber,
        per_page: 100,
      }),
      this.octokit.rest.pulls.listCommits({
        owner: this.owner,
        repo: this.repo,
        pull_number: pullNumber,
        per_page: 10,
      }),
    ]);

    const pr = prData.data;
    const customPatterns = ignoredPatterns.map((p) => new RegExp(p));

    const allFiles: FileChange[] = filesData.data
      .filter((f) => !this.shouldIgnoreFile(f.filename, customPatterns))
      .map((f) => {
        const rawPatch = f.patch ?? '';
        const lines = rawPatch.split('\n');
        const isTruncated = lines.length > maxDiffLines;
        const patch = isTruncated ? lines.slice(0, maxDiffLines).join('\n') + '\n... (diff truncated)' : rawPatch;

        return {
          filename: f.filename,
          status: f.status as FileChange['status'],
          additions: f.additions,
          deletions: f.deletions,
          isTruncated,
          ...(patch ? { patch } : {}),
          ...(f.previous_filename ? { previousFilename: f.previous_filename } : {}),
        } as FileChange;
      })
      .slice(0, maxFiles);

    const commits: CommitInfo[] = commitsData.data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
    }));

    return {
      owner: this.owner,
      repo: this.repo,
      pullNumber,
      headSha: pr.head.sha,
      title: pr.title,
      description: pr.body ?? '',
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      author: pr.user?.login ?? 'unknown',
      commits,
      files: allFiles,
    };
  }

  async findBotComment(pullNumber: number): Promise<number | null> {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: pullNumber,
      per_page: 100,
    });

    const botComment = comments.find((c) => c.body?.includes(BOT_COMMENT_MARKER));
    return botComment?.id ?? null;
  }

  async upsertBotComment(pullNumber: number, body: string): Promise<void> {
    const existingId = await this.findBotComment(pullNumber);

    if (existingId !== null) {
      await this.octokit.rest.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: existingId,
        body,
      });
    } else {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: pullNumber,
        body,
      });
    }
  }

  async createInlineComments(
    pullNumber: number,
    headSha: string,
    comments: readonly InlineComment[],
  ): Promise<void> {
    if (comments.length === 0) return;

    await this.octokit.rest.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'COMMENT',
      comments: comments.map((c) => ({
        path: c.path,
        line: c.line,
        side: 'RIGHT' as const,
        body: c.body,
      })),
    });
  }

  async setCommitStatus(sha: string, state: CommitState, description: string): Promise<void> {
    await this.octokit.rest.repos.createCommitStatus({
      owner: this.owner,
      repo: this.repo,
      sha,
      state,
      description: description.slice(0, 140),
      context: 'pr-review-bot / ai-review',
    });
  }

  private shouldIgnoreFile(filename: string, customPatterns: RegExp[]): boolean {
    const ext = filename.split('.').slice(1).join('.');
    if (IGNORED_EXTENSIONS.has(ext)) return true;

    for (const pattern of IGNORED_PATH_PATTERNS) {
      if (pattern.test(filename)) return true;
    }

    for (const pattern of customPatterns) {
      if (pattern.test(filename)) return true;
    }

    return false;
  }
}

export function getRepoContext(): { owner: string; repo: string; pullNumber: number } {
  const context = github.context;

  if (context.eventName !== 'pull_request' && context.eventName !== 'pull_request_target') {
    throw new ReviewBotError('parse_error', `Unsupported event: ${context.eventName}`);
  }

  const pullNumber = context.payload.pull_request?.number;
  if (!pullNumber) {
    throw new ReviewBotError('parse_error', 'Could not determine PR number from event payload');
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pullNumber,
  };
}
