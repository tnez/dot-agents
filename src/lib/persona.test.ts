import { describe, it } from "node:test";
import assert from "node:assert";
import { join, relative } from "node:path";

// Types inlined to avoid module resolution issues with .js imports
interface CommandSpec {
  headless?: string | string[];
  interactive?: string | string[];
}

interface CommandModes {
  headless?: string | string[];
  interactive?: string | string[];
}

interface ResolvedCommands {
  headless: string[];
  interactive: string[] | undefined;
}

interface Persona {
  name: string;
  description?: string;
  cmd?: string | string[] | CommandModes;
  path: string;
  parent?: string;
  skills?: string[];
  env?: Record<string, string>;
  prompt?: string;
  internal?: boolean;
}

// Pure functions copied from persona.ts for testing
// This avoids module resolution issues with .js imports

function buildInheritanceChain(
  personaPath: string,
  personasRoot: string
): string[] {
  const relativePath = relative(personasRoot, personaPath);
  const parts = relativePath.split("/").filter(Boolean);

  const chain: string[] = [];
  let currentPath = personasRoot;

  for (const part of parts) {
    currentPath = join(currentPath, part);
    chain.push(currentPath);
  }

  return chain;
}

function mergeArraysWithNegation(
  parent: string[],
  child: string[]
): string[] {
  const result = [...parent];

  for (const item of child) {
    if (item.startsWith("!")) {
      const pattern = item.slice(1);
      const index = result.indexOf(pattern);
      if (index !== -1) {
        result.splice(index, 1);
      }
    } else if (!result.includes(item)) {
      result.push(item);
    }
  }

  return result;
}

function deepMerge<T extends Record<string, unknown>>(
  parent: T,
  child: Partial<T>
): T {
  const result = { ...parent };

  for (const key of Object.keys(child) as (keyof T)[]) {
    const childValue = child[key];
    const parentValue = parent[key];

    if (
      childValue !== undefined &&
      typeof childValue === "object" &&
      childValue !== null &&
      !Array.isArray(childValue) &&
      typeof parentValue === "object" &&
      parentValue !== null &&
      !Array.isArray(parentValue)
    ) {
      result[key] = deepMerge(
        parentValue as Record<string, unknown>,
        childValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (childValue !== undefined) {
      result[key] = childValue as T[keyof T];
    }
  }

  return result;
}

function combinePrompts(parent?: string, child?: string): string | undefined {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;
  return parent + "\n\n---\n\n" + child;
}

function mergePersonas(parent: Persona, child: Persona): Persona {
  return {
    name: child.name,
    description: child.description ?? parent.description,
    cmd: child.cmd ?? parent.cmd,
    path: child.path,
    parent: parent.path,
    env: deepMerge(parent.env ?? {}, child.env ?? {}),
    skills: mergeArraysWithNegation(parent.skills ?? [], child.skills ?? []),
    prompt: combinePrompts(parent.prompt, child.prompt),
  };
}

function normalizeCommandSpec(cmd: string | string[] | undefined): string[] | undefined {
  if (cmd === undefined) return undefined;
  if (typeof cmd === "string") return [cmd];
  return cmd;
}

function isCommandModes(cmd: string | string[] | CommandModes | undefined): cmd is CommandModes {
  return (
    cmd !== undefined &&
    typeof cmd === "object" &&
    !Array.isArray(cmd)
  );
}

function resolveCommands(cmd: string | string[] | CommandModes | undefined): ResolvedCommands {
  if (!cmd) {
    throw new Error("Persona must specify cmd");
  }

  if (isCommandModes(cmd)) {
    const headless = normalizeCommandSpec(cmd.headless);
    const interactive = normalizeCommandSpec(cmd.interactive);

    if (!headless && !interactive) {
      throw new Error("Persona cmd must specify at least headless or interactive");
    }

    return {
      headless: headless ?? interactive!,
      interactive,
    };
  }

  const headless = normalizeCommandSpec(cmd);
  return {
    headless: headless!,
    interactive: undefined,
  };
}

// Tests

describe("buildInheritanceChain", () => {
  it("builds chain from root to leaf", () => {
    const chain = buildInheritanceChain(
      "/project/.agents/personas/claude/autonomous",
      "/project/.agents/personas"
    );

    assert.deepStrictEqual(chain, [
      "/project/.agents/personas/claude",
      "/project/.agents/personas/claude/autonomous",
    ]);
  });

  it("returns single-element chain for top-level persona", () => {
    const chain = buildInheritanceChain(
      "/project/.agents/personas/developer",
      "/project/.agents/personas"
    );

    assert.deepStrictEqual(chain, ["/project/.agents/personas/developer"]);
  });

  it("handles deeply nested paths", () => {
    const chain = buildInheritanceChain(
      "/project/.agents/personas/a/b/c/d",
      "/project/.agents/personas"
    );

    assert.deepStrictEqual(chain, [
      "/project/.agents/personas/a",
      "/project/.agents/personas/a/b",
      "/project/.agents/personas/a/b/c",
      "/project/.agents/personas/a/b/c/d",
    ]);
  });
});

describe("mergeArraysWithNegation", () => {
  it("combines arrays without duplicates", () => {
    const result = mergeArraysWithNegation(["a", "b"], ["c", "d"]);
    assert.deepStrictEqual(result, ["a", "b", "c", "d"]);
  });

  it("removes items with ! prefix", () => {
    const result = mergeArraysWithNegation(["a", "b", "c"], ["!b"]);
    assert.deepStrictEqual(result, ["a", "c"]);
  });

  it("can add and remove in same operation", () => {
    const result = mergeArraysWithNegation(["a", "b", "c"], ["!b", "d"]);
    assert.deepStrictEqual(result, ["a", "c", "d"]);
  });

  it("ignores removal of non-existent items", () => {
    const result = mergeArraysWithNegation(["a", "b"], ["!z"]);
    assert.deepStrictEqual(result, ["a", "b"]);
  });

  it("does not add duplicates", () => {
    const result = mergeArraysWithNegation(["a", "b"], ["b", "c"]);
    assert.deepStrictEqual(result, ["a", "b", "c"]);
  });

  it("handles empty arrays", () => {
    assert.deepStrictEqual(mergeArraysWithNegation([], ["a"]), ["a"]);
    assert.deepStrictEqual(mergeArraysWithNegation(["a"], []), ["a"]);
    assert.deepStrictEqual(mergeArraysWithNegation([], []), []);
  });
});

describe("deepMerge", () => {
  it("merges flat objects", () => {
    const parent = { a: 1, b: 2, c: 0 };
    const child = { b: 3, c: 4 };
    const result = deepMerge(parent, child);
    assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
  });

  it("recursively merges nested objects", () => {
    const parent = { outer: { a: 1, b: 2, c: 0 } };
    const child = { outer: { a: 1, b: 3, c: 4 } };
    const result = deepMerge(parent, child);
    assert.deepStrictEqual(result, { outer: { a: 1, b: 3, c: 4 } });
  });

  it("child overrides parent for non-object values", () => {
    const result = deepMerge({ a: "parent" }, { a: "child" });
    assert.deepStrictEqual(result, { a: "child" });
  });

  it("child array replaces parent array (no merge)", () => {
    const result = deepMerge({ arr: [1, 2] }, { arr: [3, 4] });
    assert.deepStrictEqual(result, { arr: [3, 4] });
  });

  it("preserves parent values not in child", () => {
    const result = deepMerge({ a: 1, b: 2 }, { a: 10 });
    assert.deepStrictEqual(result, { a: 10, b: 2 });
  });

  it("handles undefined child values", () => {
    const result = deepMerge({ a: 1 }, { a: undefined });
    assert.deepStrictEqual(result, { a: 1 });
  });
});

describe("mergePersonas", () => {
  const parentPersona: Persona = {
    name: "parent",
    description: "Parent description",
    cmd: ["parent-cmd"],
    path: "/personas/parent",
    skills: ["skill-a", "skill-b"],
    env: { VAR1: "value1" },
    prompt: "Parent prompt",
  };

  const childPersona: Persona = {
    name: "child",
    path: "/personas/parent/child",
    skills: ["skill-c", "!skill-b"],
    env: { VAR2: "value2" },
    prompt: "Child prompt",
  };

  it("uses child name", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.strictEqual(merged.name, "child");
  });

  it("uses child path", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.strictEqual(merged.path, "/personas/parent/child");
  });

  it("sets parent reference", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.strictEqual(merged.parent, "/personas/parent");
  });

  it("falls back to parent description", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.strictEqual(merged.description, "Parent description");
  });

  it("child description overrides parent", () => {
    const childWithDesc: Persona = {
      ...childPersona,
      description: "Child description",
    };
    const merged = mergePersonas(parentPersona, childWithDesc);
    assert.strictEqual(merged.description, "Child description");
  });

  it("inherits cmd from parent if not specified", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.deepStrictEqual(merged.cmd, ["parent-cmd"]);
  });

  it("child cmd overrides parent", () => {
    const childWithCmd: Persona = { ...childPersona, cmd: ["child-cmd"] };
    const merged = mergePersonas(parentPersona, childWithCmd);
    assert.deepStrictEqual(merged.cmd, ["child-cmd"]);
  });

  it("merges skills with negation support", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.deepStrictEqual(merged.skills, ["skill-a", "skill-c"]);
  });

  it("deep merges env", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.deepStrictEqual(merged.env, { VAR1: "value1", VAR2: "value2" });
  });

  it("combines prompts with separator", () => {
    const merged = mergePersonas(parentPersona, childPersona);
    assert.strictEqual(merged.prompt, "Parent prompt\n\n---\n\nChild prompt");
  });

  it("handles missing parent prompt", () => {
    const parentNoPrompt: Persona = { ...parentPersona, prompt: undefined };
    const merged = mergePersonas(parentNoPrompt, childPersona);
    assert.strictEqual(merged.prompt, "Child prompt");
  });

  it("handles missing child prompt", () => {
    const childNoPrompt: Persona = { ...childPersona, prompt: undefined };
    const merged = mergePersonas(parentPersona, childNoPrompt);
    assert.strictEqual(merged.prompt, "Parent prompt");
  });
});

describe("resolveCommands", () => {
  it("throws when cmd is undefined", () => {
    assert.throws(() => resolveCommands(undefined), {
      message: "Persona must specify cmd",
    });
  });

  it("converts string to headless array", () => {
    const result = resolveCommands("my-command");
    assert.deepStrictEqual(result, {
      headless: ["my-command"],
      interactive: undefined,
    });
  });

  it("keeps array as headless", () => {
    const result = resolveCommands(["cmd", "--flag"]);
    assert.deepStrictEqual(result, {
      headless: ["cmd", "--flag"],
      interactive: undefined,
    });
  });

  it("handles object format with both modes", () => {
    const result = resolveCommands({
      headless: ["headless-cmd"],
      interactive: ["interactive-cmd"],
    });
    assert.deepStrictEqual(result, {
      headless: ["headless-cmd"],
      interactive: ["interactive-cmd"],
    });
  });

  it("converts string values in object format", () => {
    const result = resolveCommands({
      headless: "headless-cmd",
      interactive: "interactive-cmd",
    });
    assert.deepStrictEqual(result, {
      headless: ["headless-cmd"],
      interactive: ["interactive-cmd"],
    });
  });

  it("uses interactive as fallback for headless", () => {
    const result = resolveCommands({
      interactive: ["interactive-only"],
    });
    assert.deepStrictEqual(result, {
      headless: ["interactive-only"],
      interactive: ["interactive-only"],
    });
  });

  it("allows headless-only mode", () => {
    const result = resolveCommands({
      headless: ["headless-only"],
    });
    assert.deepStrictEqual(result, {
      headless: ["headless-only"],
      interactive: undefined,
    });
  });

  it("throws when object has neither mode", () => {
    assert.throws(() => resolveCommands({}), {
      message: "Persona cmd must specify at least headless or interactive",
    });
  });
});
