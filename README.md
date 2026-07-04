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

## Per-repo setup

1. Copy `templates/agents.yml` to `<project>/.github/workflows/agents.yml`.
2. Make sure the repo (or its org) has `ANTHROPIC_API_KEY` (or
   `CLAUDE_CODE_OAUTH_TOKEN`) and `OPENAI_API_KEY` available as secrets —
   prefer org-level secrets so new repos need zero setup.
3. Push. Mention `@claude` or `@codex` in an issue or PR comment to trigger.

## Why reusable workflows instead of copy-paste

Copying a workflow file into every repo means every future upstream change
(new trigger event, corrected permissions, new input) has to be re-copied
everywhere by hand. A `workflow_call` reusable workflow inverts that: the
caller file is inert, and all the logic that actually changes lives in one
place.
