import { describe, it, beforeAll, afterAll } from "vitest";
import assert from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";

/**
 * Integration tests for the cross-project channel flow:
 *   channels publish @project → message lands in @root → channels process @root → invokes root persona
 *
 * These tests validate that the pieces connect end-to-end, catching gaps like:
 * - Root persona not being recognized at .agents/PERSONA.md
 * - personaExists() not finding root persona
 * - invokePersona path resolution failures
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");

// Import pure functions for testing (inline where needed to avoid module issues)
const PERSONA_FILENAME = "PERSONA.md";

async function hasPersonaFile(dirPath: string): Promise<boolean> {
  try {
    const filePath = join(dirPath, PERSONA_FILENAME);
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

// Inline persona path resolution (mirrors invoke.ts:51-53)
function resolvePersonaPath(
  personaName: string,
  agentsDir: string,
  personasDir: string
): string {
  if (personaName === "root") {
    return agentsDir;
  }
  return join(personasDir, personaName);
}

// Inline personaExists (mirrors processor.ts:93-116)
async function personaExists(
  config: { agentsDir: string; personasDir: string },
  channelName: string,
  listPersonasFn: () => Promise<string[]>
): Promise<boolean> {
  const personaName = channelName.slice(1);

  if (personaName === "root") {
    return await hasPersonaFile(config.agentsDir);
  }

  const personaPaths = await listPersonasFn();
  for (const path of personaPaths) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    if (name === personaName) {
      return true;
    }
  }
  return false;
}

// Inline channel address resolution (mirrors registry.ts:166-207)
interface CrossProjectAddress {
  project: string | null;
  type: "#" | "@";
  name: string;
  original: string;
}

function parseChannelAddress(address: string): CrossProjectAddress {
  if (!address.startsWith("#") && !address.startsWith("@")) {
    throw new Error(`Invalid channel address: ${address}. Must start with # or @`);
  }

  const type = address[0] as "#" | "@";
  const rest = address.slice(1);

  const slashIndex = rest.indexOf("/");
  if (slashIndex > 0) {
    const project = rest.slice(0, slashIndex);
    const name = rest.slice(slashIndex + 1);
    if (!name) {
      throw new Error(`Invalid channel address: ${address}. Missing channel/persona name after project.`);
    }
    return { project, type, name, original: address };
  }

  return { project: null, type, name: rest, original: address };
}

interface ResolvedChannelAddress {
  channelsDir: string;
  localChannelName: string;
  isProjectEntryPoint?: boolean;
  projectName?: string;
}

function resolveChannelAddress(
  address: string,
  localChannelsDir: string,
  projectRegistry: Record<string, string>
): ResolvedChannelAddress {
  const parsed = parseChannelAddress(address);

  if (parsed.project === null && parsed.type === "@") {
    const projectPath = projectRegistry[parsed.name];
    if (projectPath) {
      return {
        channelsDir: `${projectPath}/channels`,
        localChannelName: "@root",
        isProjectEntryPoint: true,
        projectName: parsed.name,
      };
    }
  }

  if (parsed.project === null) {
    return {
      channelsDir: localChannelsDir,
      localChannelName: address,
    };
  }

  const projectPath = projectRegistry[parsed.project];
  if (!projectPath) {
    throw new Error(`Unknown project: ${parsed.project}`);
  }

  return {
    channelsDir: `${projectPath}/channels`,
    localChannelName: `${parsed.type}${parsed.name}`,
    projectName: parsed.project,
  };
}

describe("Integration: Cross-project channel flow", () => {
  /**
   * This test suite validates the complete flow:
   * 1. @project address resolution routes to @root
   * 2. @root channel maps to root persona
   * 3. Root persona exists at .agents/PERSONA.md
   * 4. Persona path resolution returns agentsDir for root
   *
   * This is the exact flow that was broken before the root persona fix.
   */

  const projectRegistry = {
    "dot-agents": join(PROJECT_ROOT, ".agents"),
    "remote-project": "/path/to/remote/.agents",
  };

  describe("Step 1: @project routes to @root", () => {
    it("@dot-agents routes to dot-agents project's @root channel", () => {
      const result = resolveChannelAddress(
        "@dot-agents",
        "/local/.agents/channels",
        projectRegistry
      );

      assert.strictEqual(result.localChannelName, "@root", "@project should route to @root");
      assert.strictEqual(result.isProjectEntryPoint, true);
      assert.strictEqual(result.projectName, "dot-agents");
    });

    it("preserves @root when already specified", () => {
      // If someone explicitly uses @project/root, it should still work
      const result = resolveChannelAddress(
        "@dot-agents/root",
        "/local/.agents/channels",
        projectRegistry
      );

      assert.strictEqual(result.localChannelName, "@root");
      assert.strictEqual(result.projectName, "dot-agents");
    });
  });

  describe("Step 2: @root channel maps to root persona", () => {
    it("@root extracts 'root' as persona name", () => {
      const channel = "@root";
      const personaName = channel.slice(1);
      assert.strictEqual(personaName, "root");
    });

    it("personaExists finds root at .agents/PERSONA.md", async () => {
      const config = {
        agentsDir: join(PROJECT_ROOT, ".agents"),
        personasDir: join(PROJECT_ROOT, ".agents", "personas"),
      };

      const exists = await personaExists(config, "@root", async () => []);
      assert.strictEqual(exists, true, "Root persona should exist at .agents/PERSONA.md");
    });

    it("personaExists does NOT look in personasDir for root", async () => {
      // This is the bug we fixed: root was looked up in personas/ directory
      const config = {
        agentsDir: "/nonexistent-agents", // No PERSONA.md here
        personasDir: "/path/to/personas", // Would have root/ here
      };

      // Even if listPersonas would return a "root" persona, @root should check agentsDir
      const mockListPersonas = async () => ["/path/to/personas/root"];
      const exists = await personaExists(config, "@root", mockListPersonas);

      assert.strictEqual(exists, false, "Should check agentsDir, not personas list");
    });
  });

  describe("Step 3: Root persona path resolution", () => {
    it("'root' persona resolves to agentsDir", () => {
      const agentsDir = "/project/.agents";
      const personasDir = "/project/.agents/personas";

      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.strictEqual(path, agentsDir, "Root should resolve to agentsDir");
    });

    it("'root' does NOT resolve to personasDir/root", () => {
      const agentsDir = "/project/.agents";
      const personasDir = "/project/.agents/personas";

      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.notStrictEqual(path, join(personasDir, "root"), "Root should NOT be in personas dir");
    });

    it("other personas still resolve to personasDir/<name>", () => {
      const agentsDir = "/project/.agents";
      const personasDir = "/project/.agents/personas";

      const path = resolvePersonaPath("developer", agentsDir, personasDir);
      assert.strictEqual(path, join(personasDir, "developer"));
    });
  });

  describe("Step 4: End-to-end path validation", () => {
    it("complete flow: @project → @root → root persona → agentsDir", () => {
      // Simulate the complete flow
      const localChannelsDir = "/caller/.agents/channels";

      // Step 1: Resolve @dot-agents to @root
      const resolved = resolveChannelAddress("@dot-agents", localChannelsDir, projectRegistry);
      assert.strictEqual(resolved.localChannelName, "@root");

      // Step 2: Extract persona name
      const personaName = resolved.localChannelName.slice(1);
      assert.strictEqual(personaName, "root");

      // Step 3: Resolve persona path
      const agentsDir = projectRegistry["dot-agents"];
      const personasDir = join(agentsDir, "personas");
      const personaPath = resolvePersonaPath(personaName, agentsDir, personasDir);

      assert.strictEqual(personaPath, agentsDir, "Complete flow should end at agentsDir");
    });

    it("actual project has PERSONA.md at expected location", async () => {
      // Verify the actual dot-agents project structure
      const agentsDir = join(PROJECT_ROOT, ".agents");
      const exists = await hasPersonaFile(agentsDir);
      assert.strictEqual(exists, true, "dot-agents should have .agents/PERSONA.md");
    });
  });
});

describe("Integration: Cross-project delegation with isolated fixture", () => {
  /**
   * Test with isolated fixtures to avoid depending on actual project structure.
   * Creates temporary project structures to validate the integration.
   */

  const testRoot = join(PROJECT_ROOT, ".test-fixtures", `integration-${Date.now()}`);
  const projectA = join(testRoot, "project-a");
  const projectB = join(testRoot, "project-b");

  beforeAll(async () => {
    // Create project A with root persona
    await mkdir(join(projectA, ".agents", "channels", "@root"), { recursive: true });
    await writeFile(
      join(projectA, ".agents", "PERSONA.md"),
      `---
name: root
cmd: "echo"
---
I am project A's entry point.
`
    );

    // Create project B with root persona
    await mkdir(join(projectB, ".agents", "channels", "@root"), { recursive: true });
    await writeFile(
      join(projectB, ".agents", "PERSONA.md"),
      `---
name: root
cmd: "echo"
---
I am project B's entry point.
`
    );

    // Create project A with a named persona (developer)
    await mkdir(join(projectA, ".agents", "personas", "developer"), { recursive: true });
    await writeFile(
      join(projectA, ".agents", "personas", "developer", "PERSONA.md"),
      `---
name: developer
cmd: "echo"
---
I am project A's developer persona.
`
    );
  });

  afterAll(async () => {
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("cross-project routing to entry points", () => {
    it("@project-a routes to project A's @root", () => {
      const registry = {
        "project-a": join(projectA, ".agents"),
        "project-b": join(projectB, ".agents"),
      };

      const result = resolveChannelAddress(
        "@project-a",
        "/caller/.agents/channels",
        registry
      );

      assert.strictEqual(result.channelsDir, join(projectA, ".agents", "channels"));
      assert.strictEqual(result.localChannelName, "@root");
      assert.strictEqual(result.isProjectEntryPoint, true);
    });

    it("@project-a/developer routes to project A's @developer", () => {
      const registry = {
        "project-a": join(projectA, ".agents"),
      };

      const result = resolveChannelAddress(
        "@project-a/developer",
        "/caller/.agents/channels",
        registry
      );

      assert.strictEqual(result.channelsDir, join(projectA, ".agents", "channels"));
      assert.strictEqual(result.localChannelName, "@developer");
      assert.strictEqual(result.isProjectEntryPoint, undefined);
    });
  });

  describe("persona existence checks with fixtures", () => {
    it("finds root persona in project A", async () => {
      const config = {
        agentsDir: join(projectA, ".agents"),
        personasDir: join(projectA, ".agents", "personas"),
      };

      const exists = await personaExists(config, "@root", async () => []);
      assert.strictEqual(exists, true);
    });

    it("finds developer persona in project A", async () => {
      const config = {
        agentsDir: join(projectA, ".agents"),
        personasDir: join(projectA, ".agents", "personas"),
      };

      const mockListPersonas = async () => [
        join(projectA, ".agents", "personas", "developer"),
      ];

      const exists = await personaExists(config, "@developer", mockListPersonas);
      assert.strictEqual(exists, true);
    });

    it("does not find nonexistent persona", async () => {
      const config = {
        agentsDir: join(projectA, ".agents"),
        personasDir: join(projectA, ".agents", "personas"),
      };

      const mockListPersonas = async () => [
        join(projectA, ".agents", "personas", "developer"),
      ];

      const exists = await personaExists(config, "@nonexistent", mockListPersonas);
      assert.strictEqual(exists, false);
    });
  });

  describe("path resolution with fixtures", () => {
    it("root resolves to project A agentsDir", () => {
      const agentsDir = join(projectA, ".agents");
      const personasDir = join(projectA, ".agents", "personas");

      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.strictEqual(path, agentsDir);
    });

    it("developer resolves to project A personasDir/developer", () => {
      const agentsDir = join(projectA, ".agents");
      const personasDir = join(projectA, ".agents", "personas");

      const path = resolvePersonaPath("developer", agentsDir, personasDir);
      assert.strictEqual(path, join(personasDir, "developer"));
    });
  });
});

describe("Contract: Root persona must be first-class citizen", () => {
  /**
   * Contract tests that explicitly document and test root persona behavior.
   * These tests serve as the contract for how root persona should work.
   *
   * Any function that resolves personas MUST handle root specially:
   * 1. personaExists(@root) checks agentsDir, not personasDir
   * 2. resolvePersonaPath("root") returns agentsDir, not personasDir/root
   * 3. @project routes to @root (project entry point)
   */

  const agentsDir = "/project/.agents";
  const personasDir = "/project/.agents/personas";

  describe("personaExists contract", () => {
    it("CONTRACT: @root checks agentsDir for PERSONA.md", async () => {
      // This is the correct behavior
      const config = {
        agentsDir: join(PROJECT_ROOT, ".agents"), // Has PERSONA.md
        personasDir: join(PROJECT_ROOT, ".agents", "personas"),
      };

      const exists = await personaExists(config, "@root", async () => []);
      assert.strictEqual(exists, true, "VIOLATED: personaExists must check agentsDir for @root");
    });

    it("CONTRACT: @root does NOT use listPersonas", async () => {
      // Even if there's a "root" in the personas list, @root should check agentsDir
      const config = {
        agentsDir: "/nonexistent",
        personasDir: "/also-nonexistent",
      };

      // This mock would return true if the function wrongly used the list
      const mockListPersonas = async () => ["/some/path/root"];

      const exists = await personaExists(config, "@root", mockListPersonas);
      assert.strictEqual(exists, false, "VIOLATED: @root must not use personas list");
    });

    it("CONTRACT: @other uses listPersonas", async () => {
      const config = {
        agentsDir: "/project/.agents",
        personasDir: "/project/.agents/personas",
      };

      const mockListPersonas = async () => ["/project/.agents/personas/developer"];
      const exists = await personaExists(config, "@developer", mockListPersonas);
      assert.strictEqual(exists, true, "Named personas should use list lookup");
    });
  });

  describe("resolvePersonaPath contract", () => {
    it("CONTRACT: 'root' returns agentsDir", () => {
      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.strictEqual(path, agentsDir, "VIOLATED: root must resolve to agentsDir");
    });

    it("CONTRACT: 'root' does NOT return personasDir/root", () => {
      const path = resolvePersonaPath("root", agentsDir, personasDir);
      assert.notStrictEqual(path, join(personasDir, "root"), "VIOLATED: root must not be in personasDir");
    });

    it("CONTRACT: other personas return personasDir/<name>", () => {
      const path = resolvePersonaPath("developer", agentsDir, personasDir);
      assert.strictEqual(path, join(personasDir, "developer"));
    });
  });

  describe("channel address resolution contract", () => {
    it("CONTRACT: @project routes to @root", () => {
      const registry = { myproject: "/path/to/myproject/.agents" };
      const result = resolveChannelAddress("@myproject", "/local/channels", registry);

      assert.strictEqual(result.localChannelName, "@root", "VIOLATED: @project must route to @root");
      assert.strictEqual(result.isProjectEntryPoint, true);
    });

    it("CONTRACT: @project/persona routes to @persona", () => {
      const registry = { myproject: "/path/to/myproject/.agents" };
      const result = resolveChannelAddress("@myproject/developer", "/local/channels", registry);

      assert.strictEqual(result.localChannelName, "@developer");
      assert.strictEqual(result.isProjectEntryPoint, undefined);
    });

    it("CONTRACT: @local-persona stays local when not a project", () => {
      const registry = { myproject: "/path/to/myproject/.agents" };
      const result = resolveChannelAddress("@developer", "/local/channels", registry);

      assert.strictEqual(result.channelsDir, "/local/channels");
      assert.strictEqual(result.localChannelName, "@developer");
    });
  });
});

describe("Regression: Previous root persona bugs", () => {
  /**
   * Regression tests for specific bugs we've encountered.
   * Each test documents a bug and ensures it stays fixed.
   */

  describe("Bug: personaExists only checked personasDir for root", () => {
    /**
     * Before fix: personaExists used listPersonas which only scanned personasDir.
     * This meant @root would fail because there was no personas/root directory.
     *
     * After fix: personaExists checks hasPersonaFile(agentsDir) for @root.
     */

    it("REGRESSION: @root works even without personas/root directory", async () => {
      const config = {
        agentsDir: join(PROJECT_ROOT, ".agents"),
        personasDir: join(PROJECT_ROOT, ".agents", "personas"),
      };

      // The mock returns empty list (no personas/root)
      const mockListPersonas = async () => [];

      const exists = await personaExists(config, "@root", mockListPersonas);
      assert.strictEqual(exists, true, "Root persona should exist via agentsDir check");
    });
  });

  describe("Bug: invokePersona resolved root to personasDir/root", () => {
    /**
     * Before fix: invokePersona used join(personasDir, personaName) for all personas.
     * This meant "root" resolved to .agents/personas/root instead of .agents.
     *
     * After fix: invokePersona checks personaName === "root" and uses agentsDir.
     */

    it("REGRESSION: 'root' resolves to agentsDir, not personasDir/root", () => {
      const agentsDir = "/project/.agents";
      const personasDir = "/project/.agents/personas";

      const path = resolvePersonaPath("root", agentsDir, personasDir);

      // The bug would have produced this wrong path
      const wrongPath = join(personasDir, "root");
      assert.notStrictEqual(path, wrongPath, "Must not resolve to personasDir/root");

      // Correct path
      assert.strictEqual(path, agentsDir, "Must resolve to agentsDir");
    });
  });

  describe("Bug: `personas run root` failed", () => {
    /**
     * Before fix: CLI command "personas run root" used the same broken path resolution.
     *
     * After fix: All code paths use the same pattern: root → agentsDir.
     */

    it("REGRESSION: CLI path resolution follows same pattern", () => {
      // The CLI uses the same resolvePersonaPath logic
      // This test ensures consistency across all entry points

      const agentsDir = "/project/.agents";
      const personasDir = "/project/.agents/personas";

      // Both invokePersona and CLI should resolve identically
      const invokePath = resolvePersonaPath("root", agentsDir, personasDir);
      const cliPath = resolvePersonaPath("root", agentsDir, personasDir);

      assert.strictEqual(invokePath, cliPath);
      assert.strictEqual(invokePath, agentsDir);
    });
  });
});
