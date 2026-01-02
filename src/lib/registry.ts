import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const CONFIG_DIR = join(homedir(), ".config", "dot-agents");
const REGISTRY_FILE = "projects.yaml";

/**
 * Project registry structure
 */
export interface ProjectRegistry {
  projects: Record<string, string>;
}

/**
 * Parsed cross-project channel address
 */
export interface CrossProjectAddress {
  /** Project name from registry (null if local) */
  project: string | null;
  /** Channel type: # for public, @ for DM */
  type: "#" | "@";
  /** Channel or persona name */
  name: string;
  /** Full original address for display */
  original: string;
}

/**
 * Get path to the projects registry file
 */
export function getRegistryPath(): string {
  return join(CONFIG_DIR, REGISTRY_FILE);
}

/**
 * Load the project registry
 */
export async function loadRegistry(): Promise<ProjectRegistry> {
  const registryPath = getRegistryPath();
  try {
    const content = await readFile(registryPath, "utf-8");
    const data = parseYaml(content) as ProjectRegistry;
    return data || { projects: {} };
  } catch {
    return { projects: {} };
  }
}

/**
 * Save the project registry
 */
export async function saveRegistry(registry: ProjectRegistry): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const registryPath = getRegistryPath();
  const content = stringifyYaml(registry);
  await writeFile(registryPath, content, "utf-8");
}

/**
 * Register a project in the registry
 */
export async function registerProject(
  name: string,
  path: string
): Promise<void> {
  const registry = await loadRegistry();
  // Expand ~ to home directory
  const expandedPath = path.startsWith("~")
    ? join(homedir(), path.slice(1))
    : resolve(path);
  registry.projects[name] = expandedPath;
  await saveRegistry(registry);
}

/**
 * Unregister a project from the registry
 */
export async function unregisterProject(name: string): Promise<boolean> {
  const registry = await loadRegistry();
  if (name in registry.projects) {
    delete registry.projects[name];
    await saveRegistry(registry);
    return true;
  }
  return false;
}

/**
 * Resolve a project name to its .agents path
 */
export async function resolveProject(name: string): Promise<string | null> {
  const registry = await loadRegistry();
  const path = registry.projects[name];
  if (!path) {
    return null;
  }
  // Expand ~ if present (in case registry was edited manually)
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

/**
 * Parse a channel address that may include a project prefix
 *
 * Formats:
 * - @persona (local DM)
 * - #channel (local public channel)
 * - @project/persona (cross-project DM)
 * - #project/channel (cross-project public channel)
 */
export function parseChannelAddress(address: string): CrossProjectAddress {
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

/**
 * Result of resolving a channel address
 */
export interface ResolvedChannelAddress {
  /** Path to the channels directory (local or remote) */
  channelsDir: string;
  /** Channel name within that directory (e.g., @persona, #channel, @root) */
  localChannelName: string;
  /** True if this resolved to a project's entry point */
  isProjectEntryPoint?: boolean;
  /** The project name if routed to a project */
  projectName?: string;
}

/**
 * Resolve a channel address to a channels directory and local channel name
 *
 * Resolution order for @name (without /):
 * 1. Check registered projects first - if found, routes to project's @root
 * 2. Fall back to local persona lookup
 *
 * Returns:
 * - channelsDir: The path to the channels directory (local or remote)
 * - localChannelName: The channel name within that directory (e.g., @persona, #channel)
 * - isProjectEntryPoint: True if routed to a project's entry point
 * - projectName: The project name if routed to a project
 */
export async function resolveChannelAddress(
  address: string,
  localChannelsDir: string
): Promise<ResolvedChannelAddress> {
  const parsed = parseChannelAddress(address);

  if (parsed.project === null) {
    // Check if @name matches a registered project (unified resolution)
    if (parsed.type === "@") {
      const projectPath = await resolveProject(parsed.name);
      if (projectPath) {
        // Route to project's entry point (@root)
        return {
          channelsDir: join(projectPath, "channels"),
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
  const projectPath = await resolveProject(parsed.project);
  if (!projectPath) {
    throw new Error(
      `Unknown project: ${parsed.project}. Register it with: npx dot-agents projects add ${parsed.project} /path/to/project`
    );
  }

  return {
    channelsDir: join(projectPath, "channels"),
    localChannelName: `${parsed.type}${parsed.name}`,
    projectName: parsed.project,
  };
}

/**
 * List all registered projects
 */
export async function listProjects(): Promise<
  Array<{ name: string; path: string }>
> {
  const registry = await loadRegistry();
  return Object.entries(registry.projects).map(([name, path]) => ({
    name,
    path,
  }));
}

/**
 * A collision between a project name and a local persona name
 */
export interface NameCollision {
  /** The conflicting name */
  name: string;
  /** Path to the registered project */
  projectPath: string;
  /** Path to the local persona */
  personaPath: string;
}

/**
 * Detect collisions between registered project names and local persona names.
 * When a collision exists, @name will route to the project (projects take priority).
 */
export async function detectNameCollisions(
  personaNames: string[],
): Promise<NameCollision[]> {
  const registry = await loadRegistry();
  const collisions: NameCollision[] = [];

  for (const [projectName, projectPath] of Object.entries(registry.projects)) {
    // Check if any persona name matches the project name
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
