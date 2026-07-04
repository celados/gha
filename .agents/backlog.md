# Deferred Work

- `codex.yml` has no upstream template to sync against — `openai/codex-action` publishes no issue/comment-triggered example (only sandbox-hardening demos and a PR-opened review bot). Revisit if OpenAI ever ships one, or if `openai/codex-action`'s `action.yml` gains a `trigger_phrase`-equivalent input worth adopting.
- `sync-upstream.yml` only tracks `anthropics/claude-code-action`'s `examples/claude.yml`. It does not watch `action.yml` for new/changed inputs (e.g. new auth methods), nor does it track `openai/codex-action` at all since there's nothing there to diff against yet.
- `templates/agents.yml` assumes the calling repo already has `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`/`OPENAI_API_KEY` available (ideally via org-level secrets). No first-run validation exists yet — a repo missing secrets will just fail silently-ish at the action step.
