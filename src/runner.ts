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
    const args = ["--print", "--output-format", "stream-json"];

    if (job.model) args.push("--model", job.model);
    if (job.maxBudget) args.push("--max-turns", "50");

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

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      // Parse stream-json: each line is a JSON event
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          // Extract text content from assistant messages
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                output += block.text;
                onOutput?.(block.text);
              }
            }
          }

          // Extract text from content_block_delta (streaming chunks)
          if (event.type === "content_block_delta" && event.delta?.text) {
            output += event.delta.text;
            onOutput?.(event.delta.text);
          }

          // Extract session ID and cost from result
          if (event.type === "result") {
            sessionId = event.session_id ?? event.sessionId;
            costUsd = event.cost_usd ?? event.cost;
            if (event.result) {
              output += event.result;
              onOutput?.(event.result);
            }
          }
        } catch {
          // Not valid JSON line, append raw
          if (line.trim()) {
            output += line;
            onOutput?.(line);
          }
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onOutput?.(`[stderr] ${text}`);
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, job.timeout * 1000);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        output,
        error: stderr || undefined,
        durationMs: Date.now() - start,
        exitCode: code,
        cost: costUsd,
        sessionId,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      onOutput?.(`[error] ${err.message}`);
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
