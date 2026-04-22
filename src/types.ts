export interface ActionInputs {
  readonly githubToken: string;
  readonly anthropicApiKey: string;
  readonly maxFiles: number;
  readonly maxDiffLines: number;
  readonly severityThreshold: 'critical' | 'warning';
  readonly ignoredPatterns: readonly string[];
}

export interface PRContext {
  readonly owner: string;
  readonly repo: string;
  readonly pullNumber: number;
  readonly headSha: string;
  readonly title: string;
  readonly description: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly author: string;
  readonly commits: readonly CommitInfo[];
  readonly files: readonly FileChange[];
}

export interface CommitInfo {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
}

export type FileStatus =
  | 'added'
  | 'removed'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged';

export interface FileChange {
  readonly filename: string;
  readonly status: FileStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly patch?: string;
  readonly previousFilename?: string;
  readonly isTruncated: boolean;
}

export interface InlineComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

export type Verdict = 'APPROVED' | 'APPROVED_WITH_SUGGESTIONS' | 'CHANGES_REQUESTED';

export type CommitState = 'success' | 'failure' | 'pending' | 'error';

export interface ReviewResult {
  readonly verdict: Verdict;
  readonly score: number;
  readonly criticalIssuesCount: number;
  readonly rawContent: string;
  readonly inlineComments: readonly InlineComment[];
  readonly durationMs: number;
}

export interface ReviewError {
  readonly type: 'api_error' | 'parse_error' | 'no_diff' | 'rate_limit';
  readonly message: string;
  readonly retryable: boolean;
}

export class ReviewBotError extends Error {
  constructor(
    public readonly type: ReviewError['type'],
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ReviewBotError';
  }
}
