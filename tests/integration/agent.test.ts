// NOTE: Agent reads from the GLOBAL tool registry singleton (src/tools/registry.ts:45,
// consumed at src/agent/core.ts:87). We clear it in beforeEach to keep tests isolated.
// Tech debt: making the registry an injected dependency would remove this footgun.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../../src/agent/core';
import { registry, Tool } from '../../src/tools/registry';
import { jsonResponse, MockProvider } from '../helpers/mock-provider';

function stubTool(name: string, fn: (args: any) => Promise<string>, readOnly?: boolean): Tool {
  return {
    definition: {
      name,
      description: `stub ${name}`,
      parameters: { type: 'object', properties: {} },
      ...(readOnly !== undefined ? { readOnly } : {}),
    },
    execute: fn,
  };
}

describe('Agent.chat integration', () => {
  beforeEach(() => {
    registry.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    registry.clear();
    vi.restoreAllMocks();
  });

  it('happy path: calls tool, then terminates when satisfied', async () => {
    let listCalls = 0;
    registry.register(
      stubTool('list_files', async () => {
        listCalls++;
        return 'a.ts\nb.ts';
      }),
    );

    const provider = new MockProvider([
      jsonResponse({
        thought: 'investigating',
        tool_call: { name: 'list_files', arguments: { path: '.' } },
        message: 'listing',
        satisfied: false,
      }),
      jsonResponse({ thought: 'done', tool_call: null, message: 'finished', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5);
    await agent.chat('list the files');

    expect(listCalls).toBe(1);
    expect(provider.callCount).toBe(2);
  });

  it('breaks the loop when the same failing tool call is repeated', async () => {
    registry.register(stubTool('list_files', async () => 'Error: bad path'));

    const failingCall = jsonResponse({
      tool_call: { name: 'list_files', arguments: { path: 'nope' } },
      message: 'try',
      satisfied: false,
    });

    const provider = new MockProvider([
      failingCall,
      failingCall,
      jsonResponse({ tool_call: null, message: 'gave up', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 10);
    await agent.chat('do the thing');

    // Turn 1: failing call executes. Turn 2: same call detected as repetitive,
    // tool NOT executed, guidance pushed, loop continues. Turn 3: satisfied, end.
    expect(provider.callCount).toBe(3);
  });

  it('terminates on stagnation after 3 consecutive no-tool turns (deep-thinking mode)', async () => {
    // Stagnation detection only matters in deep-thinking mode; otherwise a single
    // idle, unsatisfied response terminates the loop immediately via the
    // `else { loop = false }` branch (src/agent/core.ts).
    // Distinct messages so the "repetitive response" guard doesn't fire first.
    const provider = new MockProvider([
      jsonResponse({ tool_call: null, message: 'a', satisfied: false }),
      jsonResponse({ tool_call: null, message: 'b', satisfied: false }),
      jsonResponse({ tool_call: null, message: 'c', satisfied: false }),
    ]);

    const agent = new Agent(provider, 'mock', true, 100);
    await agent.chat('hi');

    expect(provider.callCount).toBe(3);
  });

  it('enforces mandatory investigation for project questions', async () => {
    let listCalls = 0;
    registry.register(
      stubTool('list_files', async () => {
        listCalls++;
        return 'README.md';
      }),
    );

    const provider = new MockProvider([
      jsonResponse({
        thought: 'I already know',
        tool_call: null,
        message: 'It is a CLI tool.',
        satisfied: true,
      }),
      jsonResponse({ tool_call: null, message: 'now answered', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5);
    await agent.chat('what is this project about?');

    // The mandatory-investigation branch must force list_files to run.
    expect(listCalls).toBe(1);
  });

  it('recovers from one invalid JSON response and continues', async () => {
    registry.register(stubTool('list_files', async () => 'a.ts'));

    const provider = new MockProvider([
      'this is not json at all',
      jsonResponse({ tool_call: null, message: 'recovered', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5);
    await agent.chat('hello');

    expect(provider.callCount).toBe(2);
  });

  it('plan mode blocks write_file and reports the block to the model', async () => {
    let writeCalls = 0;
    registry.register(
      stubTool('write_file', async () => {
        writeCalls++;
        return 'wrote';
      }, false),
    );

    const provider = new MockProvider([
      jsonResponse({
        tool_call: { name: 'write_file', arguments: { path: 'x.ts', content: 'noop' } },
        message: 'trying to write',
        satisfied: false,
      }),
      jsonResponse({ tool_call: null, message: 'Plan: do X then Y.', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5, true);
    await agent.chat('add a feature');

    expect(writeCalls).toBe(0);
    // The block error must have been pushed into history so the model can see it.
    const toolMsgs = (provider.calls[1]?.messages ?? []).filter(m => m.role === 'tool');
    expect(toolMsgs.some(m => m.content.includes('blocked in plan mode'))).toBe(true);
  });

  it('plan mode still allows read-only tools', async () => {
    let listCalls = 0;
    registry.register(
      stubTool('list_files', async () => {
        listCalls++;
        return 'a.ts';
      }, true),
    );

    const provider = new MockProvider([
      jsonResponse({
        tool_call: { name: 'list_files', arguments: { path: '.' } },
        message: 'investigating',
        satisfied: false,
      }),
      jsonResponse({ tool_call: null, message: 'Plan: edit a.ts.', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5, true);
    await agent.chat('what should we change?');

    expect(listCalls).toBe(1);
  });

  it('plan mode forces investigation when the model tries to skip straight to satisfied', async () => {
    let listCalls = 0;
    registry.register(
      stubTool('list_files', async () => {
        listCalls++;
        return 'README.md\npackage.json\nsrc';
      }, true),
    );

    const provider = new MockProvider([
      // Model jumps to satisfied with a generic plan and no investigation.
      jsonResponse({ tool_call: null, message: 'Plan: build the thing.', satisfied: true }),
      // After auto-list_files + guidance, model produces a real plan.
      jsonResponse({ tool_call: null, message: 'Plan: edit README.md and src/index.ts.', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5, true);
    await agent.chat('add a feature');

    // The gate must have forced list_files even though the user prompt has no project keywords.
    expect(listCalls).toBe(1);
    expect(provider.callCount).toBe(2);
  });

  it('exitPlanMode allows mutating tools afterward', async () => {
    let writeCalls = 0;
    registry.register(
      stubTool('write_file', async () => {
        writeCalls++;
        return 'wrote';
      }, false),
    );

    const provider = new MockProvider([
      jsonResponse({ tool_call: null, message: 'Plan: write x.ts.', satisfied: true }),
      jsonResponse({
        tool_call: { name: 'write_file', arguments: { path: 'x.ts', content: 'ok' } },
        message: 'executing',
        satisfied: false,
      }),
      jsonResponse({ tool_call: null, message: 'done', satisfied: true }),
    ]);

    const agent = new Agent(provider, 'mock', false, 5, true);
    await agent.chat('plan it');
    expect(agent.isInPlanMode()).toBe(true);

    agent.exitPlanMode();
    expect(agent.isInPlanMode()).toBe(false);

    await agent.chat('go');
    expect(writeCalls).toBe(1);
  });

  it('breaks out at maxThinkingLoops * 2 turns when responses never end', async () => {
    registry.register(stubTool('noop', async () => 'ok'));
    const looping = jsonResponse({
      tool_call: { name: 'noop', arguments: {} },
      message: 'still going',
      satisfied: false,
    });

    const maxLoops = 3;
    const responses = Array.from({ length: maxLoops * 2 + 5 }, () => looping);
    const provider = new MockProvider(responses);

    const agent = new Agent(provider, 'mock', false, maxLoops);
    await agent.chat('go');

    expect(provider.callCount).toBeLessThanOrEqual(maxLoops * 2 + 1);
  });
});
