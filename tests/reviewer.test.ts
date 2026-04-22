import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @anthropic-ai/sdk before importing reviewer
vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
  (MockAnthropic as unknown as Record<string, unknown>).RateLimitError = class extends Error {};
  (MockAnthropic as unknown as Record<string, unknown>).AuthenticationError = class extends Error {};
  (MockAnthropic as unknown as Record<string, unknown>).PermissionDeniedError = class extends Error {};
  (MockAnthropic as unknown as Record<string, unknown>).NotFoundError = class extends Error {};
  (MockAnthropic as unknown as Record<string, unknown>).BadRequestError = class extends Error {};
  return { default: MockAnthropic };
});

import { runReview } from '../src/reviewer';
import Anthropic from '@anthropic-ai/sdk';
import type { PRContext, ActionInputs } from '../src/types';
import { ReviewBotError } from '../src/types';

const VALID_REVIEW = `## 📋 Resumo
Good PR.

## ✅ Pontos Positivos
- Well structured

## 🚨 Problemas Críticos
Nenhum problema crítico encontrado.

## ⚠️ Melhorias Sugeridas
Nenhuma melhoria sugerida.

## 💡 Sugestões com Código
Nenhuma sugestão de código.

## 🔒 Segurança
- **SQL Injection:** ✅
- **XSS / HTML Injection:** ✅
- **Secrets/credentials exposed:** ✅
- **Input validation:** ✅
- **Authentication/Authorization:** ✅
- **Sensitive data in logs:** ✅
- **Dependency vulnerabilities:** ✅

## 📊 Avaliação Final
**Score:** 9/10
**Veredicto:** APPROVED

Excellent PR, approve immediately.

## 🔍 Comentários Inline
\`\`\`json
[]
\`\`\``;

const mockContext: PRContext = {
  owner: 'acme',
  repo: 'api',
  pullNumber: 1,
  headSha: 'sha123',
  title: 'Fix bug',
  description: 'Fixes issue #10',
  baseBranch: 'main',
  headBranch: 'fix/bug',
  author: 'user',
  commits: [],
  files: [
    {
      filename: 'src/fix.ts',
      status: 'modified',
      additions: 5,
      deletions: 2,
      patch: '@@ -1,2 +1,5 @@\n-old\n+new',
      isTruncated: false,
    },
  ],
};

const mockInputs: ActionInputs = {
  githubToken: 'token',
  anthropicApiKey: 'sk-key',
  maxFiles: 30,
  maxDiffLines: 500,
  severityThreshold: 'warning',
  ignoredPatterns: [],
};

describe('runReview', () => {
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const instance = new Anthropic({ apiKey: 'test' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    createMock = instance.messages.create as ReturnType<typeof vi.fn>;
  });

  it('returns parsed review on success', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: VALID_REVIEW }],
    });

    const result = await runReview(mockContext, mockInputs);
    expect(result.verdict).toBe('APPROVED');
    expect(result.score).toBe(9);
    expect(result.criticalIssuesCount).toBe(0);
  });

  it('throws no_diff error when no files', async () => {
    const emptyContext = { ...mockContext, files: [] };
    await expect(runReview(emptyContext, mockInputs)).rejects.toThrow(ReviewBotError);
    await expect(runReview(emptyContext, mockInputs)).rejects.toMatchObject({ type: 'no_diff' });
  });

  it('includes duration in result', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: VALID_REVIEW }],
    });

    const result = await runReview(mockContext, mockInputs);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('retries on transient errors', async () => {
    createMock
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: VALID_REVIEW }] });

    const result = await runReview(mockContext, mockInputs);
    expect(result.verdict).toBe('APPROVED');
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
