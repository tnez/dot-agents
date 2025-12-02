import { Command } from "commander";
import chalk from "chalk";
import {
  requireConfig,
  listWorkflows,
  loadWorkflow,
  listPersonas,
  loadPersona,
} from "../../lib/index.js";
import { relative } from "node:path";

export const listCommand = new Command("list")
  .description("List workflows or personas")
  .argument("[type]", "Type to list: workflows (default) or personas", "workflows")
  .option("-v, --verbose", "Show detailed information")
  .action(async (type, options) => {
    try {
      const config = await requireConfig();

      if (type === "workflows" || type === "w") {
        const workflowPaths = await listWorkflows(config.workflowsDir);

        if (workflowPaths.length === 0) {
          console.log(chalk.yellow("No workflows found"));
          return;
        }

        console.log(chalk.blue(`Workflows (${workflowPaths.length}):\n`));

        for (const workflowPath of workflowPaths) {
          try {
            const workflow = await loadWorkflow(workflowPath);
            const relPath = relative(config.workflowsDir, workflowPath);

            console.log(chalk.white(`  ${workflow.name}`));
            console.log(chalk.dim(`    ${workflow.description}`));

            if (options.verbose) {
              console.log(chalk.dim(`    Path: ${relPath}`));
              console.log(chalk.dim(`    Persona: ${workflow.persona}`));

              if (workflow.on?.schedule) {
                const crons = workflow.on.schedule.map((s: { cron: string }) => s.cron).join(", ");
                console.log(chalk.dim(`    Schedule: ${crons}`));
              }

              if (workflow.on?.manual) {
                console.log(chalk.dim(`    Manual: enabled`));
              }

              if (workflow.inputs && workflow.inputs.length > 0) {
                const inputNames = workflow.inputs.map((i: { name: string }) => i.name).join(", ");
                console.log(chalk.dim(`    Inputs: ${inputNames}`));
              }
            }

            console.log();
          } catch (error) {
            console.log(chalk.red(`  ${workflowPath} (invalid)`));
            if (options.verbose) {
              console.log(chalk.red(`    Error: ${(error as Error).message}`));
            }
            console.log();
          }
        }
      } else if (type === "personas" || type === "p") {
        const personaPaths = await listPersonas(config.personasDir);

        if (personaPaths.length === 0) {
          console.log(chalk.yellow("No personas found"));
          return;
        }

        console.log(chalk.blue(`Personas (${personaPaths.length}):\n`));

        for (const personaPath of personaPaths) {
          try {
            const persona = await loadPersona(personaPath);
            const relPath = relative(config.personasDir, personaPath);

            console.log(chalk.white(`  ${relPath}`));
            if (persona.description) {
              console.log(chalk.dim(`    ${persona.description}`));
            }

            if (options.verbose) {
              const cmd = Array.isArray(persona.cmd)
                ? persona.cmd[0]
                : persona.cmd;
              console.log(chalk.dim(`    Command: ${cmd}`));

              if (persona.skills && persona.skills.length > 0) {
                console.log(chalk.dim(`    Skills: ${persona.skills.join(", ")}`));
              }

              if (persona.env && Object.keys(persona.env).length > 0) {
                console.log(
                  chalk.dim(`    Env: ${Object.keys(persona.env).join(", ")}`)
                );
              }
            }

            console.log();
          } catch (error) {
            console.log(chalk.red(`  ${personaPath} (invalid)`));
            if (options.verbose) {
              console.log(chalk.red(`    Error: ${(error as Error).message}`));
            }
            console.log();
          }
        }
      } else {
        console.error(chalk.red(`Unknown type: ${type}`));
        console.error(chalk.dim("Valid types: workflows, personas"));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });
