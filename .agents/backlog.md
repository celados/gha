# Deferred Work

- `codex.yml` has no upstream template to sync against — `openai/codex-action` publishes no issue/comment-triggered example (only sandbox-hardening demos and a PR-opened review bot). Revisit if OpenAI ever ships one, or if `openai/codex-action`'s `action.yml` gains a `trigger_phrase`-equivalent input worth adopting.
- `sync-upstream.yml` only tracks `anthropics/claude-code-action`'s `examples/claude.yml`. It does not watch `action.yml` for new/changed inputs (e.g. new auth methods), nor does it track `openai/codex-action` at all since there's nothing there to diff against yet.
- `templates/agents.yml` assumes `PRISM_API_KEY`/`PRISM_ANTHROPIC_BASE_URL`/`PRISM_OPENAI_RESPONSES_ENDPOINT` are already visible (true for `celados` org repos now; not true for `AIGC-Hackers` or personal-account repos like `ethan-huo/boxsh` — those need their own copies or a fallback to direct Anthropic/OpenAI auth). No first-run validation exists yet — a repo missing them just fails at the action step.
- `codex.yml` hardcodes `model: glm` because prism's `openai-responses` wire only routes that alias today (see `prism`'s `config.jsonc`). Revisit if prism adds more models to that wire.
