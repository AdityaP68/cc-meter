# sessionscope documentation

sessionscope is a local-first usage and cost tracker for Claude Code: a plugin records every session into a SQLite database in `~/.sessionscope`, and a CLI and a dashboard on `127.0.0.1` read it. It answers what your sessions cost, which models they used and whether anything unusual happened, without sending anything off your machine.

The guide is split into one page per topic in `docs/guide/`. The same files are compiled into the dashboard's Docs section at `#/docs`, so they read the same on GitHub and in the app.

| Page | What it covers |
|---|---|
| [Overview](guide/overview.md) | What sessionscope is, how it works, what it does not do |
| [Install](guide/install.md) | Requirements, `./install.sh`, trying it in isolation, upgrading from ccmeter, uninstall |
| [First steps](guide/first-steps.md) | A five-minute path from install to readable numbers |
| [Measures](guide/measures.md) | The vocabulary: session, turn, tokens, cost, switch, compaction |
| [Costs](guide/costs.md) | How a dollar figure is computed, and why it is not your bill |
| [Privacy](guide/privacy.md) | What is stored, what never is, the local server |
| [Accuracy](guide/accuracy.md) | How far the numbers can be trusted, and the known discrepancies |
| [Dashboard](guide/dashboard.md) | Every page, filter, chart, chip and banner |
| [Command line](guide/cli.md) | Every command and flag, with exit codes |
| [Status line and /sessionscope](guide/statusline-and-command.md) | The status line and the zero-token `/sessionscope` command |
| [Configuration and pricing](guide/config-and-pricing.md) | Files, environment variables, `config.json`, prices, exports |
| [Troubleshooting](guide/troubleshooting.md) | Symptoms and fixes, and what each doctor check means |

Developer and design documents live next to this file: `SCOPE.md`, `FORMATS.md` (what was observed about Claude Code's formats), `ARCHITECTURE.md`, `ASSUMPTIONS.md` and `ACCEPTANCE.md`.
