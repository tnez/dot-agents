import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdir, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";

const CLI_PATH = join(process.cwd(), "dist/cli/index.js");

describe("Channel Commands E2E", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-spec-channels-${Date.now()}`);
    await mkdir(join(testDir, ".agents"), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("channels publish", () => {
    it("creates channel and returns message ID", async () => {
      const { stdout } = await execa(
        "node",
        [CLI_PATH, "channels", "publish", "#test", "hello world", "--from", "test-user"],
        { cwd: testDir }
      );

      assert.ok(stdout.includes("Published to #test"), "Publish should succeed");
      assert.ok(stdout.includes("Message ID:"), "Should return message ID");
    });

    it("publishes to DM channels", async () => {
      const { stdout } = await execa(
        "node",
        [CLI_PATH, "channels", "publish", "@test-user", "dm message", "--from", "sender"],
        { cwd: testDir }
      );

      assert.ok(stdout.includes("Published to @test-user"), "DM publish should succeed");
      assert.ok(stdout.includes("Message ID:"), "Should return message ID");
    });

    it("supports message tags", async () => {
      const { stdout } = await execa(
        "node",
        [CLI_PATH, "channels", "publish", "#tagged", "tagged message", "--from", "user", "--tags", "tag1,tag2"],
        { cwd: testDir }
      );

      assert.ok(stdout.includes("Published to #tagged"), "Publish with tags should succeed");
    });
  });

  describe("channels read", () => {
    it("shows published messages", async () => {
      await execa(
        "node",
        [CLI_PATH, "channels", "publish", "#read-test", "test message", "--from", "test-user"],
        { cwd: testDir }
      );

      const { stdout } = await execa("node", [CLI_PATH, "channels", "read", "#read-test"], {
        cwd: testDir,
      });

      assert.ok(stdout.includes("test message"), "Read should show message content");
      assert.ok(stdout.includes("test-user"), "Read should show sender");
    });

    it("handles non-existent channel gracefully", async () => {
      const { stdout } = await execa("node", [CLI_PATH, "channels", "read", "#nonexistent"], {
        cwd: testDir,
      });

      assert.ok(stdout.includes("No messages"), "Missing channel should handle gracefully");
    });

    it("supports time filtering with --since", async () => {
      await execa(
        "node",
        [CLI_PATH, "channels", "publish", "#filter-test", "recent message", "--from", "user"],
        { cwd: testDir }
      );

      const { stdout } = await execa("node", [CLI_PATH, "channels", "read", "#filter-test", "--since", "1h"], {
        cwd: testDir,
      });

      assert.ok(stdout.includes("recent message"), "Since filter should show recent messages");
    });
  });

  describe("channels reply", () => {
    it("creates thread with reply", async () => {
      // Publish initial message
      const publishResult = await execa(
        "node",
        [CLI_PATH, "channels", "publish", "#reply-test", "parent message", "--from", "user"],
        { cwd: testDir }
      );

      // Extract message ID
      const match = publishResult.stdout.match(/Message ID: ([^\s]+)/);
      assert.ok(match, "Should get message ID from publish");
      const messageId = match[1];

      // Reply to message
      const replyResult = await execa(
        "node",
        [CLI_PATH, "channels", "reply", "#reply-test", messageId, "this is a reply", "--from", "replier"],
        { cwd: testDir }
      );

      assert.ok(replyResult.stdout.includes("Replied"), "Reply should succeed");

      // Verify reply file exists
      const replyMatch = replyResult.stdout.match(/Reply ID: ([^\s]+)/);
      assert.ok(replyMatch, "Should get reply ID");
      const replyId = replyMatch[1];

      const replyPath = join(testDir, ".agents/channels/#reply-test", messageId, `${replyId}.md`);
      const content = await readFile(replyPath, "utf-8");
      assert.ok(content.includes("this is a reply"), "Reply content should be present");
    });

    it("handles invalid message ID gracefully", async () => {
      await mkdir(join(testDir, ".agents/channels/#reply-test"), { recursive: true });

      try {
        await execa(
          "node",
          [CLI_PATH, "channels", "reply", "#reply-test", "invalid-id", "orphan reply", "--from", "user"],
          { cwd: testDir }
        );
        assert.fail("Should throw error for invalid message ID");
      } catch (error: unknown) {
        const e = error as { stderr?: string; message?: string };
        assert.ok(
          e.stderr?.includes("not found") || e.message?.includes("not found") || e.stderr?.includes("Error"),
          "Should show error for invalid reply"
        );
      }
    });
  });

  describe("channels list", () => {
    it("shows all channels", async () => {
      await execa("node", [CLI_PATH, "channels", "publish", "#alpha", "msg"], { cwd: testDir });
      await execa("node", [CLI_PATH, "channels", "publish", "#beta", "msg"], { cwd: testDir });
      await execa("node", [CLI_PATH, "channels", "publish", "#gamma", "msg"], { cwd: testDir });

      const { stdout } = await execa("node", [CLI_PATH, "channels", "list"], { cwd: testDir });

      assert.ok(stdout.includes("#alpha"), "List should show alpha");
      assert.ok(stdout.includes("#beta"), "List should show beta");
      assert.ok(stdout.includes("#gamma"), "List should show gamma");
    });

    it("handles empty channels gracefully", async () => {
      const { stdout } = await execa("node", [CLI_PATH, "channels", "list"], { cwd: testDir });

      assert.ok(stdout.includes("No channels"), "Empty list should indicate no channels");
    });
  });

  describe("reply count display", () => {
    it("shows reply count in read output", async () => {
      // Publish parent message
      const publishResult = await execa(
        "node",
        [CLI_PATH, "channels", "publish", "#reply-count", "parent message", "--from", "user"],
        { cwd: testDir }
      );

      const match = publishResult.stdout.match(/Message ID: ([^\s]+)/);
      const messageId = match![1];

      // Add replies
      await execa(
        "node",
        [CLI_PATH, "channels", "reply", "#reply-count", messageId, "reply 1", "--from", "user"],
        { cwd: testDir }
      );
      await execa(
        "node",
        [CLI_PATH, "channels", "reply", "#reply-count", messageId, "reply 2", "--from", "user"],
        { cwd: testDir }
      );

      const { stdout } = await execa("node", [CLI_PATH, "channels", "read", "#reply-count"], {
        cwd: testDir,
      });

      assert.ok(stdout.includes("2 replies"), "Read should show reply count");
    });
  });
});

describe("Channel Process E2E", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-spec-process-${Date.now()}`);
    await mkdir(join(testDir, ".agents/personas/developer"), { recursive: true });
    await mkdir(join(testDir, ".agents/channels"), { recursive: true });
    await mkdir(join(testDir, ".agents/sessions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("processes @root channel with root persona at .agents/PERSONA.md", async () => {
    // Create root persona at .agents/PERSONA.md
    await writeFile(
      join(testDir, ".agents/PERSONA.md"),
      `---
name: root
description: Entry point persona
cmd:
  headless: cat
---

ROOT_PERSONA_MARKER: This is the root persona at .agents/PERSONA.md
`
    );

    // Publish message to @root
    await execa("node", [CLI_PATH, "channels", "publish", "@root", "Test message to root"], {
      cwd: testDir,
    });

    // Process should succeed
    const { exitCode } = await execa("node", [CLI_PATH, "channels", "process", "@root"], {
      cwd: testDir,
      reject: false,
    });

    assert.strictEqual(exitCode, 0, "channels process @root should succeed");
  });

  it("processes @developer channel with named persona", async () => {
    // Create developer persona
    await writeFile(
      join(testDir, ".agents/personas/developer/PERSONA.md"),
      `---
name: developer
description: Developer persona
cmd:
  headless: cat
---

DEVELOPER_PERSONA_MARKER: This is the developer persona
`
    );

    // Publish message to @developer
    await execa("node", [CLI_PATH, "channels", "publish", "@developer", "Test message to developer"], {
      cwd: testDir,
    });

    // Process should succeed
    const { exitCode } = await execa("node", [CLI_PATH, "channels", "process", "@developer"], {
      cwd: testDir,
      reject: false,
    });

    assert.strictEqual(exitCode, 0, "channels process @developer should succeed");
  });

  it("runs root persona from .agents/PERSONA.md", async () => {
    // Create root persona
    await writeFile(
      join(testDir, ".agents/PERSONA.md"),
      `---
name: root
description: Entry point persona
cmd:
  headless: cat
---

ROOT_PERSONA_MARKER: This is the root persona
`
    );

    const { stdout, exitCode } = await execa(
      "node",
      [CLI_PATH, "personas", "run", "root", "--headless", "-p", "Test prompt"],
      { cwd: testDir, reject: false }
    );

    assert.strictEqual(exitCode, 0, "personas run root should succeed");
    assert.ok(stdout.includes("ROOT_PERSONA_MARKER"), "Should include root persona content");
  });

  it("lists both root and named personas", async () => {
    // Create root persona
    await writeFile(
      join(testDir, ".agents/PERSONA.md"),
      `---
name: root
description: Root persona
cmd:
  headless: echo
---

Root prompt.
`
    );

    // Create developer persona
    await writeFile(
      join(testDir, ".agents/personas/developer/PERSONA.md"),
      `---
name: developer
description: Developer persona
cmd:
  headless: echo
---

Developer prompt.
`
    );

    const { exitCode } = await execa("node", [CLI_PATH, "list", "personas"], {
      cwd: testDir,
      reject: false,
    });

    assert.strictEqual(exitCode, 0, "list personas should succeed");
  });
});
