import { execFile } from 'child_process';
import { promisify } from 'util';
import { Tool } from './registry';

const execFileAsync = promisify(execFile);

const RG_TIMEOUT_MS = 15 * 1000;
const MAX_OUTPUT_BYTES = 256 * 1024; // truncate ripgrep output to ~256 KB

let cachedHasRipgrep: boolean | null = null;
async function hasRipgrep(): Promise<boolean> {
  if (cachedHasRipgrep !== null) return cachedHasRipgrep;
  try {
    await execFileAsync('rg', ['--version'], { timeout: 3000 });
    cachedHasRipgrep = true;
  } catch {
    cachedHasRipgrep = false;
  }
  return cachedHasRipgrep;
}

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return s.slice(0, MAX_OUTPUT_BYTES) + `\n…[truncated, ${s.length - MAX_OUTPUT_BYTES} more bytes]`;
}

/**
 * Fast text search across the project. Prefers ripgrep when available
 * (which respects .gitignore and is orders of magnitude faster than
 * grep -r); falls back to `grep -RIn` otherwise. Returns matches as
 * `<path>:<line>:<text>` lines, capped at `max_results`.
 *
 * This is the small-model's escape hatch from "read every file to find
 * where X lives". Without it, the agent burns turns walking the tree.
 */
export const searchCodeTool: Tool = {
  definition: {
    name: 'search_code',
    description: 'Search the project for a regex or literal string. Returns matching lines as `<path>:<line>:<text>`. Much faster than reading files one-by-one when you need to locate where a symbol, function, or string lives. Honors .gitignore.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The regex (or literal string with literal=true) to search for' },
        path: { type: 'string', description: 'Directory to search under, relative to the project root', default: '.' },
        literal: { type: 'boolean', description: 'Treat query as a literal string (escape regex metacharacters)', default: false },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive match', default: false },
        max_results: { type: 'number', description: 'Maximum number of matching lines to return', default: 100 },
        glob: { type: 'string', description: 'Optional glob filter (e.g. `*.ts` or `!node_modules/**`)' },
      },
      required: ['query'],
    },
    readOnly: true,
  },
  async execute({ query, path: searchPath = '.', literal = false, case_insensitive = false, max_results = 100, glob }) {
    if (typeof query !== 'string' || !query) return 'Error: query is required and must be a non-empty string.';
    const cap = Math.min(Math.max(1, Number(max_results) || 100), 1000);

    const useRg = await hasRipgrep();
    if (useRg) {
      const args = ['--line-number', '--with-filename', '--no-heading', '--color=never', '-m', String(cap)];
      if (literal) args.push('--fixed-strings');
      if (case_insensitive) args.push('--ignore-case');
      if (glob) { args.push('--glob', glob); }
      args.push('--', query, searchPath);
      try {
        const { stdout, stderr } = await execFileAsync('rg', args, { timeout: RG_TIMEOUT_MS, maxBuffer: 4 * MAX_OUTPUT_BYTES });
        const text = stdout.trim();
        if (!text) return `No matches for ${literal ? 'literal string' : 'regex'} \`${query}\` under \`${searchPath}\`.`;
        const trailer = stderr.trim() ? `\n\nstderr:\n${stderr.trim()}` : '';
        return truncate(text) + trailer;
      } catch (e: any) {
        // ripgrep exits 1 when no matches — surface as "no matches" not an error.
        if (e?.code === 1 && !e.stderr) {
          return `No matches for ${literal ? 'literal string' : 'regex'} \`${query}\` under \`${searchPath}\`.`;
        }
        return `Error running ripgrep: ${e?.message ?? String(e)}\n\nstderr:\n${e?.stderr ?? ''}`;
      }
    }

    // Fallback: grep -RIn (recursive, skip binaries, line numbers).
    const grepArgs = ['-RIn'];
    if (case_insensitive) grepArgs.push('-i');
    if (literal) grepArgs.push('-F');
    grepArgs.push('--', query, searchPath);
    try {
      const { stdout } = await execFileAsync('grep', grepArgs, { timeout: RG_TIMEOUT_MS, maxBuffer: 4 * MAX_OUTPUT_BYTES });
      const lines = stdout.split('\n').filter(Boolean).slice(0, cap);
      if (lines.length === 0) return `No matches for ${literal ? 'literal string' : 'regex'} \`${query}\` under \`${searchPath}\`.`;
      return truncate(lines.join('\n'));
    } catch (e: any) {
      if (e?.code === 1) return `No matches for ${literal ? 'literal string' : 'regex'} \`${query}\` under \`${searchPath}\`.`;
      return `Error running grep: ${e?.message ?? String(e)}\n\nstderr:\n${e?.stderr ?? ''}`;
    }
  },
};
