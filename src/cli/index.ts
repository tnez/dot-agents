#!/usr/bin/env node

import { Command } from "commander";
import { initCommand, checkCommand, runCommand, listCommand, showCommand, scheduleCommand, daemonCommand, channelsCommand, personasCommand } from "./commands/index.js";
import { getVersionSync } from "../lib/index.js";

const program = new Command();

program
  .name("dot-agents")
  .description("Run and manage agentic workflows")
  .version(getVersionSync())
  .action(() => {
    program.help();
  });

program.addCommand(initCommand);
program.addCommand(checkCommand);
program.addCommand(runCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(scheduleCommand);
program.addCommand(daemonCommand);
program.addCommand(channelsCommand);
program.addCommand(personasCommand);

// Alias 'workflows' to 'list workflows'
program
  .command("workflows")
  .description("List all workflows (alias for 'list workflows')")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    await listCommand.parseAsync(["workflows", ...(options.verbose ? ["-v"] : [])], {
      from: "user",
    });
  });

program.parse();
