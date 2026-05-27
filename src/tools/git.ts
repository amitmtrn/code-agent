import { execFile } from 'child_process';
import { promisify } from 'util';
import { Tool } from './registry';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30 * 1000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const MAX_DIFF_BYTES = 200 * 1024;

function truncate(s: string): string {
  if (s.length <= MAX_DIFF_BYTES) return s;
  return s.slice(0, MAX_DIFF_BYTES) + `\n…[truncated, ${s.length - MAX_DIFF_BYTES} more bytes — run with a narrower path]`;
}

/**
 * Show what's changed in the working tree. Without this, the agent has to
 * re-read every file it edited to figure out what it actually changed —
 * which it'll get wrong half the time. `git_diff` is a one-call source of
 * truth for "what does the patch I produced look like".
 *
 * Modes via `mode` parameter:
 *   - 'working' (default): `git diff` — unstaged changes vs HEAD
 *   - 'staged':            `git diff --cached` — staged changes
 *   - 'all':               `git diff HEAD` — staged + unstaged combined
 *   - 'last-commit':       `git show HEAD` — what the most recent commit changed
 */
export const gitDiffTool: Tool = {
  definition: {
    name: 'git_diff',
    description: 'Show pending or recent changes to the working tree via git. Use this to review what you just wrote before deciding next steps — much more reliable than re-reading the files. Returns a unified diff truncated at ~200 KB.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['working', 'staged', 'all', 'last-commit'], description: 'working: unstaged changes vs HEAD. staged: staged but uncommitted. all: working+staged combined. last-commit: what HEAD last changed.', default: 'all' },
        path: { type: 'string', description: 'Optional path filter (file or directory, relative to project root). Useful to scope the diff when many files changed.' },
        stat: { type: 'boolean', description: 'Return `git diff --stat` (one-line-per-file summary) instead of the full patch.', default: false },
      },
    },
    readOnly: true,
  },
  async execute({ mode = 'all', path: pathFilter, stat = false }) {
    let args: string[];
    if (mode === 'staged') args = ['diff', '--cached'];
    else if (mode === 'working') args = ['diff'];
    else if (mode === 'last-commit') args = ['show', '--no-color', 'HEAD'];
    else args = ['diff', 'HEAD']; // 'all'
    if (stat) args.push('--stat');
    if (pathFilter) args.push('--', pathFilter);

    try {
      const { stdout, stderr } = await execFileAsync('git', args, { cwd: process.cwd(), timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER });
      const text = stdout.trim();
      if (!text) {
        return mode === 'last-commit'
          ? 'No commits yet on this branch.'
          : 'No changes in the working tree.';
      }
      const trailer = stderr.trim() ? `\n\nstderr:\n${stderr.trim()}` : '';
      return truncate(text) + trailer;
    } catch (e: any) {
      // git diff exits 1 only when --exit-code is set; failures here are real errors.
      return `Error running git ${args.join(' ')}: ${e?.message ?? String(e)}\n\nstderr:\n${e?.stderr ?? ''}`;
    }
  },
};
