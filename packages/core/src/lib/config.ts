import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { DotAgentsConfig } from "../types/index.js";

/**
 * Default directory names
 */
const AGENTS_DIR = ".agents";
const PERSONAS_DIR = "personas";
const WORKFLOWS_DIR = "workflows";
const SKILLS_DIR = "skills";
const SESSIONS_DIR = "sessions";

/**
 * Check if a directory exists
 */
async function dirExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find .agents directory by searching up the directory tree
 */
export async function findAgentsDir(
  startDir: string = process.cwd()
): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = resolve("/");

  while (currentDir !== root) {
    const agentsPath = join(currentDir, AGENTS_DIR);
    if (await dirExists(agentsPath)) {
      return agentsPath;
    }

    // Also check if current dir contains personas/workflows directly (dev mode)
    const personasDir = join(currentDir, PERSONAS_DIR);
    const workflowsDir = join(currentDir, WORKFLOWS_DIR);
    if ((await dirExists(personasDir)) || (await dirExists(workflowsDir))) {
      return currentDir;
    }

    currentDir = resolve(currentDir, "..");
  }

  // Check home directory as fallback
  const homeAgents = join(homedir(), AGENTS_DIR);
  if (await dirExists(homeAgents)) {
    return homeAgents;
  }

  return null;
}

/**
 * Get the configuration for dot-agents
 */
export async function getConfig(
  startDir?: string
): Promise<DotAgentsConfig | null> {
  const agentsDir = await findAgentsDir(startDir);

  if (!agentsDir) {
    return null;
  }

  return {
    agentsDir,
    personasDir: join(agentsDir, PERSONAS_DIR),
    workflowsDir: join(agentsDir, WORKFLOWS_DIR),
    skillsDir: join(agentsDir, SKILLS_DIR),
    sessionsDir: join(agentsDir, SESSIONS_DIR),
  };
}

/**
 * Get configuration or throw if not found
 */
export async function requireConfig(startDir?: string): Promise<DotAgentsConfig> {
  const config = await getConfig(startDir);

  if (!config) {
    throw new Error(
      "No .agents directory found. Run from a directory with .agents/ or create one."
    );
  }

  return config;
}
