import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { parseToCron } from "./cron.js";

const CronSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Cron name must be lowercase alphanumeric with dashes"),
  schedule: z.string(),
  task: z.string().min(1),
  agent: z.string().default("claude"),
  notify: z.enum(["slack"]).optional(),
  model: z.string().optional(),
  maxBudget: z.number().positive().optional(),
  timeout: z.number().positive().default(3600),
  workdir: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const ConfigSchema = z
  .object({
    defaults: z
      .object({
        agent: z.string().optional(),
        timeout: z.number().positive().optional(),
        notify: z.enum(["slack"]).optional(),
      })
      .optional(),
    crons: z.array(CronSchema).min(1, "At least one cron is required"),
  })
  .refine(
    (config) => {
      const names = config.crons.map((s) => s.name);
      return new Set(names).size === names.length;
    },
    { message: "Cron names must be unique" }
  );

export type CronConfig = z.infer<typeof CronSchema>;
export type CronaiConfig = z.infer<typeof ConfigSchema>;

// --- Credentials ---

export interface Credentials {
  githubToken?: string;
  linearApiKey?: string;
  slackWebhookUrl?: string;
  anthropicApiKey?: string;
}

export function loadCredentials(): Credentials {
  const credPath = resolve(homedir(), ".cronai", "credentials.json");
  let stored: Record<string, string> = {};

  if (existsSync(credPath)) {
    try {
      stored = JSON.parse(readFileSync(credPath, "utf-8"));
    } catch {
      // Corrupted file, ignore
    }
  }

  // Env vars override stored credentials
  return {
    githubToken: process.env.GITHUB_TOKEN ?? stored.githubToken,
    linearApiKey: process.env.LINEAR_API_KEY ?? stored.linearApiKey,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? stored.slackWebhookUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? stored.anthropicApiKey,
  };
}

// --- Config loading ---

function resolveEnvVars(text: string): string {
  return text.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

export function loadConfig(configPath?: string): CronaiConfig & { configPath: string } {
  const candidates = configPath
    ? [configPath]
    : ["cronai.yml", "cronai.yaml", ".cronai.yml"];

  const found = candidates.map((c) => resolve(c)).find((c) => existsSync(c));

  if (!found) {
    console.error(
      `No config file found. Run "cron-ai init" to get started, or create cronai.yml manually.`
    );
    process.exit(1);
  }

  const raw = readFileSync(found, "utf-8");
  const resolved = resolveEnvVars(raw);
  const parsed = parseYaml(resolved);

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`Invalid config (${found}):\n`);
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const config = result.data!;
  const defaults = config.defaults;

  // Merge defaults into crons
  if (defaults) {
    for (const cron of config.crons) {
      if (defaults.agent && cron.agent === "claude") {
        cron.agent = defaults.agent;
      }
      if (defaults.timeout && cron.timeout === 3600) {
        cron.timeout = defaults.timeout;
      }
      if (defaults.notify && !cron.notify) {
        cron.notify = defaults.notify;
      }
    }
  }

  // Convert natural language schedules to cron
  for (const cron of config.crons) {
    const cronExpr = parseToCron(cron.schedule);
    if (!cronExpr) {
      console.error(
        `Invalid schedule for cron "${cron.name}": "${cron.schedule}"\n` +
          `  Examples: "every hour", "every day at 9am", "every monday at 2pm"`
      );
      process.exit(1);
    }
    cron.schedule = cronExpr;
  }

  return { ...config, configPath: found };
}
