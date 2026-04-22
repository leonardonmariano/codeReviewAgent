import { describe, it, expect } from 'vitest';
import { parseReview, buildCommentBody, verdictToEmoji } from '../src/parser';

const FULL_REVIEW = `## 📋 Resumo
This PR adds a login endpoint. Overall quality is good.

## ✅ Pontos Positivos
- Good use of TypeScript types
- Clear variable naming

## 🚨 Problemas Críticos
- Missing input validation on line 42

## ⚠️ Melhorias Sugeridas
- Consider adding rate limiting

## 💡 Sugestões com Código
\`\`\`typescript
// add validation
\`\`\`

## 🔒 Segurança
- **SQL Injection:** ✅
- **XSS / HTML Injection:** ✅
- **Secrets/credentials exposed:** ✅
- **Input validation:** ❌
- **Authentication/Authorization:** ✅
- **Sensitive data in logs:** ✅
- **Dependency vulnerabilities:** ✅

## 📊 Avaliação Final
**Score:** 7/10
**Veredicto:** APPROVED_WITH_SUGGESTIONS

Good PR but needs input validation before merging.

## 🔍 Comentários Inline
\`\`\`json
[{"path": "src/auth.ts", "line": 42, "body": "Missing validation here"}]
\`\`\``;

describe('parseReview', () => {
  it('extracts score correctly', () => {
    const result = parseReview(FULL_REVIEW, 1000);
    expect(result.score).toBe(7);
  });

  it('extracts verdict correctly', () => {
    const result = parseReview(FULL_REVIEW, 1000);
    expect(result.verdict).toBe('APPROVED_WITH_SUGGESTIONS');
  });

  it('counts critical issues', () => {
    const result = parseReview(FULL_REVIEW, 1000);
    expect(result.criticalIssuesCount).toBe(1);
  });

  it('extracts inline comments', () => {
    const result = parseReview(FULL_REVIEW, 1000);
    expect(result.inlineComments).toHaveLength(1);
    expect(result.inlineComments[0]).toEqual({
      path: 'src/auth.ts',
      line: 42,
      body: 'Missing validation here',
    });
  });

  it('stores duration', () => {
    const result = parseReview(FULL_REVIEW, 2500);
    expect(result.durationMs).toBe(2500);
  });

  it('stores raw content', () => {
    const result = parseReview(FULL_REVIEW, 1000);
    expect(result.rawContent).toBe(FULL_REVIEW);
  });

  it('defaults score to 5 when missing', () => {
    const result = parseReview('No score here', 1000);
    expect(result.score).toBe(5);
  });

  it('defaults verdict to APPROVED_WITH_SUGGESTIONS when missing', () => {
    const result = parseReview('No verdict here', 1000);
    expect(result.verdict).toBe('APPROVED_WITH_SUGGESTIONS');
  });

  it('returns 0 critical issues when section says nenhum', () => {
    const content = FULL_REVIEW.replace(
      '- Missing input validation on line 42',
      'Nenhum problema crítico encontrado.',
    );
    const result = parseReview(content, 1000);
    expect(result.criticalIssuesCount).toBe(0);
  });

  it('clamps score to valid range', () => {
    const highScore = FULL_REVIEW.replace('**Score:** 7/10', '**Score:** 99/10');
    expect(parseReview(highScore, 1000).score).toBe(10);

    const lowScore = FULL_REVIEW.replace('**Score:** 7/10', '**Score:** 0/10');
    expect(parseReview(lowScore, 1000).score).toBe(1);
  });

  it('returns empty inline comments for invalid JSON', () => {
    const content = FULL_REVIEW.replace(
      '[{"path": "src/auth.ts", "line": 42, "body": "Missing validation here"}]',
      'not valid json',
    );
    const result = parseReview(content, 1000);
    expect(result.inlineComments).toHaveLength(0);
  });

  it('returns empty inline comments for empty array', () => {
    const content = FULL_REVIEW.replace(
      '[{"path": "src/auth.ts", "line": 42, "body": "Missing validation here"}]',
      '[]',
    );
    const result = parseReview(content, 1000);
    expect(result.inlineComments).toHaveLength(0);
  });

  it('filters out inline comments with invalid fields', () => {
    const content = FULL_REVIEW.replace(
      '[{"path": "src/auth.ts", "line": 42, "body": "Missing validation here"}]',
      '[{"path": "", "line": 42, "body": "empty path"}, {"path": "valid.ts", "line": -1, "body": "negative line"}, {"path": "valid.ts", "line": 5, "body": "ok"}]',
    );
    const result = parseReview(content, 1000);
    expect(result.inlineComments).toHaveLength(1);
    expect(result.inlineComments[0]?.path).toBe('valid.ts');
  });

  it('extracts APPROVED verdict', () => {
    const content = FULL_REVIEW.replace('**Veredicto:** APPROVED_WITH_SUGGESTIONS', '**Veredicto:** APPROVED');
    expect(parseReview(content, 1000).verdict).toBe('APPROVED');
  });

  it('extracts CHANGES_REQUESTED verdict', () => {
    const content = FULL_REVIEW.replace('**Veredicto:** APPROVED_WITH_SUGGESTIONS', '**Veredicto:** CHANGES_REQUESTED');
    expect(parseReview(content, 1000).verdict).toBe('CHANGES_REQUESTED');
  });
});

describe('buildCommentBody', () => {
  it('includes marker', () => {
    const body = buildCommentBody('review content', '<!-- marker -->');
    expect(body).toContain('<!-- marker -->');
  });

  it('includes review content', () => {
    const body = buildCommentBody('my review here', '<!-- marker -->');
    expect(body).toContain('my review here');
  });

  it('includes timestamp', () => {
    const body = buildCommentBody('content', '<!-- marker -->');
    expect(body).toMatch(/Reviewed at .+/);
  });
});

describe('verdictToEmoji', () => {
  it('maps APPROVED', () => {
    expect(verdictToEmoji('APPROVED')).toBe('✅ APPROVED');
  });

  it('maps APPROVED_WITH_SUGGESTIONS', () => {
    expect(verdictToEmoji('APPROVED_WITH_SUGGESTIONS')).toBe('⚠️ APPROVED WITH SUGGESTIONS');
  });

  it('maps CHANGES_REQUESTED', () => {
    expect(verdictToEmoji('CHANGES_REQUESTED')).toBe('🚫 CHANGES REQUESTED');
  });
});
