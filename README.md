# itsovertime

Cron for AI agents. Schedule agent tasks like you schedule cron jobs.

## Automated PR reviews in 30 seconds

```bash
npx itsovertime init
```

```yaml
# overtime.yml
shifts:
  - name: pr-review
    schedule: "every hour"
    task: >
      Review all open PRs in this repo. For each PR, check out the branch,
      read the diff, and leave a review comment on GitHub covering: code quality,
      potential bugs, security issues, and test coverage. Approve if it looks good.
    notify: slack
```

```bash
npx itsovertime
```

That's it. Every hour, Claude reviews your open PRs and leaves comments on GitHub. You get a Slack notification when it's done.

## More examples

```yaml
shifts:
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
$ npx itsovertime

┌─ itsovertime ─────────────────────────────────────────────────┐
│                                                               │
│  SHIFT          SCHEDULE        STATUS    LAST RUN   NEXT RUN │
│  pr-review      every hour      idle      3h ago     in 22m   │
│  dep-updates    Mon at 2am     ✓ done    1d ago     in 4d 11h│
│  bug-triage     every 4 hours   ⟳ running -          in 1h 05m│
│                                                               │
│  [↑↓] select  [r] run  [s] resume session  [d] delete        │
│  [enter] output  [q] quit                                     │
└───────────────────────────────────────────────────────────────┘
```

## Getting started

```bash
npx itsovertime init           # connect GitHub, Linear, Slack — creates overtime.yml
npx itsovertime                # start the dashboard
npx itsovertime run pr-review  # test a single shift
```

## Resume sessions

When a shift finishes, press `s` to drop into the Claude session where it left off. This lets you inspect what the agent did, ask follow-up questions, or continue the work interactively.

The agent ran overnight and opened a PR but you want to tweak it? Press `s` and you're in the same conversation with full context.

## Why it's small

itsovertime does exactly one thing: run `claude --print <task>` on a schedule and show you what happened.

It doesn't have GitHub integrations, Linear clients, or Slack SDKs. It doesn't need them. The agent already knows how to use `gh`, call APIs, and post to Slack. You just tell it what to do in plain English. itsovertime is just the clock.

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
shifts:
  - name: my-shift      # lowercase, alphanumeric, dashes
    schedule: "every day at 9am"
    task: "What the agent should do"
    notify: slack       # optional — Slack notification on completion
    model: sonnet       # optional — Claude model to use
    timeout: 300        # optional — max seconds (default: 300)
    workdir: ./myrepo   # optional — working directory for the agent
```

## How it works

itsovertime is a single Node.js process that:

1. Reads `overtime.yml` and parses natural language schedules into cron
2. Runs a cron loop — when a shift fires, spawns `claude --print` with the task
3. Shows shift state in a live TUI dashboard
4. Sends a Slack notification when shifts complete
5. Prevents overlap — if a shift is still running when its next cron fires, it skips

That's it. No daemon, no database, no queue. One process, one config file.

## Requirements

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Design philosophy

- **The agent is the integration layer.** itsovertime doesn't talk to GitHub, Linear, or Slack. The agent does. itsovertime just schedules and watches.
- **One process, handful of files.** Small enough to understand completely. Read the whole source in one sitting.
- **Skills over features.** New capabilities come from Claude Code skills that modify the source — not config options, plugin systems, or abstraction layers.
- **No magic.** It reads YAML, runs cron, spawns a CLI, and draws a table. You can trace the entire flow in 10 minutes.

## License

MIT
