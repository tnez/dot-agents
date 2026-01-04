import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdir, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout } from "node:timers/promises";
import {
  startSession,
  updateSession,
  endSession,
  getSessionWorkspace,
} from "./session-thread.js";
import { readChannel } from "./channel.js";

// Small delay to ensure unique timestamps for message IDs
const tick = () => setTimeout(10);

describe("session-thread", () => {
  let testDir: string;
  let channelsDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = join(tmpdir(), `session-thread-test-${Date.now()}`);
    channelsDir = join(testDir, "channels");
    await mkdir(channelsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("startSession", () => {
    it("creates a session thread in #sessions", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      // Session ID should be an ISO timestamp
      assert.ok(session.id.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/));

      // Workspace should exist
      assert.ok(session.workspacePath.includes("workspace"));

      // Check that #sessions channel was created with the thread
      const sessionsDir = join(channelsDir, "#sessions");
      const entries = await readdir(sessionsDir);
      assert.ok(entries.includes(session.id));
    });

    it("includes goal in session message when provided", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "headless",
        trigger: "cron",
        goal: "Test goal description",
      });

      // Read the message content
      const messages = await readChannel(channelsDir, "#sessions");
      assert.strictEqual(messages.length, 1);
      assert.ok(messages[0].content.includes("Test goal description"));
      assert.ok(messages[0].content.includes("headless"));
      assert.ok(messages[0].content.includes("cron"));
    });

    it("includes upstream in session message when provided", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "dm",
        upstream: "@other-project#sessions --thread abc123",
      });

      const messages = await readChannel(channelsDir, "#sessions");
      assert.ok(messages[0].content.includes("@other-project#sessions"));
    });

    it("creates workspace directory", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      const workspaceEntries = await readdir(session.workspacePath).catch(() => null);
      assert.ok(workspaceEntries !== null, "Workspace directory should exist");
    });
  });

  describe("updateSession", () => {
    it("adds a reply to the session thread", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      await tick(); // Ensure reply gets unique timestamp from session start
      await updateSession(session, "First update");
      await tick();
      await updateSession(session, "Second update");

      const messages = await readChannel(channelsDir, "#sessions");
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].replies?.length, 2);
    });

    it("works with session ID string instead of session object", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      await tick(); // Ensure reply gets unique timestamp from session start
      await updateSession(session.id, channelsDir, "Update via ID");

      const messages = await readChannel(channelsDir, "#sessions");
      assert.strictEqual(messages[0].replies?.length, 1);
      assert.ok(messages[0].replies?.[0].content.includes("Update via ID"));
    });
  });

  describe("endSession", () => {
    it("posts a completion message to the thread", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "headless",
        trigger: "manual",
      });

      await tick();
      await endSession(session, {
        success: true,
        exitCode: 0,
        duration: 5000,
      });

      const messages = await readChannel(channelsDir, "#sessions");
      assert.strictEqual(messages[0].replies?.length, 1);

      const endMessage = messages[0].replies?.[0].content;
      assert.ok(endMessage?.includes("Session Ended"));
      assert.ok(endMessage?.includes("Success:** ✓"));
      assert.ok(endMessage?.includes("Exit Code:** 0"));
      assert.ok(endMessage?.includes("5.0s"));
    });

    it("includes error message when session failed", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "headless",
        trigger: "manual",
      });

      await tick();
      await endSession(session, {
        success: false,
        exitCode: 1,
        duration: 1234,
        error: "Something went wrong",
      });

      const messages = await readChannel(channelsDir, "#sessions");
      const endMessage = messages[0].replies?.[0].content;
      assert.ok(endMessage?.includes("Success:** ✗"));
      assert.ok(endMessage?.includes("Something went wrong"));
    });

    it("formats duration correctly for various lengths", async () => {
      // Test milliseconds
      let session = await startSession({
        channelsDir,
        persona: "test",
        mode: "headless",
        trigger: "manual",
      });
      await tick();
      await endSession(session, { success: true, exitCode: 0, duration: 500 });
      let messages = await readChannel(channelsDir, "#sessions");
      assert.ok(messages[0].replies?.[0].content.includes("500ms"));

      // Test minutes
      await tick();
      session = await startSession({
        channelsDir,
        persona: "test",
        mode: "headless",
        trigger: "manual",
      });
      await tick();
      await endSession(session, { success: true, exitCode: 0, duration: 125000 });
      messages = await readChannel(channelsDir, "#sessions");
      assert.ok(messages[0].replies?.[0].content.includes("2m 5s"));

      // Test hours
      await tick();
      session = await startSession({
        channelsDir,
        persona: "test",
        mode: "headless",
        trigger: "manual",
      });
      await tick();
      await endSession(session, { success: true, exitCode: 0, duration: 3720000 });
      messages = await readChannel(channelsDir, "#sessions");
      assert.ok(messages[0].replies?.[0].content.includes("1h 2m"));
    });
  });

  describe("getSessionWorkspace", () => {
    it("returns workspace path for existing session", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      const workspace = await getSessionWorkspace(channelsDir, session.id);
      assert.strictEqual(workspace, session.workspacePath);
    });

    it("returns null for non-existent session", async () => {
      const workspace = await getSessionWorkspace(channelsDir, "non-existent-id");
      assert.strictEqual(workspace, null);
    });

    it("creates workspace when create=true", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      // Remove workspace to test creation
      await rm(session.workspacePath, { recursive: true });

      const workspace = await getSessionWorkspace(channelsDir, session.id, true);
      assert.ok(workspace !== null);

      const entries = await readdir(workspace!).catch(() => null);
      assert.ok(entries !== null);
    });
  });

  describe("thread message structure", () => {
    it("uses uniform timestamp naming for messages", async () => {
      const session = await startSession({
        channelsDir,
        persona: "test-persona",
        mode: "interactive",
        trigger: "manual",
      });

      const threadDir = join(channelsDir, "#sessions", session.id);
      const entries = await readdir(threadDir);

      // Should have: <timestamp>.md (initial), workspace/
      const mdFiles = entries.filter(e => e.endsWith(".md"));
      assert.strictEqual(mdFiles.length, 1);

      // The .md file should be named with the session ID (thread ID)
      assert.ok(mdFiles[0] === `${session.id}.md`);
    });
  });
});
