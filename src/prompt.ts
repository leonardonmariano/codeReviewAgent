import type { PRContext, ActionInputs, FileChange } from './types';

export const BOT_COMMENT_MARKER = '<!-- pr-review-bot -->';

export function getBotCommentMarker(): string {
  return BOT_COMMENT_MARKER;
}

export function buildSystemPrompt(): string {
  return `You are a senior software engineer with 10+ years of experience performing thorough, production-focused code reviews. You have seen systems fail in production, security vulnerabilities exploited, and technical debt compound over years.

Your code reviews are:
- **Specific**: Reference exact files, functions, and line numbers from the diff
- **Actionable**: Every criticism includes a concrete suggestion for how to fix it
- **Balanced**: Acknowledge good work — only criticizing everything is not helpful
- **Prioritized**: Clearly distinguish blocking issues from nice-to-haves
- **Context-aware**: Consider the impact on the codebase, users, and future maintainers

You respond ONLY in the exact format specified by the user. You never add extra sections, commentary, or text outside the specified format.`;
}

export function buildUserPrompt(context: PRContext, _inputs: ActionInputs): string {
  const filesSummary = buildFilesSummary(context.files);
  const diffContent = buildDiffContent(context.files);
  const commitsContent = buildCommitsContent(context.commits);
  const totalChanges = context.files.reduce(
    (acc, f) => ({ add: acc.add + f.additions, del: acc.del + f.deletions }),
    { add: 0, del: 0 },
  );

  return `# Pull Request Review Request

**Repository:** \`${context.owner}/${context.repo}\`
**PR #${context.pullNumber}:** ${context.title}
**Author:** ${context.author}
**Branch:** \`${context.headBranch}\` → \`${context.baseBranch}\`
**Changes:** +${totalChanges.add} / -${totalChanges.del} across ${context.files.length} file(s)

## PR Description
${context.description.trim() || '_No description provided._'}

## Commits (latest ${Math.min(context.commits.length, 10)})
${commitsContent}

## Modified Files (${context.files.length})
${filesSummary}

## Full Diffs
${diffContent}

---

Review this PR thoroughly and respond in EXACTLY this format (no extra text, no extra sections):

## 📋 Resumo
[2-3 sentences describing what this PR does, why it exists, and its overall quality]

## ✅ Pontos Positivos
[Bullet list of what was done well. Always include at least one genuine positive point. Be specific — reference actual code.]

## 🚨 Problemas Críticos
[Bullet list of bugs, security vulnerabilities, data corruption risks, or broken logic that MUST be fixed before merging. Reference the specific file and line. If none exist, write exactly: "Nenhum problema crítico encontrado."]

## ⚠️ Melhorias Sugeridas
[Bullet list of non-blocking improvements: code smells, performance opportunities, readability, naming, missing error handling. If none, write exactly: "Nenhuma melhoria sugerida."]

## 💡 Sugestões com Código
[For each critical issue and each significant improvement, show a code block with the fix. Use the correct language syntax highlighting. If no suggestions, write exactly: "Nenhuma sugestão de código."]

## 🔒 Segurança
Rate each item as ✅ (OK/not applicable), ⚠️ (potential concern), or ❌ (confirmed issue):
- **SQL Injection:**
- **XSS / HTML Injection:**
- **Secrets/credentials exposed:**
- **Input validation:**
- **Authentication/Authorization:**
- **Sensitive data in logs:**
- **Dependency vulnerabilities:**

## 📊 Avaliação Final
**Score:** [NUMBER]/10
**Veredicto:** [APPROVED | APPROVED_WITH_SUGGESTIONS | CHANGES_REQUESTED]

[2-3 sentences justifying the score and verdict. Be direct and honest.]

## 🔍 Comentários Inline
\`\`\`json
[{"path": "path/to/file.ts", "line": 42, "body": "Specific, concise comment about this line"}]
\`\`\`
Include inline comments ONLY for: (1) the most critical bugs at their exact location, (2) very specific code-level suggestions tied to a line. Use an empty array [] if no targeted line comments are warranted.`;
}

function buildFilesSummary(files: readonly FileChange[]): string {
  return files
    .map((f) => {
      const icon =
        f.status === 'added' ? '✚' : f.status === 'removed' ? '✖' : '●';
      const truncNote = f.isTruncated ? ' _(diff truncated — file too large)_' : '';
      const prev = f.previousFilename ? ` _(was: ${f.previousFilename})_` : '';
      return `- ${icon} \`${f.filename}\` +${f.additions}/-${f.deletions}${prev}${truncNote}`;
    })
    .join('\n');
}

function buildDiffContent(files: readonly FileChange[]): string {
  const filesWithDiff = files.filter((f) => f.patch !== undefined && f.patch.length > 0);

  if (filesWithDiff.length === 0) {
    return '_No diff content available._';
  }

  return filesWithDiff
    .map((f) => {
      return `### \`${f.filename}\`\n\`\`\`diff\n${f.patch ?? ''}\n\`\`\``;
    })
    .join('\n\n');
}

function buildCommitsContent(commits: readonly PRContext['commits'][number][]): string {
  if (commits.length === 0) return '_No commits._';
  return commits
    .slice(0, 10)
    .map((c) => `- \`${c.sha.slice(0, 7)}\` **${c.message.split('\n')[0]}** — _${c.author}_`)
    .join('\n');
}
