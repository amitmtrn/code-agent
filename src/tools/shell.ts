import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool } from './registry';
import { runtime } from '../runtime';
import inquirer from 'inquirer';
import chalk from 'chalk';

const execAsync = promisify(exec);

// Shell commands run synchronously — they MUST terminate. A blanket
// 10-minute timeout used to apply to every command, which meant a diagnostic
// like `curl http://localhost:3001` against a dead port wasted 10 minutes
// per attempt. Switch to a per-command timeout that picks 10 minutes only
// for commands that legitimately take that long (installs, builds, image
// pulls) and 60 seconds for everything else.
const TIMEOUT_LONG_MS = 10 * 60 * 1000;
const TIMEOUT_DEFAULT_MS = 60 * 1000;
const SHELL_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

const LONG_RUNNING_RE = /\b(npm|pnpm|yarn|bun)\s+(install|ci|build|update|audit)\b|\bdocker\s+(build|pull|push|compose\s+(up|build))\b|\b(make|cmake|cargo\s+build|gradle\s+build|mvn\s+install|go\s+build|pip\s+install)\b/;

function pickTimeout(command: string): number {
  return LONG_RUNNING_RE.test(command) ? TIMEOUT_LONG_MS : TIMEOUT_DEFAULT_MS;
}

/**
 * `curl`/`wget` with no explicit timeout will block on a TCP connect until
 * the shell timeout fires — wasting the full minute (or 10) on a diagnostic.
 * Inject a short `--max-time` if the agent forgot to set one. We only touch
 * the literal `curl ` / `wget ` prefix, so the user's existing flags are
 * preserved.
 */
function withDiagnosticTimeout(command: string): string {
  if (/^\s*curl\b/.test(command) && !/(-m|--max-time|--connect-timeout)\b/.test(command)) {
    return command.replace(/^(\s*)curl\b/, '$1curl --max-time 10');
  }
  if (/^\s*wget\b/.test(command) && !/--timeout=|--connect-timeout=/.test(command)) {
    return command.replace(/^(\s*)wget\b/, '$1wget --timeout=10');
  }
  return command;
}

// Heuristic — commands that almost always block on a foreground server.
// We refuse them up front with a hint, since waiting for a timeout wastes
// 10 minutes and confuses the model.
const FOREGROUND_SERVER_RE = /\b(npm|pnpm|yarn|bun)\s+(start|run\s+(dev|start|serve|watch))\b|\bnpx\s+(vite|next|nodemon)\b|\bnpm\s+run\s+dev\b|\buvicorn\b|\bgunicorn\b|\bflask\s+run\b|\brails\s+(s|server)\b/;

/**
 * A command is safe even though it matches FOREGROUND_SERVER_RE when the
 * caller has already arranged for it not to block — either by backgrounding
 * the whole pipeline (trailing single `&`) or by capping it with `timeout`.
 * Without this exception, the agent's natural workaround (`nohup … &`) gets
 * refused too, and the model loops trying to escape its own jail.
 */
function isAlreadyBoundedRun(command: string): boolean {
  const trimmed = command.trim();
  // Trailing `&` is the shell's background operator. Reject only standalone `&`
  // (not `&&`, which is logical-AND). We look at the last meaningful char.
  if (/(^|[^&])&\s*$/.test(trimmed)) return true;
  // Leading `timeout <secs>` is the user explicitly capping the run.
  if (/^\s*timeout\s+\d+(\.\d+)?[smhd]?\s+/.test(trimmed)) return true;
  return false;
}

function describeError(e: any, command: string, timeoutMs: number): string {
  // exec sets e.killed=true and e.signal when timed out. Node also sometimes
  // sets e.code === 'ETIMEDOUT' depending on the failure path.
  const timedOut = e?.killed || e?.signal === 'SIGTERM' || e?.code === 'ETIMEDOUT';
  if (timedOut) {
    const human = timeoutMs >= 60000
      ? `${Math.round(timeoutMs / 60000)} minutes`
      : `${Math.round(timeoutMs / 1000)} seconds`;
    return `Error executing command: timed out after ${human} and was killed. The command was: ${command}\n\nIf you need to start a long-running server, run it in the background instead (e.g. \`nohup <cmd> > /tmp/log 2>&1 &\`) and then move on — do NOT try to wait for it to exit.\n\nstdout:\n${e.stdout ?? ''}\n\nstderr:\n${e.stderr ?? ''}`;
  }
  return `Error executing command: ${e.message}\n\nstdout:\n${e.stdout ?? ''}\n\nstderr:\n${e.stderr ?? ''}`;
}

export const shellTool: Tool = {
  definition: {
    name: 'execute_shell',
    description: 'Execute a shell command. The command MUST terminate on its own — do not start long-running servers in the foreground (use `nohup <cmd> &` if a server is required). Most commands are killed after 60 seconds; installs/builds (npm install, docker build, etc.) get 10 minutes.',
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
    if (FOREGROUND_SERVER_RE.test(command) && !isAlreadyBoundedRun(command)) {
      return `Error: refused to run \`${command}\` because it looks like a foreground server that would never exit. Run servers in the background instead: \`nohup ${command} > /tmp/server.log 2>&1 &\`, then continue. If you actually need the server's output to verify it boots, run it briefly with a timeout (\`timeout 5 ${command}\`).`;
    }

    const effective = withDiagnosticTimeout(command);
    const timeout = pickTimeout(effective);
    try {
      const { stdout, stderr } = await execAsync(effective, {
        cwd: process.cwd(),
        timeout,
        maxBuffer: SHELL_MAX_BUFFER,
        killSignal: 'SIGTERM',
      });
      return `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
    } catch (e: any) {
      return describeError(e, effective, timeout);
    }
  },
};
