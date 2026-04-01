import type { JobResult } from "./runner.js";
import type { Credentials } from "./config.js";

export async function notifySlack(
  jobName: string,
  result: JobResult,
  credentials?: Credentials
): Promise<void> {
  const webhook = credentials?.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const status = result.success ? ":white_check_mark: Success" : ":x: Failed";
  const duration = (result.durationMs / 1000).toFixed(1);
  const cost = result.cost ? ` | $${result.cost.toFixed(4)}` : "";
  const output = result.output.slice(0, 500);

  const text = [
    `*${jobName}* — ${status}`,
    `Duration: ${duration}s${cost}`,
    output ? `\`\`\`${output}\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error(`Slack notification failed: ${(err as Error).message}`);
  }
}

export async function notifyJira(
  jobName: string,
  result: JobResult,
  credentials?: Credentials
): Promise<void> {
  const baseUrl = credentials?.jiraBaseUrl ?? process.env.JIRA_BASE_URL;
  const email = credentials?.jiraEmail ?? process.env.JIRA_EMAIL;
  const apiToken = credentials?.jiraApiToken ?? process.env.JIRA_API_TOKEN;
  const projectKey = credentials?.jiraProjectKey ?? process.env.JIRA_PROJECT_KEY;

  if (!baseUrl || !email || !apiToken || !projectKey) return;

  const status = result.success ? "Success" : "Failed";
  const issueType = result.success ? "Task" : "Bug";
  const duration = (result.durationMs / 1000).toFixed(1);
  const cost = result.cost ? ` | $${result.cost.toFixed(4)}` : "";
  const summary = `[overtime] ${jobName} — ${status} (${duration}s${cost})`;
  const bodyText = result.output.slice(0, 1000) || `Job ${status.toLowerCase()} with no output.`;

  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  try {
    await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary,
          description: {
            version: 1,
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: bodyText }],
              },
            ],
          },
          issuetype: { name: issueType },
        },
      }),
    });
  } catch (err) {
    console.error(`JIRA notification failed: ${(err as Error).message}`);
  }
}
