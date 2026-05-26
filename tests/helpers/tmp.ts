import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export async function makeTmpDir(prefix = 'codagent-test-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
