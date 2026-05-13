#!/usr/bin/env node
import { Command } from 'commander';
import { config } from './config';
import { OllamaProvider } from './providers/ollama';
import { ReplicateProvider } from './providers/replicate';
import { Agent } from './agent/core';
import { registry } from './tools/registry';
import { readFileTool, writeFileTool, listFilesTool } from './tools/fs';
import { shellTool } from './tools/shell';
import inquirer from 'inquirer';
import chalk from 'chalk';

// Register tools
registry.register(readFileTool);
registry.register(writeFileTool);
registry.register(listFilesTool);
registry.register(shellTool);

const program = new Command();

program
  .name('codagent')
  .description('A clone of Claude Code using Replicate and Ollama models')
  .version('0.1.0')
  .option('-p, --provider <provider>', 'LLM provider (ollama or replicate)', config.DEFAULT_PROVIDER)
  .option('-m, --model <model>', 'Model name', config.DEFAULT_MODEL)
  .option('--host <host>', 'Ollama host URL')
  .option('-d, --deep-thinking', 'Enable deep thinking (self-reflection)', config.DEEP_THINKING)
  .argument('[prompt]', 'Initial prompt for the agent')
  .action(async (initialPrompt, options) => {
    let provider;
    
    if (options.provider === 'ollama') {
      provider = new OllamaProvider(options.host);
    } else if (options.provider === 'replicate') {
      provider = new ReplicateProvider();
    } else {
      console.error(chalk.red(`Unknown provider: ${options.provider}`));
      process.exit(1);
    }

    const agent = new Agent(
      provider, 
      options.model, 
      options.deepThinking, 
      config.MAX_THINKING_LOOPS
    );

    if (initialPrompt) {
      await agent.chat(initialPrompt);
    }

    // Interactive loop
    while (true) {
      const { input } = await inquirer.prompt([
        {
          type: 'input',
          name: 'input',
          message: chalk.green('You:'),
        },
      ]);

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        break;
      }

      await agent.chat(input);
    }
  });

program.parse();
