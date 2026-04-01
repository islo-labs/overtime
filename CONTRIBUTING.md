# Contributing to overtime

overtime is intentionally small. The goal is a codebase you can read in one sitting. Contributions should keep it that way.

## Philosophy

**The agent is the integration layer.** overtime doesn't need a GitHub client, Linear SDK, or Slack library. The agent already knows how to use those. overtime just schedules and watches. If you're about to add an integration, ask yourself: can the agent just do this as part of its task?

**Skills over features.** The preferred way to extend overtime is with Claude Code skills — small, focused modifications to the source. A 10-line change to `runner.ts` that adds Cursor support is better than a 200-line plugin system. Submit skills, not frameworks.

**No abstraction without repetition.** Don't add interfaces, registries, or factories for things that exist once. Three similar lines are better than a premature abstraction.

**The whole thing is 9 files.** Try to keep it that way. If a change needs a new file, it should be worth the added complexity.

## Project structure

```
src/
  index.ts          # CLI entry — commander setup, routes to start/run/init
  app.tsx            # Root Ink component — wires scheduler to TUI
  config.ts          # Zod schema, YAML loader, credential management
  scheduler.ts       # node-cron wrapper, job state, overlap prevention
  runner.ts          # Spawns claude --print, collects result
  notify.ts          # Slack webhook notification
  ui.tsx             # TUI components — dashboard, job table, output view
  cron.ts            # Natural language → cron parser, time formatting
  init.ts            # Interactive setup wizard
```

## Development

```bash
npm install          # install dependencies
npm run dev          # run without building
npx tsc --noEmit     # type check
npm run build        # build for distribution
```

## Making changes

1. Fork and clone
2. Make your change
3. `npx tsc --noEmit` to type-check
4. `npm run build` to verify
5. Test with a real `overtime.yml`
6. PR with a clear description of what and why

## Good contributions

- **Bug fixes** — always welcome
- **New schedule patterns** — add to `parseToCron()` in `cron.ts`
- **Agent support** — modify `runner.ts` to support a new CLI
- **TUI improvements** — better layout, keybinds, views
- **Skills** — self-contained changes that others can apply to their fork

## What to avoid

- Abstraction layers (adapter interfaces, plugin systems, registries)
- Dependencies for things Node.js or the agent can do natively
- Config options for things that should be code changes
- Integration clients (GitHub, Linear, Slack) — the agent handles those
- Features that make the codebase harder to read in one sitting

## Code style

- TypeScript, strict mode, ESM
- No comments unless the logic isn't self-evident
- Functions over classes where possible
- Let the types do the documenting
