import { describe, it } from "node:test";
import assert from "node:assert";
import { parseFrontmatter, hasFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const content = `---
title: Test
count: 42
---

Body content here.`;

    const result = parseFrontmatter<{ title: string; count: number }>(content);

    assert.deepStrictEqual(result.frontmatter, { title: "Test", count: 42 });
    assert.strictEqual(result.body, "Body content here.");
  });

  it("handles empty body", () => {
    const content = `---
key: value
---
`;

    const result = parseFrontmatter<{ key: string }>(content);

    assert.deepStrictEqual(result.frontmatter, { key: "value" });
    assert.strictEqual(result.body, "");
  });

  it("throws on missing frontmatter", () => {
    const content = "Just plain markdown content";

    assert.throws(() => parseFrontmatter(content), {
      message: "No YAML frontmatter found",
    });
  });

  it("throws on malformed frontmatter (missing closing)", () => {
    const content = `---
title: Test
No closing delimiter`;

    assert.throws(() => parseFrontmatter(content), {
      message: "No YAML frontmatter found",
    });
  });
});

describe("hasFrontmatter", () => {
  it("returns true for content with frontmatter", () => {
    const content = `---
title: Test
---

Body`;

    assert.strictEqual(hasFrontmatter(content), true);
  });

  it("returns false for content without frontmatter", () => {
    const content = "Just plain markdown";

    assert.strictEqual(hasFrontmatter(content), false);
  });

  it("returns false for partial frontmatter", () => {
    const content = `---
title: Test
Missing closing`;

    assert.strictEqual(hasFrontmatter(content), false);
  });
});
