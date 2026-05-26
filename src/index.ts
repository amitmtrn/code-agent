#!/usr/bin/env node
import './bootstrap';
import { Command } from 'commander';
import { config } from './config';
import { OllamaProvider } from './providers/ollama';
import { ReplicateProvider } from './providers/replicate';
import { Agent } from './agent/core';
import { registry } from './tools/registry';
import { readFileTool, writeFileTool, listFilesTool, createDirectoryTool } from './tools/fs';
import { shellTool } from './tools/shell';
import { setRuntime } from './runtime';
import { emitError } from './output/emit';
import inquirer from 'inquirer';
import chalk from 'chalk';

// Register tools
registry.register(readFileTool);
registry.register(writeFileTool);
registry.register(listFilesTool);
registry.register(createDirectoryTool);
registry.register(shellTool);

const program = new Command();

program
  .name('codagent')
  .description('A clone of Claude Code using Replicate and Ollama models')
  .version('0.2.0')
  .option('-p, --provider <provider>', 'LLM provider (ollama or replicate)', config.DEFAULT_PROVIDER)
  .option('-m, --model <model>', 'Model name', config.DEFAULT_MODEL)
  .option('--host <host>', 'Ollama host URL')
  .option('-d, --deep-thinking', 'Enable deep thinking (self-reflection)', config.DEEP_THINKING)
  .option('--plan', 'Start in plan mode (read-only investigation + approval gate)', config.PLAN_MODE)
  .option('--exec', 'Run the prompt once and exit (no interactive loop). Reads prompt from stdin if no positional argument is given.', false)
  .option('--json', 'Emit NDJSON events to stdout (one JSON object per line) instead of pretty output. Suitable for embedding in other tools.', false)
  .option('--yes', 'Auto-approve shell-command confirmations (no TTY prompts). Required when running headless.', false)
  .argument('[prompt]', 'Initial prompt for the agent')
  .action(async (initialPrompt, options) => {
    setRuntime({
      exec: !!options.exec,
      json: !!options.json,
      autoApprove: !!options.yes,
    });

    if (options.exec && options.plan) {
      emitError('--exec and --plan are incompatible: plan mode requires interactive approval.');
      process.exit(1);
    }

    let provider;
    if (options.provider === 'ollama') {
      provider = new OllamaProvider(options.host);
    } else if (options.provider === 'replicate') {
      provider = new ReplicateProvider();
    } else {
      emitError(`Unknown provider: ${options.provider}`);
      process.exit(1);
    }

    const agent = new Agent(
      provider,
      options.model,
      options.deepThinking,
      config.MAX_THINKING_LOOPS,
      options.plan,
    );

    if (!options.json) {
      console.log(chalk.gray(`pwd: ${process.cwd()}`));
      if (options.plan) {
        console.log(chalk.magenta('🗒  Plan mode active — read-only tools only. You will review the plan before execution.'));
      }
    }

    if (options.exec) {
      const prompt = initialPrompt || (await readStdin());
      if (!prompt || !prompt.trim()) {
        emitError('No prompt provided. Pass a positional argument or pipe text to stdin.');
        process.exit(1);
      }
      await agent.chat(prompt.trim());
      process.exit(0);
    }

    if (initialPrompt) {
      await agent.chat(initialPrompt);
      if (await handlePlanApproval(agent)) return;
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
      if (await handlePlanApproval(agent)) return;
    }
  });

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function handlePlanApproval(agent: Agent): Promise<boolean> {
  if (!agent.isInPlanMode()) return false;

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: chalk.magenta('Plan ready. What would you like to do?'),
      choices: [
        { name: 'Approve and execute', value: 'approve' },
        { name: 'Revise (give feedback)', value: 'revise' },
        { name: 'Cancel and exit', value: 'cancel' },
      ],
    },
  ]);

  if (choice === 'cancel') return true;

  if (choice === 'approve') {
    agent.exitPlanMode();
    await agent.chat('Proceed with the approved plan.');
    return false;
  }

  const { feedback } = await inquirer.prompt([
    {
      type: 'input',
      name: 'feedback',
      message: chalk.magenta('Feedback for the revision:'),
    },
  ]);
  await agent.chat(`Revise the plan with this feedback: ${feedback}`);
  return handlePlanApproval(agent);
}

program.parse();
