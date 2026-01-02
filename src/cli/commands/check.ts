import { Command } from "commander";
import chalk from "chalk";
import { relative, basename } from "node:path";
import { getConfig } from "../../lib/config.js";
import {
  validateAll,
  validateAllWorkflows,
  validateAllPersonas,
  ValidationResult,
  ValidationIssue,
} from "../../lib/validation/index.js";
import {
  detectNameCollisions,
  listProjects,
} from "../../lib/registry.js";
import { listPersonas } from "../../lib/persona.js";

/**
 * Format a single validation issue for display
 */
function formatIssue(issue: ValidationIssue, indent: string = "    "): string {
  const icon = issue.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  const prefix = issue.severity === "error" ? chalk.red("error") : chalk.yellow("warning");

  let line = `${indent}${icon} ${prefix}: ${issue.message}`;

  if (issue.path && issue.path !== "file" && issue.path !== "frontmatter") {
    line += chalk.dim(` [${issue.path}]`);
  }

  if (issue.suggestion) {
    line += `\n${indent}  ${chalk.dim("hint:")} ${chalk.cyan(issue.suggestion)}`;
  }

  return line;
}

/**
 * Format validation results for a resource type
 */
function formatResults(
  results: ValidationResult[],
  baseDir: string,
  resourceType: string
): string[] {
  const lines: string[] = [];

  if (results.length === 0) {
    lines.push(chalk.yellow(`  No ${resourceType} found`));
    return lines;
  }

  for (const result of results) {
    const relPath = relative(baseDir, result.path);
    const displayName = result.name || relPath;

    if (result.valid && result.issues.length === 0) {
      lines.push(`  ${chalk.green("✓")} ${displayName}`);
    } else if (result.valid) {
      // Valid but has warnings
      lines.push(`  ${chalk.yellow("○")} ${displayName}`);
      for (const issue of result.issues) {
        lines.push(formatIssue(issue));
      }
    } else {
      lines.push(`  ${chalk.red("✗")} ${displayName}`);
      for (const issue of result.issues) {
        lines.push(formatIssue(issue));
      }
    }
  }

  return lines;
}

export const checkCommand = new Command("check")
  .description("Validate workflows and personas")
  .argument(
    "[type]",
    "Type to check: all (default), workflows, or personas",
    "all"
  )
  .option("-d, --dir <path>", "Directory to check", process.cwd())
  .option("-q, --quiet", "Only show errors, no summary")
  .option("--json", "Output results as JSON")
  .action(async (type, options) => {
    try {
      const config = await getConfig(options.dir);

      if (!config) {
        console.error(
          chalk.red(
            "No .agents directory found. Run 'dot-agents init' to create one."
          )
        );
        process.exit(1);
      }

      if (options.json) {
        // JSON output mode
        let results;

        if (type === "workflows" || type === "w") {
          results = {
            workflows: await validateAllWorkflows(
              config.workflowsDir,
              config.personasDir
            ),
          };
        } else if (type === "personas" || type === "p") {
          results = {
            personas: await validateAllPersonas(config.personasDir),
          };
        } else {
          results = await validateAll(config.agentsDir);
        }

        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Human-readable output
      if (type === "workflows" || type === "w") {
        const results = await validateAllWorkflows(
          config.workflowsDir,
          config.personasDir
        );

        if (!options.quiet) {
          console.log(chalk.blue("\nChecking workflows...\n"));
        }

        const lines = formatResults(results, config.workflowsDir, "workflows");
        console.log(lines.join("\n"));

        const valid = results.filter((r) => r.valid).length;
        const total = results.length;

        if (!options.quiet) {
          console.log(
            `\n${valid === total ? chalk.green("✓") : chalk.red("✗")} ${valid}/${total} workflows valid\n`
          );
        }

        if (valid !== total) {
          process.exit(1);
        }
      } else if (type === "personas" || type === "p") {
        const results = await validateAllPersonas(config.personasDir);

        if (!options.quiet) {
          console.log(chalk.blue("\nChecking personas...\n"));
        }

        const lines = formatResults(results, config.personasDir, "personas");
        console.log(lines.join("\n"));

        const valid = results.filter((r) => r.valid).length;
        const total = results.length;

        if (!options.quiet) {
          console.log(
            `\n${valid === total ? chalk.green("✓") : chalk.red("✗")} ${valid}/${total} personas valid\n`
          );
        }

        if (valid !== total) {
          process.exit(1);
        }
      } else {
        // Check all
        const summary = await validateAll(config.agentsDir);

        if (!options.quiet) {
          console.log(chalk.blue("\nChecking personas...\n"));
        }

        const personaLines = formatResults(
          summary.personas.results,
          config.personasDir,
          "personas"
        );
        console.log(personaLines.join("\n"));

        if (!options.quiet) {
          console.log(chalk.blue("\nChecking workflows...\n"));
        }

        const workflowLines = formatResults(
          summary.workflows.results,
          config.workflowsDir,
          "workflows"
        );
        console.log(workflowLines.join("\n"));

        // Summary
        if (!options.quiet) {
          console.log(chalk.blue("\nSummary:\n"));
          console.log(
            `  Personas:  ${summary.personas.valid}/${summary.personas.total} valid`
          );
          console.log(
            `  Workflows: ${summary.workflows.valid}/${summary.workflows.total} valid`
          );

          if (summary.valid) {
            console.log(chalk.green("\n✓ All checks passed\n"));
          } else {
            console.log(chalk.red("\n✗ Validation failed\n"));
          }
        }

        if (!summary.valid) {
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

/**
 * Health check subcommand - checks for name collisions and other cross-system issues
 */
checkCommand
  .command("health")
  .description("Check for name collisions between projects and personas")
  .option("-d, --dir <path>", "Directory to check", process.cwd())
  .option("--json", "Output results as JSON")
  .action(async (options) => {
    try {
      const config = await getConfig(options.dir);

      if (!config) {
        console.error(
          chalk.red(
            "No .agents directory found. Run 'dot-agents init' to create one."
          )
        );
        process.exit(1);
      }

      // Get registered projects
      const projects = await listProjects();

      // Get local persona names (just the directory name, not full path)
      const personaPaths = await listPersonas(config.personasDir);
      const personaNames = personaPaths.map((p) => basename(p));

      // Detect collisions
      const collisions = await detectNameCollisions(personaNames);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              projects: projects.length,
              personas: personaNames.length,
              collisions,
              healthy: collisions.length === 0,
            },
            null,
            2
          )
        );
        return;
      }

      // Human-readable output
      console.log(chalk.blue("\nHealth Check\n"));

      console.log(chalk.dim(`  Registered projects: ${projects.length}`));
      console.log(chalk.dim(`  Local personas: ${personaNames.length}`));
      console.log();

      if (collisions.length === 0) {
        console.log(chalk.green("  ✓ No name collisions detected\n"));
        console.log(
          chalk.dim(
            "  @name addresses will route to projects first, then local personas.\n"
          )
        );
        return;
      }

      console.log(
        chalk.yellow(`  ⚠ Found ${collisions.length} name collision(s):\n`)
      );

      for (const collision of collisions) {
        console.log(chalk.white(`  ${collision.name}`));
        console.log(
          chalk.dim(`    Project: ${collision.projectPath}`)
        );
        console.log(
          chalk.dim(`    Persona: ${config.personasDir}/${collision.personaPath}`)
        );
        console.log(
          chalk.yellow(
            `    → @${collision.name} will route to the project, not the local persona`
          )
        );
        console.log();
      }

      console.log(
        chalk.dim(
          "  To reach the local persona, use a different name or remove the project.\n"
        )
      );

      // Exit with warning (non-zero) for CI integration
      process.exit(1);
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });
