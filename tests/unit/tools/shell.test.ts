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

  it('refuses a bare foreground server like `npm start`', async () => {
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({ command: 'npm start' });
    expect(result).toContain('refused to run');
    expect(result).toContain('foreground server');
  });

  it('allows the canonical verify-after-background pattern with mid-command `&`', async () => {
    // `nohup … & sleep 1 && curl …` puts the server in the background AND probes
    // it in the same call. The `&` is mid-command, not trailing. Must not refuse.
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({
      command: 'nohup npm start > /tmp/server.log 2>&1 & sleep 0 && echo PROBED',
    });
    expect(result).not.toContain('refused to run');
  });

  it('does not mistake `2>&1` redirect for a backgrounding `&`', async () => {
    // The `&1` in `2>&1` is part of a redirect, not a backgrounding operator.
    // A bare `npm start > log 2>&1` (no real `&`) must still be refused.
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({ command: 'npm start > /tmp/log 2>&1' });
    expect(result).toContain('refused to run');
  });

  it('rewrites the suggestion to use `sh -c` when the command leads with `cd`', async () => {
    // `nohup cd subdir && cmd` is broken (cd is a builtin). The error hint
    // must point the agent at the correct `nohup sh -c '...'` form instead.
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({ command: 'cd backend && npm start' });
    expect(result).toContain('refused to run');
    expect(result).toContain("sh -c 'cd backend && npm start'");
  });

  it('allows a `timeout`-prefixed run of a server command', async () => {
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ confirm: true } as any);
    const result = await shellTool.execute({ command: 'timeout 1 npm start' });
    expect(result).not.toContain('refused to run');
  });
});
