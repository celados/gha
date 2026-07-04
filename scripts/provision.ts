#!/usr/bin/env bun

// Onboards a celados project onto the Claude/Codex GitHub Actions
// integration: copies templates/agents.yml into the target repo, and — for
// private repos only, see README's "GitHub Free" section — sets the
// repo-level PRISM_* secret/variables read from this repo's local .env
// (gitignored; GitHub secrets are write-only, so .env or prism itself via
// SSH are the only two sources of truth for the plaintext key).

import { $ } from "bun";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "celados";
const GHA_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ENV_KEYS = [
  "PRISM_API_KEY",
  "PRISM_ANTHROPIC_BASE_URL",
  "PRISM_OPENAI_RESPONSES_ENDPOINT",
] as const;

type Env = Record<(typeof REQUIRED_ENV_KEYS)[number], string>;

function usage(): never {
  console.error("Usage: bun scripts/provision.ts <repo> [--path <local-checkout>] [--verify]");
  process.exit(1);
}

async function loadEnv(path: string): Promise<Env> {
  if (!existsSync(path)) {
    console.error(`Missing ${path} — see README's "Private model routing" section to create it.`);
    process.exit(1);
  }
  const text = await Bun.file(path).text();
  const parsed: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    parsed[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  for (const key of REQUIRED_ENV_KEYS) {
    if (!parsed[key]) {
      console.error(`${path} is missing ${key}.`);
      process.exit(1);
    }
  }
  return parsed as Env;
}

async function verifyRun(repo: string): Promise<void> {
  console.log("Posting a test issue (@claude hi)...");
  const issueUrl = (
    await $`gh issue create -R ${ORG}/${repo} --title "agents integration check" --body "@claude hi"`.text()
  ).trim();
  console.log(`  ${issueUrl}`);

  const deadline = Date.now() + 3 * 60 * 1000;
  let runId = "";
  while (Date.now() < deadline && !runId) {
    await Bun.sleep(5000);
    runId = (
      await $`gh run list -R ${ORG}/${repo} --event issues --limit 1 --json databaseId --jq '.[0].databaseId // empty'`.text()
    ).trim();
  }
  if (!runId) {
    console.error(
      "No workflow run appeared within 3 minutes — check the repo's Actions tab manually.",
    );
    return;
  }

  while (Date.now() < deadline) {
    const status = (
      await $`gh run view ${runId} -R ${ORG}/${repo} --json status,conclusion --jq '.status + " " + (.conclusion // "-")'`.text()
    ).trim();
    if (status.startsWith("completed")) {
      console.log(`Run ${runId}: ${status}`);
      return;
    }
    await Bun.sleep(5000);
  }
  console.error(`Run ${runId} did not complete within 3 minutes — check it manually.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith("--")) usage();

  const repo = args[0];
  let localPath = join(process.env.HOME ?? "", "workspace/projects", repo);
  let verify = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--path") localPath = args[++i];
    else if (args[i] === "--verify") verify = true;
    else usage();
  }

  const env = await loadEnv(join(GHA_ROOT, ".env"));

  if (!existsSync(join(localPath, ".git"))) {
    console.error(
      `${localPath} is not a git checkout. Clone ${ORG}/${repo} there first, or pass --path.`,
    );
    process.exit(1);
  }
  const remoteUrl = (await $`git -C ${localPath} remote get-url origin`.text()).trim();
  if (!remoteUrl.includes(`${ORG}/${repo}`)) {
    console.error(
      `${localPath}'s origin (${remoteUrl}) doesn't look like ${ORG}/${repo}. Pass --path to override.`,
    );
    process.exit(1);
  }

  const visibility = (await $`gh api repos/${ORG}/${repo} --jq .visibility`.text()).trim();
  const defaultBranch = (await $`gh api repos/${ORG}/${repo} --jq .default_branch`.text()).trim();
  console.log(`${ORG}/${repo}: ${visibility}, default branch ${defaultBranch}`);

  const originalBranch = (await $`git -C ${localPath} branch --show-current`.text()).trim();
  const onDefaultBranch = originalBranch === defaultBranch;
  if (!onDefaultBranch) {
    await $`git -C ${localPath} checkout ${defaultBranch}`;
    await $`git -C ${localPath} pull --ff-only`;
  }

  const templatePath = join(GHA_ROOT, "templates/agents.yml");
  const targetDir = join(localPath, ".github/workflows");
  const targetPath = join(targetDir, "agents.yml");
  await $`mkdir -p ${targetDir}`;

  const templateContent = await Bun.file(templatePath).text();
  const existing = existsSync(targetPath) ? await Bun.file(targetPath).text() : null;

  if (existing === templateContent) {
    console.log("agents.yml already up to date, nothing to commit.");
  } else {
    await Bun.write(targetPath, templateContent);
    await $`git -C ${localPath} add .github/workflows/agents.yml`;
    const staged = (await $`git -C ${localPath} diff --cached --name-only`.text()).trim();
    if (staged) {
      await $`git -C ${localPath} commit -m ${existing ? "Update Claude/Codex GitHub Actions integration" : "Add Claude/Codex GitHub Actions integration"}`;
      await $`git -C ${localPath} push origin ${defaultBranch}`;
      console.log("Pushed agents.yml.");
    }
  }

  if (!onDefaultBranch) {
    await $`git -C ${localPath} checkout ${originalBranch}`;
  }

  if (visibility === "private") {
    await $`gh secret set PRISM_API_KEY -R ${ORG}/${repo} --body ${env.PRISM_API_KEY}`;
    await $`gh variable set PRISM_ANTHROPIC_BASE_URL -R ${ORG}/${repo} --body ${env.PRISM_ANTHROPIC_BASE_URL}`;
    await $`gh variable set PRISM_OPENAI_RESPONSES_ENDPOINT -R ${ORG}/${repo} --body ${env.PRISM_OPENAI_RESPONSES_ENDPOINT}`;
    console.log(
      "Set repo-level PRISM_* secret/variables (private repo, GitHub Free org-secret limitation).",
    );
  } else {
    console.log(
      "Public repo — org-level PRISM_* config already applies, no repo-level secrets needed.",
    );
  }

  if (verify) await verifyRun(repo);
}

main();
