import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const YELLOW = "\x1b[33m";

function paint(color, text, enabled) {
  return enabled ? `${color}${text}${RESET}` : text;
}

export async function startRepl(agent) {
  const color = process.stdout.isTTY !== false;

  const banner =
    `bizagent ${agent.hasApiKey ? "(model: " + agent.model + ")" : "(offline mode)"}\n` +
    paint(DIM, 'Type your message and press Enter. Type "/exit" or Ctrl+C to quit.\n', color);

  process.stdout.write(banner);

  const rl = createInterface({ input: stdin, output: stdout });

  const prompt = () => rl.question(paint(CYAN, "you> ", color), onLine);
  prompt();

  async function onLine(line) {
    const text = (line ?? "").trim();
    if (!text) return prompt();
    if (text === "/exit" || text === "/quit") return rl.close();
    if (text === "/reset") {
      agent.reset();
      process.stdout.write(paint(DIM, "(history cleared)\n", color));
      return prompt();
    }
    try {
      const reply = await agent.run(text);
      process.stdout.write(paint(YELLOW, "agent> ", color) + reply + "\n");
    } catch (err) {
      process.stderr.write(`[bizagent] error: ${err.message}\n`);
    }
    prompt();
  }

  return new Promise((resolve) => rl.on("close", resolve));
}
