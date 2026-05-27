import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool } from './registry';
import { runtime } from '../runtime';
import inquirer from 'inquirer';
import chalk from 'chalk';

const execAsync = promisify(exec);

// Shell commands run synchronously — they MUST terminate. A long-running
// server like `npm start` or `npm run dev` would otherwise hang the agent
// loop forever. We cap exec at 10 minutes and surface a clear timeout
// message so the model knows to switch strategy (e.g. start the server in
// the background with `nohup ... &` or skip starting it altogether).
const SHELL_TIMEOUT_MS = 10 * 60 * 1000;
const SHELL_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

// Heuristic — commands that almost always block on a foreground server.
// We refuse them up front with a hint, since waiting for a timeout wastes
// 10 minutes and confuses the model.
const FOREGROUND_SERVER_RE = /\b(npm|pnpm|yarn|bun)\s+(start|run\s+(dev|start|serve|watch))\b|\bnpx\s+(vite|next|nodemon)\b|\bnode\s+\S+\.js\s*$|\bnpm\s+run\s+dev\b|\buvicorn\b|\bgunicorn\b|\bflask\s+run\b|\brails\s+(s|server)\b/;

function describeError(e: any, command: string): string {
  // exec sets e.killed=true and e.signal when timed out. Node also sometimes
  // sets e.code === 'ETIMEDOUT' depending on the failure path.
  const timedOut = e?.killed || e?.signal === 'SIGTERM' || e?.code === 'ETIMEDOUT';
  if (timedOut) {
    const mins = Math.round(SHELL_TIMEOUT_MS / 60000);
    return `Error executing command: timed out after ${mins} minutes and was killed. The command was: ${command}\n\nIf you need to start a long-running server, run it in the background instead (e.g. \`nohup <cmd> > /tmp/log 2>&1 &\`) and then move on — do NOT try to wait for it to exit.\n\nstdout:\n${e.stdout ?? ''}\n\nstderr:\n${e.stderr ?? ''}`;
  }
  return `Error executing command: ${e.message}\n\nstdout:\n${e.stdout ?? ''}\n\nstderr:\n${e.stderr ?? ''}`;
}

export const shellTool: Tool = {
  definition: {
    name: 'execute_shell',
    description: 'Execute a shell command. The command MUST terminate on its own — do not start long-running servers in the foreground (use `nohup <cmd> &` if a server is required). Commands are killed after 10 minutes.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute. Must terminate on its own.' },
      },
      required: ['command'],
    },
    readOnly: false,
  },
  async execute({ command }) {
    if (!runtime.autoApprove) {
      if (!runtime.json) {
        console.log(chalk.yellow(`\n⚠️  The agent wants to execute the following command:`));
        console.log(chalk.white(`   ${command}`));
      }

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
    }

    // Reject foreground-server commands up front so we don't burn the 10-min
    // timeout. The model can re-issue with a background-run pattern.
    if (FOREGROUND_SERVER_RE.test(command)) {
      return `Error: refused to run \`${command}\` because it looks like a foreground server that would never exit. Run servers in the background instead: \`nohup ${command} > /tmp/server.log 2>&1 &\`, then continue. If you actually need the server's output to verify it boots, run it briefly with a timeout (\`timeout 5 ${command}\`).`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: SHELL_TIMEOUT_MS,
        maxBuffer: SHELL_MAX_BUFFER,
        killSignal: 'SIGTERM',
      });
      return `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
    } catch (e: any) {
      return describeError(e, command);
    }
  },
};
