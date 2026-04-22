import type { ReviewResult, Verdict, InlineComment } from './types';

interface RawInlineComment {
  path: unknown;
  line: unknown;
  body: unknown;
}

const SECTION_REGEX = {
  critical: /## 🚨 Problemas Críticos\n([\s\S]*?)(?=\n## |$)/,
  score: /\*\*Score:\*\*\s*(\d+)\s*\/\s*10/,
  verdict: /\*\*Veredicto:\*\*\s*(APPROVED_WITH_SUGGESTIONS|CHANGES_REQUESTED|APPROVED)/,
  inlineBlock: /## 🔍 Comentários Inline\s*```json\s*([\s\S]*?)\s*```/,
} as const;

export function parseReview(content: string, durationMs: number): ReviewResult {
  const score = extractScore(content);
  const verdict = extractVerdict(content);
  const criticalSection = extractCriticalSection(content);
  const criticalIssuesCount = countBulletPoints(criticalSection);
  const inlineComments = extractInlineComments(content);

  return {
    verdict,
    score,
    criticalIssuesCount,
    rawContent: content,
    inlineComments,
    durationMs,
  };
}

function extractScore(content: string): number {
  const match = SECTION_REGEX.score.exec(content);
  if (!match?.[1]) return 5;
  const raw = parseInt(match[1], 10);
  return Math.min(10, Math.max(1, raw));
}

function extractVerdict(content: string): Verdict {
  const match = SECTION_REGEX.verdict.exec(content);
  if (!match?.[1]) return 'APPROVED_WITH_SUGGESTIONS';

  const raw = match[1];
  if (raw === 'APPROVED') return 'APPROVED';
  if (raw === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED';
  return 'APPROVED_WITH_SUGGESTIONS';
}

function extractCriticalSection(content: string): string {
  const match = SECTION_REGEX.critical.exec(content);
  return match?.[1]?.trim() ?? '';
}

function countBulletPoints(section: string): number {
  if (!section || /nenhum problema crítico/i.test(section)) return 0;
  const matches = section.match(/^[-*•]\s/gm);
  return matches?.length ?? 0;
}

function extractInlineComments(content: string): readonly InlineComment[] {
  const match = SECTION_REGEX.inlineBlock.exec(content);
  if (!match?.[1]) return [];

  const jsonText = match[1].trim();
  if (!jsonText || jsonText === '[]') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return (parsed as unknown[])
    .filter(isRawInlineComment)
    .filter(isValidInlineComment)
    .map(
      (item): InlineComment => ({
        path: String(item.path),
        line: Number(item.line),
        body: String(item.body),
      }),
    );
}

function isRawInlineComment(item: unknown): item is RawInlineComment {
  if (typeof item !== 'object' || item === null) return false;
  return 'path' in item && 'line' in item && 'body' in item;
}

function isValidInlineComment(item: RawInlineComment): boolean {
  return (
    typeof item.path === 'string' &&
    item.path.length > 0 &&
    typeof item.line === 'number' &&
    Number.isInteger(item.line) &&
    item.line > 0 &&
    typeof item.body === 'string' &&
    item.body.length > 0
  );
}

export function buildCommentBody(reviewContent: string, marker: string): string {
  const now = new Date().toUTCString();
  return `${marker}
<div align="center">

![PR Review Bot](https://img.shields.io/badge/🤖%20PR%20Review%20Bot-AI%20Powered-purple?style=flat-square)

</div>

---

${reviewContent}

---

<sub>🕐 Reviewed at ${now} • Powered by [Claude](https://www.anthropic.com) via [PR Review Bot](https://github.com/marketplace)</sub>`;
}

export function verdictToEmoji(verdict: Verdict): string {
  switch (verdict) {
    case 'APPROVED':
      return '✅ APPROVED';
    case 'APPROVED_WITH_SUGGESTIONS':
      return '⚠️ APPROVED WITH SUGGESTIONS';
    case 'CHANGES_REQUESTED':
      return '🚫 CHANGES REQUESTED';
  }
}
