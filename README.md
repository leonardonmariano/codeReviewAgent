# PR Review Bot

An AI-powered GitHub Action that automatically reviews every Pull Request using Claude. Posts a structured, senior-developer-style review with a score, verdict, and inline code suggestions — directly in your PR.

## Quick Start

1. Add your Anthropic API key to your repository secrets as `ANTHROPIC_API_KEY`.

2. Create `.github/workflows/pr-review.yml`:

```yaml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    name: AI Code Review
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      statuses: write

    steps:
      - uses: actions/checkout@v4

      - name: AI Review
        uses: your-username/pr-review-bot@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it. The bot will post a full review on every PR.

---

## What the Review Looks Like

The bot posts a structured comment with these sections:

| Section | Description |
|---|---|
| 📋 **Resumo** | 2-3 sentences on what the PR does and its overall quality |
| ✅ **Pontos Positivos** | Specific things done well |
| 🚨 **Problemas Críticos** | Blocking bugs, security holes, or broken logic |
| ⚠️ **Melhorias Sugeridas** | Non-blocking improvements |
| 💡 **Sugestões com Código** | Concrete code fixes with syntax highlighting |
| 🔒 **Segurança** | Checklist: SQL injection, XSS, secrets, auth, etc. |
| 📊 **Avaliação Final** | Score (1-10) + Verdict (APPROVED / APPROVED_WITH_SUGGESTIONS / CHANGES_REQUESTED) |

Inline comments are also posted at specific lines for the most critical issues.

The commit status is updated to reflect the verdict:
- ✅ `success` — APPROVED or APPROVED_WITH_SUGGESTIONS
- ❌ `failure` — CHANGES_REQUESTED

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | — | Use `${{ secrets.GITHUB_TOKEN }}` |
| `anthropic-api-key` | ✅ | — | Your Anthropic API key |
| `max-files` | ❌ | `30` | Max files to include in the review |
| `max-diff-lines` | ❌ | `500` | Max diff lines per file before truncation |
| `severity-threshold` | ❌ | `warning` | `critical` or `warning` |
| `ignored-patterns` | ❌ | `''` | Newline-separated regex patterns to skip |

## Outputs

| Output | Description |
|---|---|
| `verdict` | `APPROVED`, `APPROVED_WITH_SUGGESTIONS`, or `CHANGES_REQUESTED` |
| `score` | Review score from `1` to `10` |
| `critical-issues` | Number of critical issues found |
| `review-url` | URL of the reviewed PR |

---

## Advanced Configuration

### Ignore specific files or directories

```yaml
- name: AI Review
  uses: your-username/pr-review-bot@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    ignored-patterns: |
      ^docs/
      \.generated\.ts$
      ^migrations/
      ^e2e/
```

### Only run on large PRs

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    if: github.event.pull_request.additions > 50
    ...
```

### Use the verdict in subsequent steps

```yaml
- name: AI Review
  id: review
  uses: your-username/pr-review-bot@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Block merge on critical issues
  if: steps.review.outputs.verdict == 'CHANGES_REQUESTED'
  run: exit 1
```

---

## What Gets Ignored Automatically

These are always excluded (no configuration needed):

- Lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, etc.
- Build output: `dist/`, `build/`, `.next/`, `out/`, `coverage/`
- Minified files: `*.min.js`, `*.min.css`, `*.map`
- Binary/media: images, fonts, audio, video, PDFs, archives
- Dependencies: `node_modules/`, `vendor/`

---

## Permissions Required

The `GITHUB_TOKEN` needs these permissions (GitHub grants them automatically for the default token):

```yaml
permissions:
  contents: read        # checkout
  pull-requests: write  # post comments, inline review comments
  statuses: write       # set commit status check
```

---

## FAQ

**Does it post a new comment on every push?**
No — it finds and updates its existing comment, keeping the PR thread clean.

**Does it re-review if only docs changed?**
The bot filters out documentation-only changes along with lock files, generated files, and binaries. If all changed files are filtered, the review is skipped.

**How long does a review take?**
Typically 30-90 seconds depending on diff size. The action times out gracefully at 3 minutes.

**What model does it use?**
Claude Sonnet 4.6 via the Anthropic API.

**Is my code sent to Anthropic?**
Yes — the diff is sent to the Anthropic API for analysis, subject to [Anthropic's privacy policy](https://www.anthropic.com/privacy). Do not use this action on repositories containing secrets in the code or if your organization prohibits third-party AI services.

---

## License

MIT
