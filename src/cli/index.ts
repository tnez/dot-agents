#!/usr/bin/env node

import { Command } from "commander";
import { initCommand, checkCommand, scheduleCommand, daemonCommand, channelsCommand, personasCommand, workflowsCommand } from "./commands/index.js";
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
program.addCommand(scheduleCommand);
program.addCommand(daemonCommand);
program.addCommand(channelsCommand);
program.addCommand(personasCommand);
program.addCommand(workflowsCommand);

program.parse();
