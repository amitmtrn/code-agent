// Golden-prompt regression suite. Each fixture defines a prompt and a script of
// model responses; we drive Agent.chat() through the script and assert the
// observed tool-call sequence matches expectedToolSequence.
//
// NOTE: This uses the global registry singleton — see tests/integration/agent.test.ts
// for the same caveat.

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../../src/agent/core';
import { registry, Tool } from '../../src/tools/registry';
import { MockProvider } from '../helpers/mock-provider';

interface GoldenFixture {
  name: string;
  description: string;
  prompt: string;
  deepThinking?: boolean;
  scriptedResponses: string[];
  stubTools: Record<string, string>;
  expectedToolSequence: string[];
  expectFinalSatisfied: boolean;
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixtures(): GoldenFixture[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8')) as GoldenFixture);
}

function stubTool(name: string, result: string, observed: string[]): Tool {
  return {
    definition: { name, description: `stub ${name}`, parameters: { type: 'object', properties: {} } },
    execute: async () => {
      observed.push(name);
      return result;
    },
  };
}

describe('golden prompts', () => {
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

  for (const fixture of loadFixtures()) {
    it(`${fixture.name}: ${fixture.description}`, async () => {
      const observed: string[] = [];

      for (const [toolName, toolResult] of Object.entries(fixture.stubTools)) {
        registry.register(stubTool(toolName, toolResult, observed));
      }

      const provider = new MockProvider(fixture.scriptedResponses);
      const agent = new Agent(provider, 'mock', fixture.deepThinking ?? false, 10);
      await agent.chat(fixture.prompt);

      expect(observed).toEqual(fixture.expectedToolSequence);
    });
  }
});
