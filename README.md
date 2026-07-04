# gha

Central home for Claude Code / Codex GitHub Actions integration, shared across
every repo under `celados` (and friends). Projects call these as reusable
workflows instead of vendoring their own copies — update once here, every
caller picks it up on its next trigger.

## Layout

- `.github/workflows/claude.yml` — reusable workflow wrapping
  [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action).
  Derived from that repo's `examples/claude.yml`.
- `.github/workflows/codex.yml` — reusable workflow wrapping
  [`openai/codex-action`](https://github.com/openai/codex-action). Hand-authored:
  no upstream issue/comment-triggered template exists to derive from (see
  `.github/workflows/codex.yml`'s header comment).
- `.github/workflows/sync-upstream.yml` — weekly bot that re-fetches
  `anthropics/claude-code-action`'s `examples/claude.yml` and opens a PR here
  when it changes upstream, so `claude.yml` can be manually reconciled instead
  of silently drifting.
- `vendor/anthropics-claude-code-action/examples-claude.yml` — pristine mirror
  of the upstream template, used only as a diff target by the sync bot. Never
  executed.
- `templates/agents.yml` — the thin caller file a downstream project copies
  into its own `.github/workflows/agents.yml`. It should never need to change.

## Private model routing

Both workflows point at our own [prism](https://github.com/celados/prism)
gateway (`https://ai.celados.com/api`, deployed per
`prism/docs/deployment-ops1.md`), not the official Anthropic/OpenAI APIs.
`celados` org-level config (already set, `--visibility all`):

- `PRISM_API_KEY` (secret) — one prism account key (label `gha-celados`),
  valid across all of prism's wires.
- `PRISM_ANTHROPIC_BASE_URL` (variable) — `https://ai.celados.com/api/anthropic`
- `PRISM_OPENAI_RESPONSES_ENDPOINT` (variable) —
  `https://ai.celados.com/api/openai/responses`

To mint a new/replacement key: `ssh -p 2222 root@204.168.246.193 'cd /opt/prism
&& docker compose exec prism prism account key create --label <consumer>'`,
then `gh secret set PRISM_API_KEY --org celados --visibility all`.

### GitHub Free: org secrets/variables don't reach private repos

`celados` is on GitHub Free. Per GitHub's docs (one easy-to-miss line):
**organization-level secrets and variables are not accessible by private
repositories on GitHub Free** — the plan, not a config mistake. GitHub doesn't
error on this; the value just silently resolves to an empty string at
runtime, even though `gh secret list --org` and the
`repos/<owner>/<repo>/actions/organization-secrets` API both claim the repo
has access. Confirmed empirically (`easel`, private) with a throwaway
`workflow_dispatch` probe that echoed `${{ secrets.PRISM_API_KEY }}`'s length.

Public repos (`devjar`, `mcpx`, `gha` itself) are unaffected and need no
per-repo setup. **Private repos need their own repo-level copies** of all
three (secret + 2 variables) — the org-level config is dead weight for them:

```bash
gh secret set PRISM_API_KEY -R celados/<repo> --body "<key>"
gh variable set PRISM_ANTHROPIC_BASE_URL -R celados/<repo> --body "https://ai.celados.com/api/anthropic"
gh variable set PRISM_OPENAI_RESPONSES_ENDPOINT -R celados/<repo> --body "https://ai.celados.com/api/openai/responses"
```

The real fix is upgrading `celados` to GitHub Team, which makes the org-level
config actually work for private repos and removes this whole section — ask
before doing that, it's a recurring paid decision, not something to script
silently.

## Per-repo setup

1. Copy `templates/agents.yml` to `<project>/.github/workflows/agents.yml`.
2. If the repo is **public**: nothing else, the org-level config already
   covers it. If it's **private**: run the three `gh secret set`/`gh variable
   set` commands above first (see the GitHub Free caveat).
3. Push. Mention `@claude` or `@codex` in an issue or PR comment to trigger.

## Why reusable workflows instead of copy-paste

Copying a workflow file into every repo means every future upstream change
(new trigger event, corrected permissions, new input) has to be re-copied
everywhere by hand. A `workflow_call` reusable workflow inverts that: the
caller file is inert, and all the logic that actually changes lives in one
place.
