import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runTestsTool } from '../../../src/tools/run-tests';

describe('run_tests', () => {
  let dir: string;
  const cwdSaved = process.cwd();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codagent-runtests-'));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwdSaved);
  });

  it('reports "no test command could be inferred" for an empty directory', async () => {
    const result = await runTestsTool.execute({});
    expect(result).toContain('No test command could be inferred');
  });

  it('detects an npm project from package.json and runs its test script', async () => {
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'fixture',
      scripts: { test: 'echo PASS-TOKEN' },
    }));
    const result = await runTestsTool.execute({});
    expect(result).toContain('PASSED');
    expect(result).toContain('PASS-TOKEN');
    expect(result).toContain('npm');
  });

  it('surfaces FAILED with the failing output when the test script exits non-zero', async () => {
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'fixture',
      scripts: { test: 'echo OOPS-LINE && exit 7' },
    }));
    const result = await runTestsTool.execute({});
    expect(result).toContain('FAILED');
    expect(result).toContain('OOPS-LINE');
  });

  it('accepts a custom command override', async () => {
    const result = await runTestsTool.execute({ command: 'echo CUSTOM-OK' });
    expect(result).toContain('PASSED');
    expect(result).toContain('CUSTOM-OK');
  });
});
