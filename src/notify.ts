import type { JobResult } from "./runner.js";
import type { Credentials } from "./config.js";

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function trimOutput(output: string, max = 2800): string {
  if (!output) return "";
  // The tail of the output has the actual results (PR links, summaries, etc.)
  const trimmed = output.length > max ? "…" + output.slice(-max) : output;
  return trimmed.trim();
}

export async function notifySlack(
  jobName: string,
  result: JobResult,
  credentials?: Credentials
): Promise<void> {
  const webhook = credentials?.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const ok = result.success;
  const statusEmoji = ok ? ":white_check_mark:" : ":x:";
  const statusText = ok ? "Success" : "Failed";
  const duration = formatDuration(result.durationMs);
  const output = trimOutput(result.output);

  const fields = [
    { type: "mrkdwn", text: `:stopwatch:  *Duration*\n${duration}` },
  ];
  if (result.cost != null) {
    fields.push({ type: "mrkdwn", text: `:moneybag:  *Cost*\n$${result.cost.toFixed(4)}` });
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${jobName}  —  ${statusText}`, emoji: true },
    },
    { type: "section", fields },
  ];

  if (output) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`${output}\`\`\`` },
      }
    );
  }

  if (result.error && !ok) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `:warning: *Error*\n\`\`\`${result.error.slice(0, 500)}\`\`\`` },
      }
    );
  }

  if (result.sessionId) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:link:  *Resume session:*  \`claude --resume ${result.sessionId}\``,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `${statusEmoji}  CronAI  •  ${new Date().toLocaleString()}` },
    ],
  });

  // Fallback text for notifications / non-Block Kit clients
  const text = `${jobName} — ${statusText} (${duration}${result.cost ? ` | $${result.cost.toFixed(4)}` : ""})`;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });
  } catch (err) {
    console.error(`Slack notification failed: ${(err as Error).message}`);
  }
}
