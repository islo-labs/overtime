import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const CRED_DIR = resolve(homedir(), ".overtime");
const CRED_FILE = resolve(CRED_DIR, "credentials.json");

async function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

export async function init() {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log("\n  overtime — cron for AI agents\n");
  console.log("  Let's get you set up.\n");

  // --- Credentials ---

  const creds: Record<string, string> = {};

  // GitHub
  console.log("  1. GitHub (so agents can open PRs, review code, etc.)");
  console.log("     Create a token at: https://github.com/settings/tokens");
  console.log("     Scopes needed: repo, read:org\n");
  const ghToken = await ask(rl, "  GitHub token (enter to skip): ");
  if (ghToken) creds.githubToken = ghToken;

  console.log();

  // Linear
  console.log("  2. Linear (so agents can triage bugs, create issues, etc.)");
  console.log("     Create a key at: https://linear.app/settings/api\n");
  const linearKey = await ask(rl, "  Linear API key (enter to skip): ");
  if (linearKey) creds.linearApiKey = linearKey;

  console.log();

  // Slack
  console.log("  3. Slack notifications (get notified when jobs finish)");
  console.log("     Create a webhook at: https://api.slack.com/messaging/webhooks\n");
  const slackUrl = await ask(rl, "  Slack webhook URL (enter to skip): ");
  if (slackUrl) creds.slackWebhookUrl = slackUrl;

  console.log();

  // JIRA
  console.log("  4. JIRA (create issues when jobs complete or fail)");
  console.log("     Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens\n");
  const jiraBaseUrl = await ask(rl, "  JIRA base URL (e.g. https://mycompany.atlassian.net, enter to skip): ");
  if (jiraBaseUrl) {
    creds.jiraBaseUrl = jiraBaseUrl;
    const jiraEmail = await ask(rl, "  JIRA email: ");
    if (jiraEmail) creds.jiraEmail = jiraEmail;
    const jiraApiToken = await ask(rl, "  JIRA API token: ");
    if (jiraApiToken) creds.jiraApiToken = jiraApiToken;
    const jiraProjectKey = await ask(rl, "  JIRA project key (e.g. OPS): ");
    if (jiraProjectKey) creds.jiraProjectKey = jiraProjectKey;
  }

  console.log();

  // Save credentials
  if (Object.keys(creds).length > 0) {
    mkdirSync(CRED_DIR, { recursive: true });
    writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2) + "\n", {
      mode: 0o600,
    });
    console.log(`  ✓ Credentials saved to ${CRED_FILE}\n`);
  }

  // --- Create overtime.yml ---

  const configPath = resolve("overtime.yml");
  if (existsSync(configPath)) {
    console.log(`  overtime.yml already exists, skipping.\n`);
  } else {
    console.log("  5. Let's create your first job.\n");

    const name = (await ask(rl, "  Job name (e.g. pr-review): ")) || "my-job";
    const schedule =
      (await ask(rl, "  How often? (e.g. every day at 9am): ")) ||
      "every day at 9am";
    const task =
      (await ask(rl, "  What should the agent do?\n     ")) ||
      "Review open PRs in this repo and leave comments";

    const notifyValue = slackUrl ? "slack" : jiraBaseUrl ? "jira" : "";
    const notify = notifyValue ? `\n    notify: ${notifyValue}` : "";

    const yml = `jobs:
  - name: ${name}
    schedule: "${schedule}"
    task: "${task}"${notify}
`;

    writeFileSync(configPath, yml);
    console.log(`\n  ✓ Created overtime.yml\n`);
  }

  console.log("  You're all set! Run:\n");
  console.log("    overtime        # start the dashboard");
  console.log("    overtime run " + "my-job" + "  # test a job now\n");

  rl.close();
}
