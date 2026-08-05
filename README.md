# bizagent

A lightweight, extensible Node.js CLI agent framework.

`bizagent` is a small, dependency-free command-line agent that can be used as
a starting point for your own assistants. It ships with an interactive REPL and
a single-shot mode, and works either with an OpenAI-compatible chat completions
API or in a fully offline "skeleton" mode when no API key is configured.

## Install

```bash
npm install -g bizagent
```

After installation, run `bizagent` directly from your terminal.

## Usage

```bash
# interactive session
bizagent

# single prompt, then exit
bizagent "What is the capital of France?"

# override model / system prompt / api base
bizagent --model gpt-4o-mini --system "You are a pirate" "Ahoy"

# help & version
bizagent --help
bizagent --version
```

### REPL commands

| Command   | Description                       |
| --------- | --------------------------------- |
| `/exit`   | Quit the session                  |
| `/quit`   | Quit the session                  |
| `/reset`  | Clear conversation history        |

## Configuration

All configuration is via environment variables (no secrets are stored in the
repo). Copy `.env.example` to `.env` and fill in your values, or export them in
your shell.

| Variable             | Default                          | Description                          |
| -------------------- | -------------------------------- | ------------------------------------ |
| `BIZAGENT_API_KEY`   | _(none)_                         | API key for the model provider       |
| `BIZAGENT_MODEL`     | `gpt-4o-mini`                    | Model name                           |
| `BIZAGENT_API_BASE`  | `https://api.openai.com/v1`      | OpenAI-compatible API base URL       |

When `BIZAGENT_API_KEY` is unset, `bizagent` runs in offline mode and returns
deterministic local responses, which is handy for development and testing.

## Programmatic API

```js
import { createAgent } from "@bizlin/bizagent";

const agent = createAgent({ model: "gpt-4o-mini" });
const reply = await agent.run("Hello!");
console.log(reply);
```

## Development

```bash
npm test          # run the test suite (node:test)
npm start         # run the CLI locally
```

## Publishing

Releases are published to npm automatically by GitHub Actions when a new tag
`v*` is pushed. The workflow uses the `NPM_TOKEN` repository secret for
authentication. See `.github/workflows/publish.yml`.

## License

MIT (c) Bizlin Technologies
