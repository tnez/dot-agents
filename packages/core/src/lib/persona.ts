import { readdir, stat } from "node:fs/promises";
import { join, dirname, basename, relative } from "node:path";
import { loadMarkdownFile } from "./frontmatter.js";
import type {
  Persona,
  PersonaFrontmatter,
  ResolvedPersona,
} from "../types/persona.js";

const PERSONA_FILENAME = "PERSONA.md";

/**
 * Load a single persona file
 */
export async function loadPersona(personaPath: string): Promise<Persona> {
  const filePath = personaPath.endsWith(PERSONA_FILENAME)
    ? personaPath
    : join(personaPath, PERSONA_FILENAME);

  const { frontmatter, body } = await loadMarkdownFile<PersonaFrontmatter>(
    filePath
  );

  if (!frontmatter.name) {
    throw new Error(`Persona missing required 'name' field: ${filePath}`);
  }

  // cmd is optional for child personas (inherited from parent)

  return {
    ...frontmatter,
    path: dirname(filePath),
    prompt: body || undefined,
  };
}

/**
 * Build the inheritance chain for a persona path
 * Returns paths from root to leaf (e.g., ["claude", "claude/autonomous"])
 */
export function buildInheritanceChain(
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

/**
 * Check if a directory contains a PERSONA.md file
 */
async function hasPersonaFile(dirPath: string): Promise<boolean> {
  try {
    const filePath = join(dirPath, PERSONA_FILENAME);
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Merge arrays with gitignore-style negation support
 * Items prefixed with ! remove matching items from the array
 */
export function mergeArraysWithNegation(
  parent: string[],
  child: string[]
): string[] {
  const result = [...parent];

  for (const item of child) {
    if (item.startsWith("!")) {
      // Remove items matching the negation pattern
      const pattern = item.slice(1);
      const index = result.indexOf(pattern);
      if (index !== -1) {
        result.splice(index, 1);
      }
    } else if (!result.includes(item)) {
      // Add new items
      result.push(item);
    }
  }

  return result;
}

/**
 * Deep merge two objects (child overrides parent)
 */
export function deepMerge<T extends Record<string, unknown>>(
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
      // Recursively merge objects
      result[key] = deepMerge(
        parentValue as Record<string, unknown>,
        childValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (childValue !== undefined) {
      // Child overrides parent
      result[key] = childValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Merge two personas (child inherits from parent)
 */
export function mergePersonas(parent: Persona, child: Persona): Persona {
  return {
    // Scalars: child overrides
    name: child.name,
    description: child.description ?? parent.description,
    cmd: child.cmd ?? parent.cmd, // inherit cmd if not specified
    path: child.path,
    parent: parent.path,

    // Objects: deep merge
    env: deepMerge(parent.env ?? {}, child.env ?? {}),

    // Arrays: merge with negation
    skills: mergeArraysWithNegation(parent.skills ?? [], child.skills ?? []),

    // Prompt: child replaces entirely if present
    prompt: child.prompt ?? parent.prompt,
  };
}

/**
 * Resolve a persona with full inheritance chain
 */
export async function resolvePersona(
  personaPath: string,
  personasRoot: string
): Promise<ResolvedPersona> {
  const chain = buildInheritanceChain(personaPath, personasRoot);
  const inheritanceChain: string[] = [];

  let resolved: Persona | null = null;

  for (const path of chain) {
    if (await hasPersonaFile(path)) {
      const persona = await loadPersona(path);
      inheritanceChain.push(path);

      if (resolved === null) {
        resolved = persona;
      } else {
        resolved = mergePersonas(resolved, persona);
      }
    }
  }

  if (resolved === null) {
    throw new Error(`No persona found at path: ${personaPath}`);
  }

  // Normalize cmd to array
  const cmd = Array.isArray(resolved.cmd) ? resolved.cmd : [resolved.cmd];

  return {
    name: resolved.name,
    description: resolved.description,
    cmd,
    env: resolved.env ?? {},
    skills: resolved.skills ?? [],
    prompt: resolved.prompt,
    path: resolved.path,
    inheritanceChain,
  };
}

/**
 * List all personas in a directory (recursive)
 */
export async function listPersonas(personasRoot: string): Promise<string[]> {
  const personas: string[] = [];

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = join(dir, entry.name);
          if (await hasPersonaFile(subDir)) {
            personas.push(subDir);
          }
          await scanDir(subDir);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  await scanDir(personasRoot);
  return personas;
}
