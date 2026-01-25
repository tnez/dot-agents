import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";

const CLI_PATH = join(process.cwd(), "dist/cli/index.js");

describe("Persona Inheritance E2E", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-spec-personas-${Date.now()}`);
    await mkdir(join(testDir, ".agents/personas/test-persona"), {
      recursive: true,
    });
    await mkdir(join(testDir, ".agents/workflows"), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("inherits _base persona by default", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-persona/PERSONA.md"),
      `---
name: test-persona
description: Test persona for inheritance testing
cmd:
  headless: echo "test"
---

This is the test persona prompt.
`
    );

    const { stdout } = await execa("node", [CLI_PATH, "personas", "show", "test-persona"], {
      cwd: testDir,
    });

    // Should include _base in inheritance chain
    assert.ok(stdout.includes("_base"), "Should show _base in inheritance");
    assert.ok(stdout.includes("Inheritance:"), "Should show inheritance line");

    // Should include channel conventions from _base
    assert.ok(stdout.includes("#journals") || stdout.includes("#sessions"), "Should include channel guidance");

    // Should also include user persona prompt
    assert.ok(stdout.includes("This is the test persona prompt"), "Should include user persona prompt");
  });

  it("shows correct inheritance chain order", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-persona/PERSONA.md"),
      `---
name: test-persona
description: Test persona
cmd:
  headless: echo "test"
---

Test prompt.
`
    );

    const { stdout } = await execa("node", [CLI_PATH, "personas", "show", "test-persona"], {
      cwd: testDir,
    });

    // Find inheritance line
    const lines = stdout.split("\n");
    const inheritanceLine = lines.find((l) => l.includes("Inheritance:"));

    assert.ok(inheritanceLine, "Should have inheritance line");
    assert.ok(inheritanceLine.includes("_base"), "Inheritance should include _base");
    assert.ok(inheritanceLine.includes("test-persona"), "Inheritance should include test-persona");
  });

  // TODO: extends: none is not yet implemented - _base is always inherited
  // See ROADMAP.md for future implementation plans
  it.skip("opts out of base inheritance with extends: none", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-persona/PERSONA.md"),
      `---
name: test-persona
description: Persona that opts out of base
extends: none
cmd:
  headless: echo "test"
---

Standalone persona without base.
`
    );

    const { stdout } = await execa("node", [CLI_PATH, "personas", "show", "test-persona"], {
      cwd: testDir,
    });

    // Should NOT include _base
    assert.ok(!stdout.includes("_base"), "Should NOT include _base when extends: none");

    // Should still include user prompt
    assert.ok(stdout.includes("Standalone persona without base"), "Should include user prompt");
  });

  // TODO: extends: <parent-name> is not yet implemented for explicit persona chaining
  // Currently, personas inherit implicitly via directory structure (root → child)
  // and always inherit _base. See ROADMAP.md for future plans.
  it.skip("inherits base through parent via extends", async () => {
    // Create parent persona
    await mkdir(join(testDir, ".agents/personas/parent"), { recursive: true });
    await writeFile(
      join(testDir, ".agents/personas/parent/PERSONA.md"),
      `---
name: parent
description: Parent persona
cmd:
  headless: echo "test"
---

Parent prompt.
`
    );

    // Create child persona with explicit extends
    await mkdir(join(testDir, ".agents/personas/child"), { recursive: true });
    await writeFile(
      join(testDir, ".agents/personas/child/PERSONA.md"),
      `---
name: child
description: Child persona
extends: parent
cmd:
  headless: echo "child"
---

Child prompt.
`
    );

    const { stdout } = await execa("node", [CLI_PATH, "personas", "show", "child"], {
      cwd: testDir,
    });

    // Should include _base in inheritance
    assert.ok(stdout.includes("_base"), "Child should inherit _base");
    assert.ok(stdout.includes("parent"), "Child should show parent in chain");

    // Should also include child's own prompt
    assert.ok(stdout.includes("Child prompt"), "Child should include own prompt");
  });
});

describe("Personas Run E2E", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-spec-run-${Date.now()}`);
    await mkdir(join(testDir, ".agents/personas/test-runner"), {
      recursive: true,
    });
    await mkdir(join(testDir, ".agents/workflows"), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("injects system prompt in headless mode", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-runner/PERSONA.md"),
      `---
name: test-runner
description: Test persona for run testing
extends: none
cmd:
  headless: cat
---

SYSTEM_PROMPT_MARKER: This is the system prompt from PERSONA.md
`
    );

    const { stdout } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "test-runner", "--headless", "-p", "USER_PROMPT_MARKER: This is the user prompt"],
      { cwd: testDir }
    );

    // Should contain system prompt
    assert.ok(stdout.includes("SYSTEM_PROMPT_MARKER"), "Should include system prompt marker");
    assert.ok(stdout.includes("This is the system prompt from PERSONA.md"), "Should include full system prompt");

    // Should contain user prompt
    assert.ok(stdout.includes("USER_PROMPT_MARKER"), "Should include user prompt marker");
    assert.ok(stdout.includes("This is the user prompt"), "Should include full user prompt");
  });

  it("runs with system prompt only (no user prompt)", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-runner/PERSONA.md"),
      `---
name: test-runner
description: Test persona
extends: none
cmd:
  headless: cat
---

SYSTEM_PROMPT_MARKER: This is the system prompt
`
    );

    const { stdout } = await execa("node", [CLI_PATH, "personas", "run", "test-runner", "--headless"], {
      cwd: testDir,
    });

    // Should contain system prompt even without user prompt
    assert.ok(stdout.includes("SYSTEM_PROMPT_MARKER"), "Should include system prompt without user prompt");
  });

  it("adds separator between system and user prompts", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-runner/PERSONA.md"),
      `---
name: test-runner
description: Test persona
extends: none
cmd:
  headless: cat
---

System prompt content
`
    );

    const { stdout } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "test-runner", "--headless", "-p", "USER_PROMPT"],
      { cwd: testDir }
    );

    // Should contain separator
    assert.ok(stdout.includes("---"), "Should include separator between prompts");
  });

  // TODO: extends: <parent-name> is not yet implemented for explicit prompt chaining
  // See ROADMAP.md for future plans.
  it.skip("includes inherited system prompts", async () => {
    // Create parent persona
    await mkdir(join(testDir, ".agents/personas/parent"), { recursive: true });
    await writeFile(
      join(testDir, ".agents/personas/parent/PERSONA.md"),
      `---
name: parent
description: Parent persona
extends: none
cmd:
  headless: cat
---

PARENT_PROMPT_MARKER: This is from parent
`
    );

    // Create child that extends parent (inherits cmd from parent)
    await mkdir(join(testDir, ".agents/personas/child"), { recursive: true });
    await writeFile(
      join(testDir, ".agents/personas/child/PERSONA.md"),
      `---
name: child
description: Child persona
extends: parent
cmd:
  headless: cat
---

CHILD_PROMPT_MARKER: This is from child
`
    );

    const { stdout } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "child", "--headless", "-p", "USER_INPUT"],
      { cwd: testDir }
    );

    // Should contain both parent and child prompts
    assert.ok(stdout.includes("PARENT_PROMPT_MARKER"), "Should include parent prompt");
    assert.ok(stdout.includes("CHILD_PROMPT_MARKER"), "Should include child prompt");
    assert.ok(stdout.includes("USER_INPUT"), "Should include user input");
  });

  it("shows system prompt info in verbose mode", async () => {
    await writeFile(
      join(testDir, ".agents/personas/test-runner/PERSONA.md"),
      `---
name: test-runner
description: Test persona
extends: none
cmd:
  headless: cat
---

System prompt content
`
    );

    const { stdout, stderr } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "test-runner", "--headless", "-p", "test", "-v"],
      { cwd: testDir }
    );

    // Verbose output may go to stderr or stdout
    const output = stdout + stderr;
    assert.ok(output.includes("System prompt:"), "Verbose should show system prompt info");
  });
});
