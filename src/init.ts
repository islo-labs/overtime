import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const CRED_DIR = resolve(homedir(), ".cronai");
const CRED_FILE = resolve(CRED_DIR, "credentials.json");

async function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

export async function init() {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log("\n  cronai — cron for AI agents\n");
  console.log("  Let's get you set up.\n");

  const creds: Record<string, string> = {};

  // Slack — the only integration cronai itself uses
  console.log("  1. Slack notifications (get notified when crons finish)");
  console.log("     Create a webhook at: https://api.slack.com/messaging/webhooks\n");
  const slackUrl = await ask(rl, "  Slack webhook URL (enter to skip): ");
  if (slackUrl) creds.slackWebhookUrl = slackUrl;

  console.log();

  // GitHub/Linear — passed to the agent as env vars
  // Skip if user already has MCP servers or gh CLI configured
  console.log("  2. API tokens (skip if you use MCP servers or have gh CLI set up)");
  console.log("     These are passed to Claude as env vars so it can call APIs directly.\n");

  const ghToken = await ask(rl, "  GitHub token (enter to skip): ");
  if (ghToken) creds.githubToken = ghToken;

  const linearKey = await ask(rl, "  Linear API key (enter to skip): ");
  if (linearKey) creds.linearApiKey = linearKey;

  console.log();

  if (Object.keys(creds).length > 0) {
    mkdirSync(CRED_DIR, { recursive: true });
    writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2) + "\n", {
      mode: 0o600,
    });
    console.log(`  ✓ Credentials saved to ${CRED_FILE}\n`);
  }

  const configPath = resolve("cronai.yml");
  if (existsSync(configPath)) {
    console.log(`  cronai.yml already exists, skipping.\n`);
  } else {
    console.log("  3. Let's create your first cron.\n");

    const name = (await ask(rl, "  Cron name (e.g. pr-review): ")) || "pr-review";
    const schedule =
      (await ask(rl, "  How often? (e.g. every day at 9am): ")) ||
      "every day at 9am";
    const task =
      (await ask(rl, "  What should the agent do?\n     ")) ||
      "Review open PRs in this repo and leave comments";

    const notify = slackUrl ? "\n    notify: slack" : "";

    const yml = `crons:
  - name: ${name}
    schedule: "${schedule}"
    task: "${task}"${notify}
`;

    writeFileSync(configPath, yml);
    console.log(`\n  ✓ Created cronai.yml\n`);
  }

  console.log("  You're all set! Run:\n");
  console.log("    cron-ai             # start the dashboard");
  console.log("    cron-airun pr-review # test a cron now\n");

  rl.close();
}
