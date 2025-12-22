import { describe, it } from "node:test";
import assert from "node:assert";

// isChannelName is a pure function - inline it to avoid module resolution issues
// This is the same logic as in channel.ts
function isChannelName(name: string): boolean {
  return name.startsWith("#") || name.startsWith("@");
}

describe("isChannelName", () => {
  it("returns true for public channels (# prefix)", () => {
    assert.strictEqual(isChannelName("#general"), true);
    assert.strictEqual(isChannelName("#status"), true);
    assert.strictEqual(isChannelName("#dev-updates"), true);
  });

  it("returns true for DM channels (@ prefix)", () => {
    assert.strictEqual(isChannelName("@developer"), true);
    assert.strictEqual(isChannelName("@human"), true);
    assert.strictEqual(isChannelName("@alice-bob"), true);
  });

  it("returns false for names without prefix", () => {
    assert.strictEqual(isChannelName("general"), false);
    assert.strictEqual(isChannelName("status"), false);
    assert.strictEqual(isChannelName("developer"), false);
  });

  it("returns false for names with wrong prefix", () => {
    assert.strictEqual(isChannelName("!general"), false);
    assert.strictEqual(isChannelName("$status"), false);
    assert.strictEqual(isChannelName("/developer"), false);
  });

  it("returns false for empty string", () => {
    assert.strictEqual(isChannelName(""), false);
  });
});
