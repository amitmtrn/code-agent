import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { searchCodeTool } from '../../../src/tools/search';

describe('search_code', () => {
  let dir: string;
  const cwdSaved = process.cwd();

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codagent-search-'));
    await fs.writeFile(path.join(dir, 'alpha.ts'), 'function foo() { return 1; }\nexport const BAR = 2;\n');
    await fs.writeFile(path.join(dir, 'beta.ts'), 'import { foo } from "./alpha";\nconsole.log(foo());\n');
    await fs.mkdir(path.join(dir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(dir, 'nested/gamma.md'), '# heading\nfoo appears here too\n');
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwdSaved);
  });

  it('returns matches as path:line:text lines', async () => {
    process.chdir(dir);
    const result = await searchCodeTool.execute({ query: 'foo' });
    expect(result).toContain('alpha.ts');
    expect(result).toContain('beta.ts');
    expect(result).toMatch(/\.ts:\d+:/);
  });

  it('treats literal=true as a literal string (special characters ignored)', async () => {
    process.chdir(dir);
    const result = await searchCodeTool.execute({ query: 'foo()', literal: true });
    expect(result).toContain('foo()');
  });

  it('reports "no matches" instead of throwing when nothing is found', async () => {
    process.chdir(dir);
    const result = await searchCodeTool.execute({ query: 'this-string-cannot-possibly-exist-zzzzz' });
    expect(result.toLowerCase()).toContain('no matches');
  });

  it('rejects an empty query with a clear error', async () => {
    process.chdir(dir);
    const result = await searchCodeTool.execute({ query: '' });
    expect(result.toLowerCase()).toContain('error');
    expect(result).toContain('query');
  });
});
