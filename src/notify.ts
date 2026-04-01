import type { JobResult } from "./runner.js";

export async function notifySlack(
  jobName: string,
  result: JobResult
): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
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
