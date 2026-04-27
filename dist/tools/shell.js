"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shellTool = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.shellTool = {
    definition: {
        name: 'execute_shell',
        description: 'Execute a shell command',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'The shell command to execute' },
            },
            required: ['command'],
        },
    },
    async execute({ command }) {
        console.log(chalk_1.default.yellow(`\n⚠️  The agent wants to execute the following command:`));
        console.log(chalk_1.default.white(`   ${command}`));
        const { confirm } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Do you want to allow this command?',
                default: false,
            },
        ]);
        if (!confirm) {
            return 'Command execution cancelled by user.';
        }
        try {
            const { stdout, stderr } = await execAsync(command);
            return `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
        }
        catch (e) {
            return `Error executing command: ${e.message}\n\nstdout:\n${e.stdout}\n\nstderr:\n${e.stderr}`;
        }
    },
};
