import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { gitDiffTool } from '../../../src/tools/git';

const execFileAsync = promisify(execFile);

async function gitInit(dir: string) {
  await execFileAsync('git', ['init', '-q'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await execFileAsync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
}

describe('git_diff', () => {
  let dir: string;
  const cwdSaved = process.cwd();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codagent-gitdiff-'));
    await gitInit(dir);
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwdSaved);
  });

  it('reports "No changes" when the working tree is clean', async () => {
    const result = await gitDiffTool.execute({});
    expect(result).toContain('No changes');
  });

  it('returns a unified diff of unstaged working-tree changes', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'one\n');
    await execFileAsync('git', ['add', 'a.txt'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'add a', '-q'], { cwd: dir });
    await fs.writeFile(path.join(dir, 'a.txt'), 'one\ntwo\n');

    const result = await gitDiffTool.execute({ mode: 'working' });
    expect(result).toContain('a.txt');
    expect(result).toContain('+two');
  });

  it('returns the stat summary when stat=true', async () => {
    await fs.writeFile(path.join(dir, 'b.txt'), 'hello\n');
    await execFileAsync('git', ['add', 'b.txt'], { cwd: dir });
    const result = await gitDiffTool.execute({ mode: 'staged', stat: true });
    expect(result).toContain('b.txt');
    expect(result).toMatch(/\| \d/); // stat formatting like "b.txt | 1 +"
  });

  it('shows the most recent commit with mode=last-commit', async () => {
    await fs.writeFile(path.join(dir, 'c.txt'), 'first\n');
    await execFileAsync('git', ['add', 'c.txt'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'add c file', '-q'], { cwd: dir });

    const result = await gitDiffTool.execute({ mode: 'last-commit' });
    expect(result).toContain('add c file');
    expect(result).toContain('c.txt');
  });
});
