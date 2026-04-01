# overtime

Cron for AI agents. Schedule agent tasks like you schedule cron jobs.

```yaml
# overtime.yml
jobs:
  - name: pr-review
    schedule: "every day at 9am"
    task: "Review open PRs in this repo and leave comments"

  - name: dep-updates
    schedule: "every monday at 2am"
    task: "Update dependencies, run tests, open PR if passing"

  - name: bug-triage
    schedule: "every 4 hours"
    task: "Check Linear for bugs labeled 'needs-triage', add priority labels"
```

```
$ npx overtime

┌─ overtime ──────────────────────────────────────────┐
│                                                     │
│  JOB           SCHEDULE        STATUS    NEXT RUN   │
│  pr-review     daily at 9am    idle      in 3h 22m  │
│  dep-updates   Mon at 2am     ✓ done    in 4d 11h  │
│  bug-triage    every 4 hours   ⟳ running in 1h 05m  │
│                                                     │
│  [↑↓] select  [r] run  [enter] view output  [q] quit│
└─────────────────────────────────────────────────────┘
```

## Getting started

```bash
npx overtime init    # connect GitHub, Linear, Slack — creates overtime.yml
npx overtime         # start the dashboard
npx overtime run pr-review  # test a single job
```

## Why it's small

overtime does exactly one thing: run `claude --print <task>` on a schedule and show you what happened.

It doesn't have GitHub integrations, Linear clients, or Slack SDKs. It doesn't need them. The agent already knows how to use `gh`, call APIs, and post to Slack. You just tell it what to do in plain English:

```yaml
- name: notify-slack
  schedule: "every day at 9am"
  task: "Review open PRs and post a summary to #dev in Slack"
```

Claude handles the rest. overtime is just the clock.

## Schedules

Write schedules in plain English. No cron syntax needed.

| Schedule | Meaning |
|---|---|
| `every hour` | Top of every hour |
| `every 15 minutes` | Every 15 minutes |
| `every day at 9am` | Daily at 9:00 AM |
| `every weekday at 9:30am` | Mon-Fri at 9:30 AM |
| `every monday at 2pm` | Mondays at 2:00 PM |
| `every weekend at 10am` | Sat & Sun at 10:00 AM |
| `hourly` | Same as `every hour` |
| `daily at 3pm` | Same as `every day at 3pm` |

Standard cron expressions (`0 9 * * *`) also work if you prefer them.

## Config

```yaml
# overtime.yml
jobs:
  - name: my-job        # lowercase, alphanumeric, dashes
    schedule: "every day at 9am"
    task: "What the agent should do"
    model: sonnet       # optional — Claude model to use
    timeout: 300        # optional — max seconds (default: 300)
    workdir: ./myrepo   # optional — working directory for the agent
```

## Skills

overtime is designed to be extended with Claude Code skills — not by adding features to the core.

Want to add something? Ask Claude to do it:

- *"Add Cursor as an agent option"* — Claude modifies `runner.ts`
- *"Add a `logs` command that shows past job output"* — Claude adds a command to `index.ts`
- *"Support Discord webhook notifications"* — Claude adds a notify function
- *"Add a job that runs on git push instead of a schedule"* — Claude wires up a file watcher

The codebase is 9 files and ~600 lines. Small enough that Claude (or you) can read the whole thing, understand it, and change it confidently. That's the point — the code *is* the configuration layer.

This is the same approach as [nanoclaw](https://github.com/qwibitai/nanoclaw): contributors submit skills, not features.

## How it works

overtime is a single Node.js process that:

1. Reads `overtime.yml` and parses natural language schedules into cron
2. Runs a cron loop — when a job fires, spawns `claude --print` with the task
3. Shows job state in a live TUI dashboard
4. Prevents overlap — if a job is still running when its next cron fires, it skips

That's it. No daemon, no database, no queue. One process, one config file.

## Requirements

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Design philosophy

- **The agent is the integration layer.** overtime doesn't talk to GitHub, Linear, or Slack. The agent does. overtime just schedules and watches.
- **One process, handful of files.** Small enough to understand completely. Read the whole source in one sitting.
- **Skills over features.** New capabilities come from Claude Code skills that modify the source — not config options, plugin systems, or abstraction layers.
- **No magic.** It reads YAML, runs cron, spawns a CLI, and draws a table. You can trace the entire flow in 10 minutes.

## License

MIT
