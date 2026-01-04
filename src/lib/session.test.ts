import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateSessionId,
  parseSessionId,
  createSession,
  finalizeSession,
  getRecentSessions,
  readSession,
} from "./session.js";

describe("generateSessionId", () => {
  it("generates ISO-like format with dashes for colons", () => {
    const date = new Date("2025-12-22T15:30:45.123Z");
    const id = generateSessionId(date);
    assert.equal(id, "2025-12-22T15-30-45");
  });

  it("generates unique IDs for different times", () => {
    const date1 = new Date("2025-12-22T15:30:45.000Z");
    const date2 = new Date("2025-12-22T15:30:46.000Z");
    const id1 = generateSessionId(date1);
    const id2 = generateSessionId(date2);
    assert.notEqual(id1, id2);
  });
});

describe("parseSessionId", () => {
  it("parses valid session ID back to Date", () => {
    const id = "2025-12-22T15-30-45";
    const date = parseSessionId(id);
    assert.ok(date);
    assert.equal(date.toISOString(), "2025-12-22T15:30:45.000Z");
  });

  it("returns null for invalid format", () => {
    assert.equal(parseSessionId("invalid"), null);
    assert.equal(parseSessionId("2025-12-22"), null);
    assert.equal(parseSessionId(""), null);
  });
});

describe("createSession", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("creates session directory", async () => {
    const session = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test-host",
        executionMode: "headless",
        triggerType: "manual",
        workingDir: "/test",
      },
    });

    const dirs = await readdir(testDir);
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0], session.id);
  });

  it("creates session.md with frontmatter", async () => {
    const session = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test-host",
        executionMode: "interactive",
        triggerType: "cron",
        workingDir: "/test/dir",
      },
      goal: "Test goal",
      persona: { name: "developer", inheritanceChain: ["_base", "developer"] },
    });

    const content = await readFile(session.sessionFile, "utf-8");
    assert.ok(content.startsWith("---"));
    assert.ok(content.includes("id: " + session.id));
    assert.ok(content.includes("goal: Test goal"));
    assert.ok(content.includes("hostname: test-host"));
    assert.ok(content.includes("executionMode: interactive"));
    assert.ok(content.includes("name: developer"));
  });

  it("includes upstream when provided", async () => {
    const session = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test-host",
        executionMode: "headless",
        triggerType: "dm",
        workingDir: "/test",
      },
      upstream: "@odin:dottie --session-id abc123",
    });

    const content = await readFile(session.sessionFile, "utf-8");
    assert.ok(content.includes("upstream: \"@odin:dottie --session-id abc123\""));
  });
});

describe("finalizeSession", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("updates session.md with results", async () => {
    const session = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test-host",
        executionMode: "headless",
        triggerType: "manual",
        workingDir: "/test",
      },
    });

    await finalizeSession(session, {
      success: true,
      exitCode: 0,
      duration: 1234,
      stdout: "output text",
    });

    const content = await readFile(session.sessionFile, "utf-8");
    assert.ok(content.includes("ended:"));
    assert.ok(content.includes("success: true"));
    assert.ok(content.includes("exitCode: 0"));
    assert.ok(content.includes("duration: 1234"));
    assert.ok(content.includes("output text"));
  });

  it("includes error information on failure", async () => {
    const session = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test-host",
        executionMode: "headless",
        triggerType: "manual",
        workingDir: "/test",
      },
    });

    await finalizeSession(session, {
      success: false,
      exitCode: 1,
      duration: 500,
      error: "Something went wrong",
      stderr: "error output",
    });

    const content = await readFile(session.sessionFile, "utf-8");
    assert.ok(content.includes("success: false"));
    assert.ok(content.includes("exitCode: 1"));
    assert.ok(content.includes("error: Something went wrong"));
    assert.ok(content.includes("error output"));
  });
});

describe("getRecentSessions", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns empty array for empty directory", async () => {
    const sessions = await getRecentSessions(testDir);
    assert.deepEqual(sessions, []);
  });

  it("returns sessions sorted by date (newest first)", async () => {
    // Create sessions with explicit different dates
    const dates = [
      new Date("2025-01-01T10:00:00Z"),
      new Date("2025-01-01T12:00:00Z"),
      new Date("2025-01-01T11:00:00Z"),
    ];

    for (const date of dates) {
      // Create session directories manually with different IDs
      const id = date.toISOString().replace(/:/g, "-").split(".")[0];
      const sessionPath = join(testDir, id);
      await mkdir(sessionPath, { recursive: true });
      const content = `---
id: ${id}
started: ${date.toISOString()}
runtime:
  hostname: test
  executionMode: headless
  triggerType: manual
  workingDir: /test
---

# Session Log
`;
      await writeFile(join(sessionPath, "session.md"), content, "utf-8");
    }

    const sessions = await getRecentSessions(testDir);
    assert.equal(sessions.length, 3);

    // Verify sorted newest first (12:00 > 11:00 > 10:00)
    assert.equal(sessions[0].id, "2025-01-01T12-00-00");
    assert.equal(sessions[1].id, "2025-01-01T11-00-00");
    assert.equal(sessions[2].id, "2025-01-01T10-00-00");
  });

  it("respects limit parameter", async () => {
    // Create 5 sessions with explicit different dates
    for (let i = 0; i < 5; i++) {
      const date = new Date(`2025-01-01T1${i}:00:00Z`);
      const id = date.toISOString().replace(/:/g, "-").split(".")[0];
      const sessionPath = join(testDir, id);
      await mkdir(sessionPath, { recursive: true });
      const content = `---
id: ${id}
started: ${date.toISOString()}
runtime:
  hostname: test
  executionMode: headless
  triggerType: manual
  workingDir: /test
---

# Session Log
`;
      await writeFile(join(sessionPath, "session.md"), content, "utf-8");
    }

    const sessions = await getRecentSessions(testDir, 3);
    assert.equal(sessions.length, 3);
  });

  it("includes metadata when available", async () => {
    await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test",
        executionMode: "headless",
        triggerType: "manual",
        workingDir: "/test",
      },
      persona: { name: "developer" },
      workflow: { name: "test-workflow" },
    });

    const sessions = await getRecentSessions(testDir);
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0].metadata);
    assert.equal(sessions[0].metadata?.persona?.name, "developer");
    assert.equal(sessions[0].metadata?.workflow?.name, "test-workflow");
  });
});

describe("readSession", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dot-agents-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("reads existing session", async () => {
    const created = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test",
        executionMode: "headless",
        triggerType: "manual",
        workingDir: "/test",
      },
      goal: "Test session",
    });

    const read = await readSession(testDir, created.id);
    assert.ok(read);
    assert.equal(read.id, created.id);
    assert.equal(read.metadata.goal, "Test session");
  });

  it("returns null for non-existent session", async () => {
    const result = await readSession(testDir, "non-existent-id");
    assert.equal(result, null);
  });

  it("reads session content (body) from session.md", async () => {
    // Create a session directory with custom content in session.md
    const sessionId = "2025-12-23T10-00-00";
    const sessionPath = join(testDir, sessionId);
    await mkdir(sessionPath, { recursive: true });

    const sessionContent = `---
id: ${sessionId}
started: 2025-12-23T10:00:00.000Z
runtime:
  hostname: test
  executionMode: interactive
  triggerType: manual
  workingDir: /test
goal: "Work on feature X"
---

# Session Log

Session started.

## Task Progress

- Investigated the issue
- Found the root cause in src/lib/foo.ts
- Started implementing the fix

## Next Steps

- Complete the implementation
- Add tests
`;
    await writeFile(join(sessionPath, "session.md"), sessionContent, "utf-8");

    const read = await readSession(testDir, sessionId);
    assert.ok(read);
    assert.equal(read.id, sessionId);
    assert.equal(read.metadata.goal, "Work on feature X");
    assert.ok(read.content);
    assert.ok(read.content.includes("# Session Log"));
    assert.ok(read.content.includes("Investigated the issue"));
    assert.ok(read.content.includes("Found the root cause"));
    assert.ok(read.content.includes("Complete the implementation"));
  });

  it("returns undefined content for session with empty body", async () => {
    const created = await createSession({
      sessionsDir: testDir,
      runtime: {
        hostname: "test",
        executionMode: "headless",
        triggerType: "manual",
        workingDir: "/test",
      },
    });

    // Overwrite with empty body
    const emptyContent = `---
id: ${created.id}
started: 2025-12-23T10:00:00.000Z
runtime:
  hostname: test
  executionMode: headless
  triggerType: manual
  workingDir: /test
---

`;
    await writeFile(created.sessionFile, emptyContent, "utf-8");

    const read = await readSession(testDir, created.id);
    assert.ok(read);
    assert.equal(read.content, undefined);
  });
});
