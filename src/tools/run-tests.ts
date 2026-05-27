import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool } from './registry';

const execAsync = promisify(exec);

const TEST_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_MAX_BUFFER = 10 * 1024 * 1024;

interface ProjectKind {
  kind: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'python' | 'cargo' | 'go' | 'unknown';
  hint: string;
  defaultCommand: string;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function detectProject(cwd: string): Promise<ProjectKind> {
  // Node ecosystem — check lockfiles to pick the right runner.
  if (await fileExists(path.join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'));
      const hasTestScript = !!(pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test));
      if (await fileExists(path.join(cwd, 'pnpm-lock.yaml'))) {
        return { kind: 'pnpm', hint: hasTestScript ? 'pnpm test' : 'no `test` script in package.json', defaultCommand: 'pnpm test' };
      }
      if (await fileExists(path.join(cwd, 'yarn.lock'))) {
        return { kind: 'yarn', hint: hasTestScript ? 'yarn test' : 'no `test` script in package.json', defaultCommand: 'yarn test' };
      }
      if (await fileExists(path.join(cwd, 'bun.lockb'))) {
        return { kind: 'bun', hint: hasTestScript ? 'bun test' : 'no `test` script in package.json', defaultCommand: 'bun test' };
      }
      return { kind: 'npm', hint: hasTestScript ? 'npm test' : 'no `test` script in package.json — add one or override with command=', defaultCommand: 'npm test' };
    } catch {
      return { kind: 'npm', hint: 'package.json present but not parseable', defaultCommand: 'npm test' };
    }
  }
  if (await fileExists(path.join(cwd, 'pyproject.toml')) || await fileExists(path.join(cwd, 'setup.py')) || await fileExists(path.join(cwd, 'pytest.ini')) || await fileExists(path.join(cwd, 'tests'))) {
    return { kind: 'python', hint: 'pytest', defaultCommand: 'pytest -q' };
  }
  if (await fileExists(path.join(cwd, 'Cargo.toml'))) {
    return { kind: 'cargo', hint: 'cargo test', defaultCommand: 'cargo test --quiet' };
  }
  if (await fileExists(path.join(cwd, 'go.mod'))) {
    return { kind: 'go', hint: 'go test ./...', defaultCommand: 'go test ./...' };
  }
  return { kind: 'unknown', hint: 'no recognized manifest', defaultCommand: '' };
}

interface ParsedResult {
  passed: number | null;
  failed: number | null;
  durationMs: number;
}

function parseSummary(kind: ProjectKind['kind'], output: string): ParsedResult {
  // Best-effort regexes for the most common runners. When we can't parse,
  // null tells the caller to fall back to the raw output.
  if (kind === 'npm' || kind === 'pnpm' || kind === 'yarn' || kind === 'bun') {
    const jest = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/i);
    if (jest) return { passed: parseInt(jest[2], 10), failed: parseInt(jest[1] ?? '0', 10), durationMs: 0 };
    const vitest = output.match(/Test Files\s+\d+\s+(?:failed\s+\|\s+)?(?:\d+\s+passed\s+)?\(\d+\)\s*\n\s*Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed/i);
    if (vitest) return { passed: parseInt(vitest[2], 10), failed: parseInt(vitest[1] ?? '0', 10), durationMs: 0 };
    const mocha = output.match(/(\d+)\s+passing[\s\S]*?(?:(\d+)\s+failing)?/i);
    if (mocha) return { passed: parseInt(mocha[1], 10), failed: parseInt(mocha[2] ?? '0', 10), durationMs: 0 };
  }
  if (kind === 'python') {
    const pytest = output.match(/=+\s*(?:(\d+)\s+failed[, ]+)?(?:(\d+)\s+passed)?(?:[, ]+(\d+)\s+skipped)?[\s\S]*?=+/);
    if (pytest && (pytest[1] || pytest[2])) {
      return { passed: pytest[2] ? parseInt(pytest[2], 10) : 0, failed: pytest[1] ? parseInt(pytest[1], 10) : 0, durationMs: 0 };
    }
  }
  if (kind === 'cargo') {
    const cargo = output.match(/test result:\s+(?:ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/);
    if (cargo) return { passed: parseInt(cargo[1], 10), failed: parseInt(cargo[2], 10), durationMs: 0 };
  }
  if (kind === 'go') {
    const passes = (output.match(/^ok\s+/gm) ?? []).length;
    const fails = (output.match(/^FAIL\s+/gm) ?? []).length;
    if (passes > 0 || fails > 0) return { passed: passes, failed: fails, durationMs: 0 };
  }
  return { passed: null, failed: null, durationMs: 0 };
}

function formatTail(output: string, maxLines = 80): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output.trim();
  return `…[${lines.length - maxLines} earlier lines omitted]\n` + lines.slice(-maxLines).join('\n').trim();
}

/**
 * One-call test runner with structured pass/fail counts. Auto-detects
 * project type from manifest files; the agent can override with a custom
 * `command`. Designed so the agent gets actionable feedback ("2 failed,
 * 14 passed") instead of having to scroll a wall of output.
 */
export const runTestsTool: Tool = {
  definition: {
    name: 'run_tests',
    description: 'Run the project test suite. Auto-detects npm/pnpm/yarn/bun/pytest/cargo/go from manifest files. Returns a structured "PASSED/FAILED" verdict with counts and the tail of the output so you can see which tests failed.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Override the auto-detected test command (e.g. `pytest tests/test_foo.py -k bar`). Omit to use the project default.' },
        path: { type: 'string', description: 'Project directory (relative to project root). Defaults to the project root.', default: '.' },
      },
    },
    readOnly: true,
  },
  async execute({ command, path: subPath = '.' }) {
    const cwd = path.isAbsolute(subPath) ? subPath : path.resolve(process.cwd(), subPath);
    const project = await detectProject(cwd);
    const cmd = (command && command.trim()) || project.defaultCommand;
    if (!cmd) {
      return `No test command could be inferred (${project.hint}). Pass an explicit \`command\` argument, or set up a test runner first.`;
    }

    const start = Date.now();
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: TEST_TIMEOUT_MS, maxBuffer: TEST_MAX_BUFFER });
      const output = `${stdout}\n${stderr}`;
      const parsed = parseSummary(project.kind, output);
      parsed.durationMs = Date.now() - start;
      const counts = parsed.passed === null && parsed.failed === null
        ? ''
        : ` (${parsed.passed ?? 0} passed, ${parsed.failed ?? 0} failed)`;
      return `PASSED${counts} in ${Math.round(parsed.durationMs / 1000)}s — \`${cmd}\` (${project.kind})\n\n${formatTail(output)}`;
    } catch (e: any) {
      const output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
      const parsed = parseSummary(project.kind, output);
      parsed.durationMs = Date.now() - start;
      const timedOut = e?.killed || e?.signal === 'SIGTERM' || e?.code === 'ETIMEDOUT';
      const verdict = timedOut ? 'TIMED_OUT' : 'FAILED';
      const counts = parsed.passed === null && parsed.failed === null
        ? ''
        : ` (${parsed.passed ?? 0} passed, ${parsed.failed ?? 0} failed)`;
      return `${verdict}${counts} in ${Math.round(parsed.durationMs / 1000)}s — \`${cmd}\` (${project.kind})\n\n${formatTail(output)}`;
    }
  },
};
