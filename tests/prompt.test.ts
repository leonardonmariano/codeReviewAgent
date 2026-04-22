import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, BOT_COMMENT_MARKER, getBotCommentMarker } from '../src/prompt';
import type { PRContext, ActionInputs } from '../src/types';

const mockContext: PRContext = {
  owner: 'acme',
  repo: 'backend',
  pullNumber: 42,
  headSha: 'abc1234',
  title: 'Add authentication',
  description: 'Implements JWT login',
  baseBranch: 'main',
  headBranch: 'feat/auth',
  author: 'dev-user',
  commits: [
    { sha: 'aabbcc1', message: 'Add login endpoint', author: 'dev-user' },
    { sha: 'ddeeff2', message: 'Add token refresh', author: 'dev-user' },
  ],
  files: [
    {
      filename: 'src/auth.ts',
      status: 'added',
      additions: 50,
      deletions: 0,
      patch: '@@ -0,0 +1,50 @@\n+export function login() {}',
      isTruncated: false,
    },
    {
      filename: 'src/middleware.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
      patch: '@@ -1,5 +1,10 @@\n-old code\n+new code',
      isTruncated: false,
    },
  ],
};

const mockInputs: ActionInputs = {
  githubToken: 'ghp_token',
  anthropicApiKey: 'sk-key',
  maxFiles: 30,
  maxDiffLines: 500,
  severityThreshold: 'warning',
  ignoredPatterns: [],
};

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('establishes senior engineer persona', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('senior');
  });

  it('emphasizes format compliance', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('ONLY');
  });
});

describe('buildUserPrompt', () => {
  it('includes repo and PR number', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('acme/backend');
    expect(prompt).toContain('#42');
  });

  it('includes PR title', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('Add authentication');
  });

  it('includes author', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('dev-user');
  });

  it('includes branch names', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('feat/auth');
    expect(prompt).toContain('main');
  });

  it('includes file names', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('src/middleware.ts');
  });

  it('includes diff content', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('export function login()');
  });

  it('includes commits', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('Add login endpoint');
  });

  it('includes PR description', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('Implements JWT login');
  });

  it('uses placeholder when description is empty', () => {
    const ctx = { ...mockContext, description: '' };
    const prompt = buildUserPrompt(ctx, mockInputs);
    expect(prompt).toContain('No description provided');
  });

  it('includes all required section headers', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('📋 Resumo');
    expect(prompt).toContain('✅ Pontos Positivos');
    expect(prompt).toContain('🚨 Problemas Críticos');
    expect(prompt).toContain('⚠️ Melhorias Sugeridas');
    expect(prompt).toContain('💡 Sugestões com Código');
    expect(prompt).toContain('🔒 Segurança');
    expect(prompt).toContain('📊 Avaliação Final');
    expect(prompt).toContain('🔍 Comentários Inline');
  });

  it('requests JSON inline comments', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('```json');
  });

  it('shows truncated note for truncated files', () => {
    const ctx = {
      ...mockContext,
      files: [{ ...mockContext.files[0]!, isTruncated: true }],
    };
    const prompt = buildUserPrompt(ctx, mockInputs);
    expect(prompt).toContain('truncated');
  });

  it('shows change summary', () => {
    const prompt = buildUserPrompt(mockContext, mockInputs);
    expect(prompt).toContain('+60');
    expect(prompt).toContain('-5');
  });
});

describe('BOT_COMMENT_MARKER', () => {
  it('is an HTML comment', () => {
    expect(BOT_COMMENT_MARKER).toMatch(/^<!--.*-->$/);
  });

  it('getBotCommentMarker returns same value', () => {
    expect(getBotCommentMarker()).toBe(BOT_COMMENT_MARKER);
  });
});
