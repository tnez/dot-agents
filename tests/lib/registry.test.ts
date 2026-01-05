import { describe, it } from "vitest";
import assert from "node:assert";

// Inline the pure functions to test without module resolution issues
// These mirror the logic in registry.ts

interface CrossProjectAddress {
  project: string | null;
  type: "#" | "@";
  name: string;
  original: string;
}

function parseChannelAddress(address: string): CrossProjectAddress {
  if (!address.startsWith("#") && !address.startsWith("@")) {
    throw new Error(
      `Invalid channel address: ${address}. Must start with # or @`
    );
  }

  const type = address[0] as "#" | "@";
  const rest = address.slice(1);

  // Check for project/name format
  const slashIndex = rest.indexOf("/");
  if (slashIndex > 0) {
    const project = rest.slice(0, slashIndex);
    const name = rest.slice(slashIndex + 1);
    if (!name) {
      throw new Error(
        `Invalid channel address: ${address}. Missing channel/persona name after project.`
      );
    }
    return { project, type, name, original: address };
  }

  // Local channel
  return { project: null, type, name: rest, original: address };
}

interface NameCollision {
  name: string;
  projectPath: string;
  personaPath: string;
}

// Inline detectNameCollisions logic for testing
function detectNameCollisions(
  personaNames: string[],
  projectRegistry: Record<string, string>
): NameCollision[] {
  const collisions: NameCollision[] = [];

  for (const [projectName, projectPath] of Object.entries(projectRegistry)) {
    for (const personaName of personaNames) {
      if (personaName === projectName) {
        collisions.push({
          name: projectName,
          projectPath: projectPath,
          personaPath: personaName,
        });
      }
    }
  }

  return collisions;
}

describe("parseChannelAddress", () => {
  describe("local channels", () => {
    it("parses local DM address (@persona)", () => {
      const result = parseChannelAddress("@developer");
      assert.strictEqual(result.project, null);
      assert.strictEqual(result.type, "@");
      assert.strictEqual(result.name, "developer");
      assert.strictEqual(result.original, "@developer");
    });

    it("parses local public channel (#channel)", () => {
      const result = parseChannelAddress("#status");
      assert.strictEqual(result.project, null);
      assert.strictEqual(result.type, "#");
      assert.strictEqual(result.name, "status");
      assert.strictEqual(result.original, "#status");
    });

    it("handles hyphenated names", () => {
      const result = parseChannelAddress("@my-persona");
      assert.strictEqual(result.project, null);
      assert.strictEqual(result.name, "my-persona");
    });
  });

  describe("cross-project channels", () => {
    it("parses cross-project DM address (@project/persona)", () => {
      const result = parseChannelAddress("@documents/dottie");
      assert.strictEqual(result.project, "documents");
      assert.strictEqual(result.type, "@");
      assert.strictEqual(result.name, "dottie");
      assert.strictEqual(result.original, "@documents/dottie");
    });

    it("parses cross-project public channel (#project/channel)", () => {
      const result = parseChannelAddress("#scoutos/status");
      assert.strictEqual(result.project, "scoutos");
      assert.strictEqual(result.type, "#");
      assert.strictEqual(result.name, "status");
      assert.strictEqual(result.original, "#scoutos/status");
    });

    it("handles hyphenated project names", () => {
      const result = parseChannelAddress("@dot-agents/developer");
      assert.strictEqual(result.project, "dot-agents");
      assert.strictEqual(result.name, "developer");
    });

    it("handles nested path-like names in persona", () => {
      const result = parseChannelAddress("@documents/claude/developer");
      assert.strictEqual(result.project, "documents");
      assert.strictEqual(result.name, "claude/developer");
    });
  });

  describe("error handling", () => {
    it("throws for addresses without prefix", () => {
      assert.throws(
        () => parseChannelAddress("documents/dottie"),
        /Invalid channel address/
      );
    });

    it("throws for addresses with missing name after project", () => {
      assert.throws(
        () => parseChannelAddress("@documents/"),
        /Missing channel\/persona name/
      );
    });

    it("throws for empty address", () => {
      assert.throws(() => parseChannelAddress(""), /Invalid channel address/);
    });
  });
});

describe("detectNameCollisions", () => {
  it("detects collision when persona name matches project name", () => {
    const personaNames = ["developer", "documents", "reviewer"];
    const registry = {
      documents: "/path/to/documents",
      scoutos: "/path/to/scoutos",
    };

    const collisions = detectNameCollisions(personaNames, registry);

    assert.strictEqual(collisions.length, 1);
    assert.strictEqual(collisions[0].name, "documents");
    assert.strictEqual(collisions[0].projectPath, "/path/to/documents");
    assert.strictEqual(collisions[0].personaPath, "documents");
  });

  it("returns empty array when no collisions", () => {
    const personaNames = ["developer", "reviewer"];
    const registry = {
      documents: "/path/to/documents",
      scoutos: "/path/to/scoutos",
    };

    const collisions = detectNameCollisions(personaNames, registry);

    assert.strictEqual(collisions.length, 0);
  });

  it("detects multiple collisions", () => {
    const personaNames = ["developer", "documents", "scoutos"];
    const registry = {
      documents: "/path/to/documents",
      scoutos: "/path/to/scoutos",
    };

    const collisions = detectNameCollisions(personaNames, registry);

    assert.strictEqual(collisions.length, 2);
    const names = collisions.map((c) => c.name).sort();
    assert.deepStrictEqual(names, ["documents", "scoutos"]);
  });

  it("handles empty inputs", () => {
    assert.strictEqual(detectNameCollisions([], {}).length, 0);
    assert.strictEqual(detectNameCollisions(["dev"], {}).length, 0);
    assert.strictEqual(
      detectNameCollisions([], { proj: "/path" }).length,
      0
    );
  });
});

/**
 * Inline the resolveChannelAddress logic for testing
 * This mirrors registry.ts:166-207
 */
interface ResolvedChannelAddress {
  channelsDir: string;
  localChannelName: string;
  isProjectEntryPoint?: boolean;
  projectName?: string;
}

function resolveChannelAddressSync(
  address: string,
  localChannelsDir: string,
  projectRegistry: Record<string, string>
): ResolvedChannelAddress {
  const parsed = parseChannelAddress(address);

  if (parsed.project === null) {
    // Check if @name matches a registered project (unified resolution)
    if (parsed.type === "@") {
      const projectPath = projectRegistry[parsed.name];
      if (projectPath) {
        // Route to project's entry point (@root)
        return {
          channelsDir: `${projectPath}/channels`,
          localChannelName: "@root",
          isProjectEntryPoint: true,
          projectName: parsed.name,
        };
      }
    }

    // Local channel (no project match or public channel)
    return {
      channelsDir: localChannelsDir,
      localChannelName: address,
    };
  }

  // Cross-project channel with explicit project/name format
  const projectPath = projectRegistry[parsed.project];
  if (!projectPath) {
    throw new Error(
      `Unknown project: ${parsed.project}. Register it with: npx dot-agents projects add ${parsed.project} /path/to/project`
    );
  }

  return {
    channelsDir: `${projectPath}/channels`,
    localChannelName: `${parsed.type}${parsed.name}`,
    projectName: parsed.project,
  };
}

describe("resolveChannelAddress cross-project routing", () => {
  const localChannelsDir = "/current-project/.agents/channels";
  const projectRegistry = {
    documents: "/home/user/documents/.agents",
    scoutos: "/home/user/scoutos/.agents",
  };

  describe("@project routes to @root", () => {
    it("@documents routes to documents project's @root channel", () => {
      const result = resolveChannelAddressSync(
        "@documents",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, "/home/user/documents/.agents/channels");
      assert.strictEqual(result.localChannelName, "@root");
      assert.strictEqual(result.isProjectEntryPoint, true);
      assert.strictEqual(result.projectName, "documents");
    });

    it("@scoutos routes to scoutos project's @root channel", () => {
      const result = resolveChannelAddressSync(
        "@scoutos",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, "/home/user/scoutos/.agents/channels");
      assert.strictEqual(result.localChannelName, "@root");
      assert.strictEqual(result.isProjectEntryPoint, true);
      assert.strictEqual(result.projectName, "scoutos");
    });
  });

  describe("@project/persona routes to specific persona", () => {
    it("@documents/dottie routes to documents project's @dottie channel", () => {
      const result = resolveChannelAddressSync(
        "@documents/dottie",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, "/home/user/documents/.agents/channels");
      assert.strictEqual(result.localChannelName, "@dottie");
      assert.strictEqual(result.projectName, "documents");
      // Not marked as entry point since it's a specific persona
      assert.strictEqual(result.isProjectEntryPoint, undefined);
    });
  });

  describe("local personas without project match", () => {
    it("@developer stays local when no project named 'developer'", () => {
      const result = resolveChannelAddressSync(
        "@developer",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, localChannelsDir);
      assert.strictEqual(result.localChannelName, "@developer");
      assert.strictEqual(result.isProjectEntryPoint, undefined);
      assert.strictEqual(result.projectName, undefined);
    });

    it("@reviewer stays local when no project named 'reviewer'", () => {
      const result = resolveChannelAddressSync(
        "@reviewer",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, localChannelsDir);
      assert.strictEqual(result.localChannelName, "@reviewer");
    });
  });

  describe("public channels", () => {
    it("#status stays local (no project routing for public channels)", () => {
      const result = resolveChannelAddressSync(
        "#status",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, localChannelsDir);
      assert.strictEqual(result.localChannelName, "#status");
    });

    it("#documents stays local (public channels don't match project names)", () => {
      // Even though 'documents' is a project name, #documents is a public channel
      // and doesn't get routed to the project
      const result = resolveChannelAddressSync(
        "#documents",
        localChannelsDir,
        projectRegistry
      );

      assert.strictEqual(result.channelsDir, localChannelsDir);
      assert.strictEqual(result.localChannelName, "#documents");
    });
  });

  describe("error handling", () => {
    it("throws for unknown project in explicit format", () => {
      assert.throws(
        () =>
          resolveChannelAddressSync(
            "@unknown-project/persona",
            localChannelsDir,
            projectRegistry
          ),
        /Unknown project: unknown-project/
      );
    });
  });
});
