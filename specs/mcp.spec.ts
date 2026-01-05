import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";

const CLI_PATH = join(process.cwd(), "dist/cli/index.js");

describe("MCP Inheritance E2E", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-spec-mcp-${Date.now()}`);
    await mkdir(join(testDir, ".agents/personas/base-persona"), { recursive: true });
    await mkdir(join(testDir, ".agents/personas/child-persona"), { recursive: true });
    await mkdir(join(testDir, ".agents/workflows"), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    // Clean up temp MCP files
    await rm(join(tmpdir(), "dot-agents-mcp"), { recursive: true, force: true }).catch(() => {});
  });

  it("loads MCP config from persona directory", async () => {
    await writeFile(
      join(testDir, ".agents/personas/base-persona/PERSONA.md"),
      `---
name: test-base
description: Base persona with MCP
cmd:
  headless: claude --print
  interactive: claude
---

Base persona prompt.
`
    );

    await writeFile(
      join(testDir, ".agents/personas/base-persona/mcp.json"),
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-fetch"],
          },
        },
      })
    );

    const { stdout, stderr } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "base-persona", "-v", "--headless", "-p", "test"],
      { cwd: testDir, reject: false }
    );

    const output = stdout + stderr;
    assert.ok(output.includes("MCP config:"), "Should show MCP config path");
    assert.ok(output.includes("--mcp-config"), "Should inject --mcp-config flag");
  });

  it("works without MCP config", async () => {
    await writeFile(
      join(testDir, ".agents/personas/base-persona/PERSONA.md"),
      `---
name: test-base
description: Base persona without MCP
cmd:
  headless: echo
  interactive: echo
---

Base persona prompt.
`
    );

    const { stdout, stderr } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "base-persona", "-v", "--headless", "-p", "test"],
      { cwd: testDir, reject: false }
    );

    const output = stdout + stderr;
    assert.ok(!output.includes("MCP config:"), "Should NOT show MCP config when none exists");
  });

  // TODO: extends: <parent-name> is not yet implemented for explicit MCP inheritance
  // MCP inheritance currently only works via root persona (.agents/mcp.json)
  // See ROADMAP.md for future plans.
  it.skip("child persona inherits parent MCP config", async () => {
    // Create parent with MCP config
    await writeFile(
      join(testDir, ".agents/personas/base-persona/PERSONA.md"),
      `---
name: base-persona
description: Base persona with MCP
cmd:
  headless: claude --print
  interactive: claude
---

Base persona prompt.
`
    );

    await writeFile(
      join(testDir, ".agents/personas/base-persona/mcp.json"),
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-fetch"],
          },
        },
      })
    );

    // Create child that extends parent
    await writeFile(
      join(testDir, ".agents/personas/child-persona/PERSONA.md"),
      `---
name: test-child
description: Child persona extending base
extends: base-persona
cmd:
  headless: claude --print
  interactive: claude
---

Child persona prompt.
`
    );

    const { stdout, stderr } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "child-persona", "-v", "--headless", "-p", "test"],
      { cwd: testDir, reject: false }
    );

    const output = stdout + stderr;
    assert.ok(output.includes("MCP config:"), "Child should inherit MCP config");

    // Extract MCP file path and check contents
    const match = output.match(/MCP config: ([^\s]+)/);
    if (match) {
      const mcpFile = match[1];
      const content = await readFile(mcpFile, "utf-8");
      assert.ok(content.includes("fetch"), "Inherited config should contain fetch server");
    }
  });

  // TODO: extends: <parent-name> is not yet implemented for explicit MCP merging
  // See ROADMAP.md for future plans.
  it.skip("merges child MCP config with parent", async () => {
    // Create parent with MCP config
    await writeFile(
      join(testDir, ".agents/personas/base-persona/PERSONA.md"),
      `---
name: base-persona
description: Base persona
cmd:
  headless: claude --print
  interactive: claude
---

Base persona prompt.
`
    );

    await writeFile(
      join(testDir, ".agents/personas/base-persona/mcp.json"),
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-fetch"],
          },
        },
      })
    );

    // Create child with additional MCP server
    await writeFile(
      join(testDir, ".agents/personas/child-persona/PERSONA.md"),
      `---
name: child-persona
description: Child persona
extends: base-persona
cmd:
  headless: claude --print
  interactive: claude
---

Child persona prompt.
`
    );

    await writeFile(
      join(testDir, ".agents/personas/child-persona/mcp.json"),
      JSON.stringify({
        mcpServers: {
          linear: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-linear"],
          },
        },
      })
    );

    const { stdout, stderr } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "child-persona", "-v", "--headless", "-p", "test"],
      { cwd: testDir, reject: false }
    );

    const output = stdout + stderr;
    const match = output.match(/MCP config: ([^\s]+)/);

    if (match) {
      const mcpFile = match[1];
      const content = await readFile(mcpFile, "utf-8");

      // Should have both servers
      assert.ok(content.includes("fetch"), "Merged config should contain parent's fetch server");
      assert.ok(content.includes("linear"), "Merged config should contain child's linear server");
    }
  });

  it("child can override parent MCP server", async () => {
    // Create parent with MCP config
    await writeFile(
      join(testDir, ".agents/personas/base-persona/PERSONA.md"),
      `---
name: base-persona
description: Base persona
cmd:
  headless: claude --print
  interactive: claude
---

Base persona prompt.
`
    );

    await writeFile(
      join(testDir, ".agents/personas/base-persona/mcp.json"),
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-fetch"],
          },
        },
      })
    );

    // Create child that overrides fetch
    await writeFile(
      join(testDir, ".agents/personas/child-persona/PERSONA.md"),
      `---
name: child-persona
description: Child persona
extends: base-persona
cmd:
  headless: claude --print
  interactive: claude
---

Child persona prompt.
`
    );

    await writeFile(
      join(testDir, ".agents/personas/child-persona/mcp.json"),
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "node",
            args: ["custom-fetch.js"],
          },
          linear: {
            command: "npx",
            args: ["-y", "@anthropic/mcp-linear"],
          },
        },
      })
    );

    const { stdout, stderr } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "child-persona", "-v", "--headless", "-p", "test"],
      { cwd: testDir, reject: false }
    );

    const output = stdout + stderr;
    const match = output.match(/MCP config: ([^\s]+)/);

    if (match) {
      const mcpFile = match[1];
      const content = await readFile(mcpFile, "utf-8");

      // fetch should have child's config (custom-fetch.js), not parent's (npx)
      assert.ok(content.includes("custom-fetch.js"), "Child should override parent's fetch server");
      assert.ok(!content.includes("@anthropic/mcp-fetch"), "Parent's fetch config should be overridden");
    }
  });
});
