import { Command } from "commander";
import chalk from "chalk";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  registerProject,
  unregisterProject,
  listProjects,
  getRegistryPath,
} from "../../lib/index.js";

/**
 * Resolve a path, expanding ~ and auto-discovering .agents directory
 */
async function resolveProjectPath(inputPath: string): Promise<string> {
  // Expand ~ to home directory
  const expandedPath = inputPath.startsWith("~")
    ? join(homedir(), inputPath.slice(1))
    : inputPath;

  // Check if path ends with .agents
  if (expandedPath.endsWith(".agents")) {
    // Verify it exists
    try {
      const stats = await stat(expandedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${expandedPath}`);
      }
      return expandedPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Directory not found: ${expandedPath}`);
      }
      throw error;
    }
  }

  // Try auto-discovering .agents directory
  const agentsPath = join(expandedPath, ".agents");
  try {
    const stats = await stat(agentsPath);
    if (stats.isDirectory()) {
      return agentsPath;
    }
  } catch {
    // .agents doesn't exist, check if user path itself exists
    try {
      await stat(expandedPath);
      throw new Error(
        `No .agents directory found at ${agentsPath}. Create one or specify the full path.`
      );
    } catch (innerError) {
      if ((innerError as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Directory not found: ${expandedPath}`);
      }
      throw innerError;
    }
  }

  throw new Error(`No .agents directory found at ${agentsPath}`);
}

export const projectsCommand = new Command("projects")
  .description("Manage registered projects for cross-project channel routing")
  .action(() => {
    projectsCommand.help();
  });

projectsCommand
  .command("add")
  .description("Register a project for cross-project channel routing")
  .argument("<name>", "Project name (used in channel addresses like @project/persona)")
  .argument("<path>", "Path to the project (auto-discovers .agents directory)")
  .action(async (name, path) => {
    try {
      const resolvedPath = await resolveProjectPath(path);
      await registerProject(name, resolvedPath);
      console.log(chalk.green(`Registered project: ${name}`));
      console.log(chalk.dim(`  Path: ${resolvedPath}`));
      console.log();
      console.log(chalk.cyan("Usage:"));
      console.log(chalk.dim(`  npx dot-agents channels publish "@${name}/persona" "message"`));
      console.log(chalk.dim(`  npx dot-agents channels read "@${name}/persona"`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

projectsCommand
  .command("remove")
  .description("Remove a project from the registry")
  .argument("<name>", "Project name to remove")
  .action(async (name) => {
    try {
      const removed = await unregisterProject(name);
      if (removed) {
        console.log(chalk.green(`Removed project: ${name}`));
      } else {
        console.log(chalk.yellow(`Project not found: ${name}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

projectsCommand
  .command("list")
  .description("List all registered projects")
  .action(async () => {
    try {
      const projects = await listProjects();

      console.log(chalk.dim(`Registry: ${getRegistryPath()}`));
      console.log();

      if (projects.length === 0) {
        console.log(chalk.yellow("No projects registered"));
        console.log();
        console.log(chalk.cyan("To register a project:"));
        console.log(chalk.dim("  npx dot-agents projects add <name> /path/to/project"));
        return;
      }

      console.log(chalk.blue(`Registered projects (${projects.length}):\n`));

      for (const { name, path } of projects) {
        console.log(chalk.white(`  ${name}`));
        console.log(chalk.dim(`    ${path}`));
        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });
