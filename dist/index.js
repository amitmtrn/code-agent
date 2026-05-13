#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const config_1 = require("./config");
const ollama_1 = require("./providers/ollama");
const replicate_1 = require("./providers/replicate");
const core_1 = require("./agent/core");
const registry_1 = require("./tools/registry");
const fs_1 = require("./tools/fs");
const shell_1 = require("./tools/shell");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
// Register tools
registry_1.registry.register(fs_1.readFileTool);
registry_1.registry.register(fs_1.writeFileTool);
registry_1.registry.register(fs_1.listFilesTool);
registry_1.registry.register(shell_1.shellTool);
const program = new commander_1.Command();
program
    .name('codagent')
    .description('A clone of Claude Code using Replicate and Ollama models')
    .version('0.1.0')
    .option('-p, --provider <provider>', 'LLM provider (ollama or replicate)', config_1.config.DEFAULT_PROVIDER)
    .option('-m, --model <model>', 'Model name', config_1.config.DEFAULT_MODEL)
    .option('--host <host>', 'Ollama host URL')
    .option('-d, --deep-thinking', 'Enable deep thinking (self-reflection)', config_1.config.DEEP_THINKING)
    .argument('[prompt]', 'Initial prompt for the agent')
    .action(async (initialPrompt, options) => {
    let provider;
    if (options.provider === 'ollama') {
        provider = new ollama_1.OllamaProvider(options.host);
    }
    else if (options.provider === 'replicate') {
        provider = new replicate_1.ReplicateProvider();
    }
    else {
        console.error(chalk_1.default.red(`Unknown provider: ${options.provider}`));
        process.exit(1);
    }
    const agent = new core_1.Agent(provider, options.model, options.deepThinking, config_1.config.MAX_THINKING_LOOPS);
    if (initialPrompt) {
        await agent.chat(initialPrompt);
    }
    // Interactive loop
    while (true) {
        const { input } = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'input',
                message: chalk_1.default.green('You:'),
            },
        ]);
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            break;
        }
        await agent.chat(input);
    }
});
program.parse();
