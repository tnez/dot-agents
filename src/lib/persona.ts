import { readdir, stat, readFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarkdownFile } from "./frontmatter.js";
import type {
  Persona,
  PersonaFrontmatter,
  ResolvedPersona,
  ResolvedCommands,
  CommandSpec,
  CommandModes,
  McpConfig,
  HooksConfig,
  HookEventConfig,
} from "./types/persona.js";

const PERSONA_FILENAME = "PERSONA.md";
const MCP_FILENAME = "mcp.json";
const HOOKS_FILENAME = "hooks.json";

/**
 * Get the path to internal personas bundled with the package.
 * Resolves relative to this module's location.
 */
export function getInternalPersonasPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const libDir = dirname(currentFile);
  // From dist/lib or src/lib -> root -> internal/personas
  const packageRoot = dirname(dirname(libDir));
  return join(packageRoot, "internal", "personas");
}

/**
 * Get the path to the internal _base persona
 */
export function getInternalBasePath(): string {
  return join(getInternalPersonasPath(), "_base");
}

/**
 * Get the path to internal skills bundled with the package.
 * Resolves relative to this module's location.
 */
export function getInternalSkillsPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const libDir = dirname(currentFile);
  // From dist/lib or src/lib -> root -> internal/skills
  const packageRoot = dirname(dirname(libDir));
  return join(packageRoot, "internal", "skills");
}

/**
 * Normalize a CommandSpec to string array
 */
function normalizeCommandSpec(cmd: CommandSpec | undefined): string[] | undefined {
  if (cmd === undefined) return undefined;
  if (typeof cmd === "string") return [cmd];
  return cmd;
}

/**
 * Check if cmd is in object/modes format (vs legacy array format)
 */
function isCommandModes(cmd: CommandSpec | CommandModes | undefined): cmd is CommandModes {
  return (
    cmd !== undefined &&
    typeof cmd === "object" &&
    !Array.isArray(cmd)
  );
}

/**
 * Resolve cmd field to ResolvedCommands structure
 */
export function resolveCommands(cmd: CommandSpec | CommandModes | undefined): ResolvedCommands {
  if (!cmd) {
    throw new Error("Persona must specify cmd");
  }

  if (isCommandModes(cmd)) {
    // Object format: { headless, interactive }
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

  // Legacy format: array/string = headless only
  const headless = normalizeCommandSpec(cmd);
  return {
    headless: headless!,
    interactive: undefined,
  };
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
 * Load mcp.json from a persona directory if it exists
 */
async function loadMcpConfig(personaPath: string): Promise<McpConfig | null> {
  try {
    const filePath = join(personaPath, MCP_FILENAME);
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as McpConfig;
  } catch {
    return null;
  }
}

/**
 * Merge MCP configs (child overrides parent for same server name)
 */
function mergeMcpConfigs(
  parent: McpConfig | null,
  child: McpConfig | null
): McpConfig | null {
  if (!parent && !child) return null;
  if (!parent) return child;
  if (!child) return parent;

  return {
    mcpServers: {
      ...parent.mcpServers,
      ...child.mcpServers,
    },
  };
}

/**
 * Load hooks.json from a persona directory if it exists
 */
async function loadHooksConfig(personaPath: string): Promise<HooksConfig | null> {
  try {
    const filePath = join(personaPath, HOOKS_FILENAME);
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as HooksConfig;
  } catch {
    return null;
  }
}

/**
 * Merge hooks configs (child hooks are appended to parent hooks for each event)
 */
function mergeHooksConfigs(
  parent: HooksConfig | null,
  child: HooksConfig | null
): HooksConfig | null {
  if (!parent && !child) return null;
  if (!parent) return child;
  if (!child) return parent;

  const merged: HooksConfig = {};

  // Get all hook event types from both configs
  const allEvents = new Set([
    ...Object.keys(parent) as (keyof HooksConfig)[],
    ...Object.keys(child) as (keyof HooksConfig)[],
  ]);

  for (const event of allEvents) {
    const parentHooks = parent[event] ?? [];
    const childHooks = child[event] ?? [];
    // Child hooks are appended (run after parent hooks)
    merged[event] = [...parentHooks, ...childHooks] as HookEventConfig[];
  }

  return merged;
}

/**
 * Get the path to internal hooks bundled with the package.
 */
export function getInternalHooksPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const libDir = dirname(currentFile);
  const packageRoot = dirname(dirname(libDir));
  return join(packageRoot, "internal", "hooks");
}

/**
 * Get default session hooks configuration
 * These are the built-in hooks for session logging support
 */
export function getDefaultSessionHooks(): HooksConfig {
  const hooksPath = getInternalHooksPath();
  return {
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: join(hooksPath, "stop-session-reminder.sh"),
            timeout: 10,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: "command",
            command: join(hooksPath, "session-end-logger.sh"),
            timeout: 30,
          },
        ],
      },
    ],
  };
}

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
 * Load the internal _base persona if it exists
 * Returns null if not found (graceful degradation)
 */
export async function loadInternalBase(): Promise<Persona | null> {
  const basePath = getInternalBasePath();
  if (await hasPersonaFile(basePath)) {
    const persona = await loadPersona(basePath);
    return { ...persona, internal: true };
  }
  return null;
}

/**
 * Load the project's _project persona if it exists
 * Returns null if not found (graceful degradation)
 */
export async function loadProjectBase(personasRoot: string): Promise<Persona | null> {
  const projectPath = join(personasRoot, "_project");
  if (await hasPersonaFile(projectPath)) {
    return await loadPersona(projectPath);
  }
  return null;
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
 * Combine prompts from parent and child with separator
 */
function combinePrompts(parent?: string, child?: string): string | undefined {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;
  return parent + "\n\n---\n\n" + child;
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

    // Prompt: combine parent and child prompts
    prompt: combinePrompts(parent.prompt, child.prompt),
  };
}

/**
 * Build the explicit extends chain by following persona references
 * Returns personas from root to leaf (e.g., [odin-base, executive-assistant])
 */
async function buildExtendsChain(
  persona: Persona,
  personasRoot: string,
  visited: Set<string> = new Set()
): Promise<Persona[]> {
  // Detect circular inheritance
  if (visited.has(persona.path)) {
    throw new Error(`Circular inheritance detected: ${persona.path}`);
  }
  visited.add(persona.path);

  const extendsValue = persona.extends;

  // No extends or extends: "none" - this is the root
  if (!extendsValue || extendsValue === "none") {
    return [persona];
  }

  // extends: "_base" or "_project" means inherit from auto-inherited bases (handled later)
  if (extendsValue === "_base" || extendsValue === "_project") {
    return [persona];
  }

  // extends: "<persona-name>" - find and load the parent persona
  const parentPath = `${personasRoot}/${extendsValue}`;
  if (!(await hasPersonaFile(parentPath))) {
    throw new Error(
      `Parent persona "${extendsValue}" not found at ${parentPath} (extended by ${persona.name})`
    );
  }

  const parentPersona = await loadPersona(parentPath);
  const parentChain = await buildExtendsChain(parentPersona, personasRoot, visited);

  return [...parentChain, persona];
}

/**
 * Resolve a persona with full inheritance chain
 * Supports explicit extends field for multi-level inheritance
 * Includes implicit inheritance from internal _base persona unless extends: "none"
 */
export async function resolvePersona(
  personaPath: string,
  personasRoot: string
): Promise<ResolvedPersona> {
  // Load the target persona
  if (!(await hasPersonaFile(personaPath))) {
    throw new Error(`No persona found at path: ${personaPath}`);
  }
  const targetPersona = await loadPersona(personaPath);

  // Build the extends chain (follows explicit extends references)
  const extendsChain = await buildExtendsChain(targetPersona, personasRoot);

  // Merge personas from root to leaf
  let resolved: Persona = extendsChain[0];
  for (let i = 1; i < extendsChain.length; i++) {
    resolved = mergePersonas(resolved, extendsChain[i]);
  }

  // Build inheritance chain paths
  const inheritanceChain = extendsChain.map((p) => p.path);

  // Load and merge MCP configs from inheritance chain
  let mcpConfig: McpConfig | null = null;
  for (const persona of extendsChain) {
    const personaMcp = await loadMcpConfig(persona.path);
    mcpConfig = mergeMcpConfigs(mcpConfig, personaMcp);
  }

  // Load and merge hooks configs from inheritance chain
  // Start with default session hooks (built-in session logging support)
  let hooksConfig: HooksConfig | null = getDefaultSessionHooks();
  for (const persona of extendsChain) {
    const personaHooks = await loadHooksConfig(persona.path);
    hooksConfig = mergeHooksConfigs(hooksConfig, personaHooks);
  }

  // Check if the root persona opts out of automatic base inheritance
  const rootPersona = extendsChain[0];
  const shouldInheritBases = rootPersona.extends !== "none";

  let finalPrompt = resolved.prompt;

  // Auto-inherit _project (project conventions) - prepended after _base
  if (shouldInheritBases) {
    const project = await loadProjectBase(personasRoot);
    if (project?.prompt) {
      // Prepend project prompt with separator
      finalPrompt = project.prompt + (finalPrompt ? "\n\n---\n\n" + finalPrompt : "");
      // Add project to the start of inheritance chain
      inheritanceChain.unshift(project.path);
    }
  }

  // Auto-inherit _base (dot-agents system knowledge) - prepended first
  if (shouldInheritBases) {
    const base = await loadInternalBase();
    if (base?.prompt) {
      // Prepend base prompt with separator
      finalPrompt = base.prompt + (finalPrompt ? "\n\n---\n\n" + finalPrompt : "");
      // Add base to the start of inheritance chain
      inheritanceChain.unshift(base.path);
    }
  }

  // Resolve commands to normalized structure
  const commands = resolveCommands(resolved.cmd);

  return {
    name: resolved.name,
    description: resolved.description,
    commands,
    env: resolved.env ?? {},
    skills: resolved.skills ?? [],
    prompt: finalPrompt,
    path: resolved.path,
    inheritanceChain,
    mcpConfig: mcpConfig ?? undefined,
    hooksConfig: hooksConfig ?? undefined,
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
