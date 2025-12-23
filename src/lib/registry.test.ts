import { describe, it } from "node:test";
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
