import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../src/agent.js";

test("createAgent returns an agent with a history", () => {
  const agent = createAgent();
  assert.ok(Array.isArray(agent.history));
  assert.equal(agent.history[0].role, "system");
});

test("offline reply echoes input when no API key is set", async () => {
  const previous = process.env.BIZAGENT_API_KEY;
  delete process.env.BIZAGENT_API_KEY;
  try {
    const agent = createAgent();
    const reply = await agent.run("echo hello world");
    assert.equal(reply, "hello world");
  } finally {
    if (previous !== undefined) process.env.BIZAGENT_API_KEY = previous;
  }
});

test("reset clears conversation history except the system message", async () => {
  const previous = process.env.BIZAGENT_API_KEY;
  delete process.env.BIZAGENT_API_KEY;
  try {
    const agent = createAgent();
    await agent.run("hello");
    agent.reset();
    assert.equal(agent.history.length, 1);
    assert.equal(agent.history[0].role, "system");
  } finally {
    if (previous !== undefined) process.env.BIZAGENT_API_KEY = previous;
  }
});
