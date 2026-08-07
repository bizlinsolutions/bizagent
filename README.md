# bizagent

A lightweight, extensible Node.js CLI agent framework with an interactive
terminal dashboard.

`bizagent` is a small command-line agent that can be used as a starting point
for your own assistants. It ships with an interactive terminal dashboard
(built with [blessed](https://github.com/chjj/blessed)), a simple REPL, and a
single-shot mode. It works either with an OpenAI-compatible chat completions
API or in a fully offline "skeleton" mode when no API key is configured.

## Install

```bash
npm install -g bizagent
```

After installation, run `bizagent` directly from your terminal.

## Usage

```bash
# start the interactive terminal dashboard (default)
bizagent

# single prompt, then exit
bizagent "What is the capital of France?"

# simple terminal REPL instead of the dashboard
bizagent --repl

# override model / system prompt / api base
bizagent --model gpt-4o-mini --system "You are a pirate" "Ahoy"

# help & version
bizagent --help
bizagent --version
```

### Terminal dashboard

Running `bizagent` with no arguments launches a full-screen interactive
dashboard with four tabs:

| Key | Tab            | Description                                            |
| --- | -------------- | ------------------------------------------------------ |
| `1` | Chat           | Talk to the agent; conversations persist to disk       |
| `2` | Conversations  | Browse, open, rename, and delete past conversations    |
| `3` | Config         | Edit API key, model, base URL, and system prompt       |
| `4` | Metrics        | Request stats, 14-day chart, and recent log table      |

**Dashboard keys:**

| Key         | Action                                      |
| ----------- | ------------------------------------------- |
| `1`-`4`     | Jump to tab                                 |
| `Tab`       | Next tab                                    |
| `Enter`     | Activate / send message (in chat)           |
| `Esc`       | Back / unfocus input                        |
| `Ctrl+N`    | Start a new chat (in chat tab)              |
| `d`         | Delete conversation (in conversations tab)  |
| `r`         | Rename conversation / refresh (contextual)  |
| `c`         | Clear logs (in metrics tab)                 |
| `q` / `Ctrl+C` | Quit                                     |

### REPL commands

The simple REPL (`bizagent --repl`) supports:

| Command   | Description                       |
| --------- | --------------------------------- |
| `/exit`   | Quit the session                  |
| `/quit`   | Quit the session                  |
| `/reset`  | Clear conversation history        |

## Configuration

Settings can be configured via environment variables or edited interactively
in the dashboard's Config tab. The dashboard persists settings to
`~/.bizagent/config.json` so they survive restarts. Environment variables take
precedence over the persisted file.

| Variable             | Default                          | Description                          |
| -------------------- | -------------------------------- | ------------------------------------ |
| `BIZAGENT_API_KEY`   | _(none)_                         | API key for the model provider       |
| `BIZAGENT_MODEL`     | `gpt-4o-mini`                    | Model name                           |
| `BIZAGENT_API_BASE`  | `https://api.openai.com/v1`      | OpenAI-compatible API base URL       |
| `BIZAGENT_DATA_DIR`  | `~/.bizagent`                    | Where config/conversations/logs live |

When `BIZAGENT_API_KEY` is unset, `bizagent` runs in offline mode and returns
deterministic local responses, which is handy for development and testing.

### Data storage

The dashboard stores data in `~/.bizagent/` (or `$BIZAGENT_DATA_DIR`):

```
~/.bizagent/
├── config.json           # persisted settings
├── logs.jsonl            # request log (one JSON object per line)
└── conversations/
    ├── c_xxx.json        # one file per conversation
    └── ...
```

## Programmatic API

```js
import { createAgent } from "bizagent";

const agent = createAgent({ model: "gpt-4o-mini" });
const reply = await agent.run("Hello!");
console.log(reply);
```

## Development

```bash
npm test          # run the test suite (node:test)
npm start         # run the CLI locally (launches the dashboard)
```

## Publishing

Releases are published to npm automatically by GitHub Actions when a new tag
`v*` is pushed. The workflow uses the `NPM_TOKEN` repository secret for
authentication. See `.github/workflows/publish.yml`.

## License

MIT (c) Bizlin Technologies
