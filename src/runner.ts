import { spawn } from "node:child_process";
import type { ShiftConfig, Credentials } from "./config.js";

export interface JobResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  exitCode: number | null;
  cost?: number;
  sessionId?: string;
}

export function runShift(
  job: ShiftConfig,
  credentials?: Credentials,
  signal?: AbortSignal,
  onOutput?: (chunk: string) => void
): Promise<JobResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const args = ["--print", "--verbose", "--output-format", "stream-json"];

    if (job.model) args.push("--model", job.model);
    if (job.maxBudget) args.push("--max-budget-usd", String(job.maxBudget));

    args.push(job.task);

    const credEnv: Record<string, string> = {};
    if (credentials?.githubToken) credEnv.GITHUB_TOKEN = credentials.githubToken;
    if (credentials?.linearApiKey) credEnv.LINEAR_API_KEY = credentials.linearApiKey;
    if (credentials?.anthropicApiKey) credEnv.ANTHROPIC_API_KEY = credentials.anthropicApiKey;

    const child = spawn("claude", args, {
      cwd: job.workdir ?? process.cwd(),
      env: { ...process.env, ...credEnv, ...job.env },
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let output = "";
    let stderr = "";
    let sessionId: string | undefined;
    let costUsd: number | undefined;
    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          // Assistant message — extract text content
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                output += block.text + "\n";
                onOutput?.(block.text + "\n");
              }
            }
          }

          // Final result — extract session ID, cost, and result text
          if (event.type === "result") {
            sessionId = event.session_id;
            costUsd = event.total_cost_usd;
            if (event.result && !output.includes(event.result)) {
              output += event.result;
              onOutput?.(event.result);
            }
          }
        } catch {
          // Not JSON, pass through raw
          output += line + "\n";
          onOutput?.(line + "\n");
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, job.timeout * 1000);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === "result") {
            sessionId = event.session_id;
            costUsd = event.total_cost_usd;
          }
        } catch {}
      }

      resolve({
        success: code === 0,
        output: output.trim(),
        error: stderr || undefined,
        durationMs: Date.now() - start,
        exitCode: code,
        cost: costUsd,
        sessionId,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      onOutput?.(`[error] ${err.message}\n`);
      resolve({
        success: false,
        output: "",
        error: err.message,
        durationMs: Date.now() - start,
        exitCode: null,
      });
    });
  });
}
