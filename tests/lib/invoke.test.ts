import { describe, it } from "vitest";
import assert from "node:assert";
import { join } from "node:path";

/**
 * Tests for invokePersona root persona handling
 *
 * The invokePersona function has special logic for the "root" persona:
 * - For "root": uses config.agentsDir as the persona path
 * - For other personas: uses config.personasDir/name as the persona path
 *
 * This mirrors the logic from invoke.ts:51-53
 */

// Inline the persona path resolution logic for testing
function resolvePersonaPath(
  personaName: string,
  agentsDir: string,
  personasDir: string
): string {
  // Root persona lives at agentsDir, not personasDir/root
  if (personaName === "root") {
    return agentsDir;
  }
  return join(personasDir, personaName);
}

describe("invokePersona path resolution", () => {
  const agentsDir = "/project/.agents";
  const personasDir = "/project/.agents/personas";

  describe("root persona handling", () => {
    it("resolves 'root' persona to agentsDir (not personasDir/root)", () => {
      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.strictEqual(path, "/project/.agents");
    });

    it("does NOT resolve 'root' to personasDir/root", () => {
      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.notStrictEqual(path, "/project/.agents/personas/root");
    });
  });

  describe("named persona handling", () => {
    it("resolves 'developer' to personasDir/developer", () => {
      const path = resolvePersonaPath("developer", agentsDir, personasDir);
      assert.strictEqual(path, "/project/.agents/personas/developer");
    });

    it("resolves 'reviewer' to personasDir/reviewer", () => {
      const path = resolvePersonaPath("reviewer", agentsDir, personasDir);
      assert.strictEqual(path, "/project/.agents/personas/reviewer");
    });

    it("handles hyphenated persona names", () => {
      const path = resolvePersonaPath("code-reviewer", agentsDir, personasDir);
      assert.strictEqual(path, "/project/.agents/personas/code-reviewer");
    });
  });

  describe("edge cases", () => {
    it("paths with trailing slashes work correctly", () => {
      // Ensure join handles this gracefully
      const path = resolvePersonaPath("developer", "/project/.agents/", "/project/.agents/personas/");
      assert.ok(path.includes("personas"));
      assert.ok(path.includes("developer"));
    });

    it("root persona at different project locations", () => {
      // Different project structures should work
      const customAgentsDir = "/home/user/myproject/custom-agents";
      const customPersonasDir = "/home/user/myproject/custom-agents/personas";

      const rootPath = resolvePersonaPath("root", customAgentsDir, customPersonasDir);
      assert.strictEqual(rootPath, "/home/user/myproject/custom-agents");

      const devPath = resolvePersonaPath("developer", customAgentsDir, customPersonasDir);
      assert.strictEqual(devPath, "/home/user/myproject/custom-agents/personas/developer");
    });
  });
});

describe("invokePersona channel-to-persona mapping", () => {
  /**
   * When a DM channel like @root is processed, the processor extracts the
   * persona name by removing the @ prefix. This ensures the mapping is correct.
   */

  it("@root channel maps to 'root' persona name", () => {
    const channel = "@root";
    const personaName = channel.slice(1);
    assert.strictEqual(personaName, "root");
  });

  it("@developer channel maps to 'developer' persona name", () => {
    const channel = "@developer";
    const personaName = channel.slice(1);
    assert.strictEqual(personaName, "developer");
  });
});
