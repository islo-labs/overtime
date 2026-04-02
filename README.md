# cronai

Cron for AI agents. Schedule agent tasks like you schedule cron jobs.

> 🔊 Turn on sound

https://github.com/user-attachments/assets/7ac272e8-178a-4b02-a195-e0aa33b01889

## Automated PR reviews in 30 seconds

```bash
npx cron-ai init
```

```yaml
# cronai.yml
crons:
  - name: pr-review
    schedule: "every hour"
    task: >
      Review all open PRs in this repo. For each PR, check out the branch,
      read the diff, and leave a review comment on GitHub covering: code quality,
      potential bugs, security issues, and test coverage. Approve if it looks good.
    notify: slack
```

```bash
npx cron-ai
```

That's it. Every hour, Claude reviews your open PRs and leaves comments on GitHub. You get a Slack notification when it's done.

## More examples

```yaml
crons:
  - name: pr-review
    schedule: "every hour"
    task: "Review all open PRs — check for bugs, security issues, and style. Leave comments on GitHub."
    notify: slack

  - name: dep-updates
    schedule: "every monday at 2am"
    task: "Update dependencies, run tests, open PR if passing"

  - name: bug-triage
    schedule: "every 4 hours"
    task: "Check Linear for bugs labeled 'needs-triage', add priority labels"
    notify: slack

  - name: stale-prs
    schedule: "every weekday at 9am"
    task: "Find PRs with no activity for 3+ days, ping the authors with a friendly reminder comment"

  - name: changelog
    schedule: "every friday at 5pm"
    task: "Look at all PRs merged this week, write a changelog entry and commit it"
```

## Dashboard

```
$ cronai

┌─ cronai ──────────────────────────────────────────────────────┐
│                                                               │
│  CRON            SCHEDULE        STATUS    LAST RUN   NEXT RUN│
│  pr-review       every hour      idle      3h ago     in 22m  │
│  dep-updates     Mon at 2am     ✓ done    1d ago     in 4d   │
│  bug-triage      every 4 hours   ⟳ running -          in 1h   │
│                                                               │
│  [↑↓] select  [r] run  [s] resume session  [d] delete        │
│  [enter] output  [q] quit                                     │
└───────────────────────────────────────────────────────────────┘
```

The scheduler runs in the background — close the TUI and your crons keep running. Reopen it anytime to check status.

## Getting started

```bash
cronai init           # connect GitHub, Linear, Slack — creates cronai.yml
cronai                # start dashboard (auto-starts background scheduler)
cronai run pr-review  # test a single cron
cronai stop           # stop the background scheduler
```

## Live output

Press `enter` on any cron to see its output. While a cron is running, output streams in real-time — watch Claude think, read files, and run commands as it happens.

## Resume sessions

Press `s` on any cron — running or completed — to drop into the Claude session interactively. This lets you inspect what the agent did, ask follow-up questions, or continue the work.

The agent ran overnight and opened a PR but you want to tweak it? Press `s` and you're in the same conversation with full context.

## How is this different from `/loop`?

Claude Code has a built-in `/loop` command that runs a prompt on an interval. cronai is for crons you define once and run forever.

- **Runs in the background.** `/loop` dies when you close the terminal. cronai keeps running.
- **Multiple crons.** `/loop` runs one thing. cronai manages many crons with different schedules.
- **Real cron schedules.** Not just "every 5 minutes" — "every monday at 2am", "every weekday at 9am".
- **Dashboard.** See all your crons, their status, last run time, and output in one place.
- **Session resume.** Press `s` to jump back into any completed session and keep working.
- **Persistent history.** Logs survive restarts. See what happened last night.
- **Config as code.** `cronai.yml` lives in your repo. Commit it, share it with the team.

Think of `/loop` as a personal timer. cronai is infrastructure.

## Why it's small

cronai does exactly one thing: run Claude on a schedule and show you what happened.

It doesn't have GitHub integrations, Linear clients, or Slack SDKs. It doesn't need them. The agent already knows how to use `gh`, call APIs, and post to Slack. You just tell it what to do in plain English. cronai is just the clock.

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
# cronai.yml
crons:
  - name: my-cron       # lowercase, alphanumeric, dashes
    schedule: "every day at 9am"
    task: "What the agent should do"
    notify: slack       # optional — Slack notification on completion
    model: sonnet       # optional — Claude model to use
    timeout: 3600       # optional — max seconds (default: 3600 / 1 hour)
    workdir: ./myrepo   # optional — working directory for the agent
```

## How it works

cronai runs a background scheduler that fires crons on their schedules. The TUI is just a viewer — open and close it anytime.

1. `cronai` starts the scheduler as a background daemon (if not already running) and opens the TUI
2. When a cron fires, it spawns `claude --print` with streaming output
3. The TUI connects via Unix socket for real-time state updates
4. History and logs persist to `~/.cronai/` across restarts
5. Overlap prevention — if a cron is still running when its next schedule fires, it skips

## Requirements

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Design philosophy

- **The agent is the integration layer.** cronai doesn't talk to GitHub, Linear, or Slack. The agent does. cronai just schedules and watches.
- **One process, handful of files.** Small enough to understand completely. Read the whole source in one sitting.
- **Small by design.** New capabilities come from modifying the source — not config options, plugin systems, or abstraction layers.
- **No magic.** It reads YAML, runs cron, spawns a CLI, and draws a table. You can trace the entire flow in 10 minutes.

## License

MIT
