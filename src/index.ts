import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { program } from "commander";
import { loadConfig, loadCredentials } from "./config.js";
import { runCron } from "./runner.js";
import { notifySlack } from "./notify.js";

const DIR = resolve(homedir(), ".cronai");
const PID_FILE = resolve(DIR, "pid");
const SOCK = resolve(DIR, "cronai.sock");

function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) return false;
  const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // Stale PID file
    unlinkSync(PID_FILE);
    return false;
  }
}

function ensureDaemon(configPath?: string) {
  if (isDaemonRunning()) return;

  // Start daemon as detached background process
  const args = [process.argv[1], "_daemon"];
  if (configPath) args.push("--config", configPath);

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: process.env,
    cwd: process.cwd(),
  });
  child.unref();

  // Wait for socket to appear
  const deadline = Date.now() + 5000;
  while (!existsSync(SOCK) && Date.now() < deadline) {
    spawnSync("sleep", ["0.1"]);
  }
}

program
  .name("cron-ai")
  .description("Cron for AI agents")
  .version("0.1.3")
  .option("-c, --config <path>", "Path to config file");

// Default command: start TUI (auto-starts daemon)
program
  .command("start", { isDefault: true })
  .description("Open the dashboard (starts scheduler in background if needed)")
  .action(async (_, cmd) => {
    const opts = cmd.optsWithGlobals();
    ensureDaemon(opts.config);

    const { render } = await import("ink");
    const React = await import("react");
    const { App } = await import("./app.js");

    const onResume = (sessionId: string, cronName: string) => {
      console.log(`\nResuming session for "${cronName}"...\n`);
      spawnSync("claude", ["--resume", sessionId], {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      });
      process.exit(0);
    };

    const { waitUntilExit } = render(
      React.createElement(App, { onResume })
    );

    await waitUntilExit();
  });

// Run a single cron immediately (no TUI, no daemon)
program
  .command("run <cron>")
  .description("Run a single cron immediately (no TUI)")
  .action(async (cronName: string, _, cmd) => {
    const opts = cmd.optsWithGlobals();
    const config = loadConfig(opts.config);
    const credentials = loadCredentials();
    const cron = config.crons.find((s) => s.name === cronName);

    if (!cron) {
      console.error(
        `Cron "${cronName}" not found. Available: ${config.crons.map((s) => s.name).join(", ")}`
      );
      process.exit(1);
      return;
    }

    console.log(`Running "${cronName}"...`);
    const result = await runCron(cron, credentials);

    console.log(result.output);
    if (result.error) console.error(result.error);

    const duration = (result.durationMs / 1000).toFixed(1);
    const cost = result.cost ? ` | $${result.cost.toFixed(4)}` : "";
    console.log(`\n${result.success ? "✓" : "✗"} ${duration}s${cost}`);

    if (cron.notify === "slack") {
      await notifySlack(cronName, result, credentials);
    }

    process.exit(result.success ? 0 : 1);
  });

// Stop the background scheduler
program
  .command("stop")
  .description("Stop the background scheduler")
  .action(() => {
    if (!isDaemonRunning()) {
      console.log("No scheduler running.");
      return;
    }
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    process.kill(pid, "SIGTERM");
    console.log("Scheduler stopped.");
  });

// Init wizard
program
  .command("init")
  .description("Set up cron-ai: connect services and create config")
  .action(async () => {
    const { init } = await import("./init.js");
    await init();
  });

// Internal: daemon entry point (not user-facing)
program
  .command("_daemon", { hidden: true })
  .action(async (_, cmd) => {
    const opts = cmd.optsWithGlobals();
    const { startDaemon } = await import("./daemon.js");
    startDaemon(opts.config);
  });

program.parse();
