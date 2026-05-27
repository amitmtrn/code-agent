import * as fs from 'fs/promises';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDirectoryTool, listFilesTool, readFileTool, writeFileTool } from '../../../src/tools/fs';
import { makeTmpDir, removeTmpDir } from '../../helpers/tmp';

describe('fs tools', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTmpDir();
  });

  afterEach(async () => {
    await removeTmpDir(dir);
  });

  describe('read_file', () => {
    it('returns the contents of an existing file', async () => {
      const filePath = path.join(dir, 'hello.txt');
      await fs.writeFile(filePath, 'world');
      const result = await readFileTool.execute({ path: filePath });
      expect(result).toBe('world');
    });

    it('returns an error string (does not throw) for a missing file', async () => {
      const result = await readFileTool.execute({ path: path.join(dir, 'nope.txt') });
      expect(result).toMatch(/^Error reading /);
      expect(result).toContain('does not exist');
    });

    it('includes the absolute path and cwd in ENOENT errors so small models can self-correct', async () => {
      const result = await readFileTool.execute({ path: 'definitely-not-here.txt' });
      expect(result).toContain('Looked at:');
      expect(result).toContain(process.cwd());
    });
  });

  describe('write_file', () => {
    it('writes content to a new file', async () => {
      const filePath = path.join(dir, 'out.txt');
      const result = await writeFileTool.execute({ path: filePath, content: 'hello' });
      expect(result).toMatch(/^Successfully wrote/);
      expect(await fs.readFile(filePath, 'utf-8')).toBe('hello');
    });

    it('creates intermediate parent directories', async () => {
      const filePath = path.join(dir, 'deeply', 'nested', 'out.txt');
      const result = await writeFileTool.execute({ path: filePath, content: 'x' });
      expect(result).toMatch(/^Successfully wrote/);
      expect(await fs.readFile(filePath, 'utf-8')).toBe('x');
    });
  });

  describe('create_directory', () => {
    it('creates a new directory', async () => {
      const target = path.join(dir, 'todo-app');
      const result = await createDirectoryTool.execute({ path: target });
      expect(result).toMatch(/^Successfully created directory/);
      const stat = await fs.stat(target);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates nested directories recursively', async () => {
      const target = path.join(dir, 'a', 'b', 'c');
      const result = await createDirectoryTool.execute({ path: target });
      expect(result).toMatch(/^Successfully created directory/);
      expect((await fs.stat(target)).isDirectory()).toBe(true);
    });

    it('is idempotent when the directory already exists', async () => {
      const target = path.join(dir, 'twice');
      await createDirectoryTool.execute({ path: target });
      const result = await createDirectoryTool.execute({ path: target });
      expect(result).toMatch(/^Successfully created directory/);
    });
  });

  describe('list_files', () => {
    it('returns a newline-joined list of entries', async () => {
      await fs.writeFile(path.join(dir, 'a.txt'), '');
      await fs.writeFile(path.join(dir, 'b.txt'), '');
      const result = await listFilesTool.execute({ path: dir });
      const names = result.split('\n').sort();
      expect(names).toEqual(['a.txt', 'b.txt']);
    });

    it('returns an error string for a missing directory', async () => {
      const result = await listFilesTool.execute({ path: path.join(dir, 'does-not-exist') });
      expect(result).toMatch(/^Error listing /);
      expect(result).toContain('does not exist');
    });
  });

  describe('security gap (known, documented)', () => {
    // These tests pin CURRENT behavior. The fs tools accept arbitrary absolute
    // paths and traversal sequences. Flagged for a follow-up sandboxing pass.
    it('read_file does not sandbox path traversal (intentional pin, follow-up)', async () => {
      const filePath = path.join(dir, 'leak.txt');
      await fs.writeFile(filePath, 'secret');
      const result = await readFileTool.execute({ path: filePath });
      expect(result).toBe('secret');
    });
  });
});
