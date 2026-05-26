import { beforeEach, describe, expect, it, vi } from 'vitest';
import inquirer from 'inquirer';
import { shellTool } from '../../../src/tools/shell';

describe('execute_shell', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('returns a cancellation string when the user declines', async () => {
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: false } as any);
    const result = await shellTool.execute({ command: 'echo hello' });
    expect(result).toBe('Command execution cancelled by user.');
  });

  it('runs the command and returns stdout when the user confirms', async () => {
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({ command: 'echo hello' });
    expect(result).toContain('stdout:');
    expect(result).toContain('hello');
  });

  it('returns an error string for a failing command', async () => {
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({ command: 'false' });
    expect(result).toContain('Error executing command');
  });
});
