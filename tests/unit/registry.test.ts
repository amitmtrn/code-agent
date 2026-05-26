import { describe, expect, it } from 'vitest';
import { Tool, ToolRegistry } from '../../src/tools/registry';

function stubTool(name: string, fn: (args: any) => Promise<string>): Tool {
  return {
    definition: {
      name,
      description: `stub ${name}`,
      parameters: { type: 'object', properties: {} },
    },
    execute: fn,
  };
}

describe('ToolRegistry', () => {
  it('register then getTool returns the same tool instance', () => {
    const reg = new ToolRegistry();
    const tool = stubTool('foo', async () => 'ok');
    reg.register(tool);
    expect(reg.getTool('foo')).toBe(tool);
  });

  it('getDefinitions lists all registered tools', () => {
    const reg = new ToolRegistry();
    reg.register(stubTool('a', async () => 'a'));
    reg.register(stubTool('b', async () => 'b'));
    const names = reg.getDefinitions().map(d => d.name);
    expect(names).toEqual(['a', 'b']);
  });

  it('execute on an unknown tool throws "Tool X not found"', async () => {
    const reg = new ToolRegistry();
    await expect(reg.execute('missing', '{}')).rejects.toThrow('Tool missing not found');
  });

  it('execute with malformed JSON args throws and includes the bad payload', async () => {
    const reg = new ToolRegistry();
    reg.register(stubTool('foo', async () => 'never'));
    await expect(reg.execute('foo', '{not json}')).rejects.toThrow(/Failed to parse arguments for tool foo/);
  });

  it('execute happy-path parses args and forwards them to the tool', async () => {
    const reg = new ToolRegistry();
    let received: any = null;
    reg.register(
      stubTool('echo', async args => {
        received = args;
        return `got ${args.x}`;
      }),
    );
    const result = await reg.execute('echo', JSON.stringify({ x: 42 }));
    expect(received).toEqual({ x: 42 });
    expect(result).toBe('got 42');
  });
});
