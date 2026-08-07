import { createAgent } from "./agent.js";
import { startRepl } from "./repl.js";
import { startTui } from "./tui.js";

const HELP = `bizagent - a lightweight, extensible Node.js CLI agent + dashboard.

Usage:
  bizagent                 Start the interactive terminal dashboard (default)
  bizagent "prompt"        Run a single prompt and exit
  bizagent --repl          Start the simple terminal REPL
  bizagent --version       Print version and exit
  bizagent --help          Show this help and exit

Dashboard tabs:
  1  Chat          Talk to the agent; conversations persist to disk
  2  Conversations Browse, open, rename, delete past conversations
  3  Config        Edit API key, model, base URL, system prompt
  4  Metrics       Request stats, 14-day chart, recent log table

Options:
  --model <name>           Override the model (default: env BIZAGENT_MODEL or 'gpt-4o-mini')
  --system <text>          Set a custom system prompt
  --api-base <url>         Override the API base URL (default: env BIZAGENT_API_BASE or OpenAI default)
  --no-color               Disable colored output (REPL only)

Configuration:
  BIZAGENT_API_KEY         API key for the model provider (required for LLM features)
  BIZAGENT_MODEL           Default model name
  BIZAGENT_API_BASE        Override the API base URL
  BIZAGENT_DATA_DIR        Where config/conversations/logs are stored (default: ~/.bizagent)

The agent also works fully offline as a simple command/reply loop when no
API key is configured, so it can be used as a skeleton for your own tools.
`;

function parseArgs(argv) {
  const args = { _: [], model: null, system: null, apiBase: null, color: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else if (a === "--repl") args.repl = true;
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--system") args.system = argv[++i];
    else if (a === "--api-base") args.apiBase = argv[++i];
    else if (a === "--no-color") args.color = false;
    else if (a.startsWith("-")) {
      args.unknown = a;
    } else {
      args._.push(a);
    }
  }
  return args;
}

export async function runCli(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  if (args.version) {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    process.stdout.write(`bizagent v${pkg.version}\n`);
    return;
  }

  if (args.unknown) {
    process.stderr.write(`bizagent: unknown option '${args.unknown}'\n`);
    process.stderr.write(HELP);
    process.exitCode = 2;
    return;
  }

  const agent = createAgent({
    model: args.model,
    system: args.system,
    apiBase: args.apiBase,
    color: args.color,
  });

  const prompt = args._.join(" ").trim();
  if (prompt) {
    const reply = await agent.run(prompt);
    process.stdout.write(reply + "\n");
    return;
  }

  // No prompt: default to the interactive TUI dashboard, unless --repl is
  // explicitly requested.
  if (args.repl) {
    await startRepl(agent);
    return;
  }

  await startTui();
}
