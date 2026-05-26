import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool } from './registry';
import inquirer from 'inquirer';
import chalk from 'chalk';

const execAsync = promisify(exec);

export const shellTool: Tool = {
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
    readOnly: false,
  },
  async execute({ command }) {
    console.log(chalk.yellow(`\n⚠️  The agent wants to execute the following command:`));
    console.log(chalk.white(`   ${command}`));

    const { confirm } = await inquirer.prompt([
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
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
      return `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
    } catch (e: any) {
      return `Error executing command: ${e.message}\n\nstdout:\n${e.stdout}\n\nstderr:\n${e.stderr}`;
    }
  },
};
