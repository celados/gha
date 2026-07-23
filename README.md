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
  [`openai/codex-action`](https://github.com/openai/codex-action). Handles both
  issue/comment mentions and explicit CI repair tasks, then validates the
  generated patch on a clean runner before opening a pull request. Hand-authored:
  no upstream issue/comment-triggered template exists to derive from.
- `.github/workflows/sync-upstream.yml` — weekly bot that re-fetches
  `anthropics/claude-code-action`'s `examples/claude.yml` and opens a PR here
  when it changes upstream, so `claude.yml` can be manually reconciled instead
  of silently drifting.
- `vendor/anthropics-claude-code-action/examples-claude.yml` — pristine mirror
  of the upstream template, used only as a diff target by the sync bot. Never
  executed.
- `templates/agents.yml` — the thin caller file a downstream project copies
  into its own `.github/workflows/agents.yml`. It should never need to change.
- `scripts/provision.ts` — onboards a new project (see below). Reads secrets
  from local `.env` (gitignored, not in this listing on purpose).

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

```bash
bun run provision <repo>            # e.g. bun run provision easel
bun run provision <repo> --verify   # also posts a test issue and waits for a green run
bun run provision <repo> --path /some/other/checkout
```

`scripts/provision.ts` does the whole thing: checks the repo's visibility,
copies `templates/agents.yml` into `<repo>/.github/workflows/agents.yml`
(committing/pushing only if it changed — safe to re-run), and — for private
repos only, see the GitHub Free section above — sets the repo-level
`PRISM_API_KEY`/`PRISM_ANTHROPIC_BASE_URL`/`PRISM_OPENAI_RESPONSES_ENDPOINT`
read from this repo's local `.env`. It assumes the target repo is already
cloned at `~/workspace/projects/<repo>` (override with `--path`).

If `.env` is missing (fresh checkout, no access to this machine's copy) the
script refuses to run rather than fabricate a key — copy `.env` over first,
or fall back to the manual `gh secret set`/`gh variable set` commands in the
GitHub Free section above with a key value you get from the human operator.

## Automated Codex tasks

`codex.yml` is also the shared runtime for trusted workflows that want to start
Codex without manufacturing an `@codex` event. Its small interface is:

- `task` — the work contract.
- `task_key` — a stable deduplication key and repair-branch identity.
- `context_artifact` — an optional caller-produced artifact unpacked into
  `.agent-context`.
- `tracking_issue` — an optional issue that receives the result and PR link.

Domain facts do not become workflow inputs. For example, an upstream SHA or a
failed build phase belongs in `.agent-context/task.json`; logs and other compact
evidence live beside it. This keeps the reusable interface stable while letting
each caller prepare the evidence its agent actually needs.

The Codex runner can write only inside the workspace, cannot read `.env` files,
has no sudo, and can reach only GitHub download/API domains. It never receives
the token used to mutate GitHub. Its actual workspace diff and final message are
uploaded as an artifact; a clean runner validates protected paths, applies the
patch, pushes a deduplicated branch, and opens a PR. This deliberately does not
trust the model to serialize the patch into its final response. Workflow and
local-action changes are rejected unless the caller explicitly sets
`allow_workflow_changes`.

GitHub disables PR creation by `GITHUB_TOKEN` by default. When that repository
setting remains off, the branch is still pushed and the tracking issue receives
a compare link that a maintainer can use to open the PR. Enable **Allow GitHub
Actions to create and approve pull requests** only for repositories where fully
automatic PR creation is intended.

## Why reusable workflows instead of copy-paste

Copying a workflow file into every repo means every future upstream change
(new trigger event, corrected permissions, new input) has to be re-copied
everywhere by hand. A `workflow_call` reusable workflow inverts that: the
caller file is inert, and all the logic that actually changes lives in one
place.
