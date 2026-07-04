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

The plaintext also lives in this repo's local `.env` (gitignored — see
"Onboarding a new project" below) so onboarding a new repo doesn't need SSH
each time. GitHub secrets are write-only — there's no API to read
`PRISM_API_KEY` back out once it's stored as an org/repo secret — so `.env`
or prism itself (via SSH) are the only two sources of truth for the
plaintext.

To mint a new/replacement key: `ssh -p 2222 root@204.168.246.193 'cd /opt/prism
&& docker compose exec prism prism account key create --label <consumer>'`,
then `gh secret set PRISM_API_KEY --org celados --visibility all` and update
the local `.env`.

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

## Onboarding a new project

This section is written for an agent to execute directly — if you're a fresh
Claude Code session being pointed at this repo to integrate some other
project, follow these steps in order.

1. `gh api repos/celados/<repo> --jq .visibility` to check visibility.
2. Copy `templates/agents.yml` to `<repo>/.github/workflows/agents.yml`,
   commit, push (mind any in-progress uncommitted work already in that repo —
   stage only this one file, don't `git add -A`).
3. **If public**: done. The org-level `PRISM_*` config already applies —
   verify with step 4 and stop.
4. **If private** (see the GitHub Free section above for why this is
   necessary): read this repo's local `.env` (gitignored, never committed —
   it holds the plaintext `PRISM_API_KEY`) and run:
   ```bash
   source .env  # or read PRISM_API_KEY from it however's convenient
   gh secret set PRISM_API_KEY -R celados/<repo> --body "$PRISM_API_KEY"
   gh variable set PRISM_ANTHROPIC_BASE_URL -R celados/<repo> --body "https://ai.celados.com/api/anthropic"
   gh variable set PRISM_OPENAI_RESPONSES_ENDPOINT -R celados/<repo> --body "https://ai.celados.com/api/openai/responses"
   ```
   If `.env` isn't present (fresh checkout, sandboxed session with no access
   to this machine's copy) ask the human operator to paste the current
   `PRISM_API_KEY` value — never fabricate or reuse a placeholder, a wrong
   key fails closed (401), not silently.
5. Verify: open an issue (or comment on one) with `@claude hi`, then
   `gh run list -R celados/<repo> --limit 3` and `gh run view <id> -R
   celados/<repo>` until it shows `completed success`. Repeat with `@codex hi`
   for the other job. Don't report the integration as done without this step
   — a missing secret/variable fails the job, not the push.

## Why reusable workflows instead of copy-paste

Copying a workflow file into every repo means every future upstream change
(new trigger event, corrected permissions, new input) has to be re-copied
everywhere by hand. A `workflow_call` reusable workflow inverts that: the
caller file is inert, and all the logic that actually changes lives in one
place.
