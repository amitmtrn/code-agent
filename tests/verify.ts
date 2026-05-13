import * as fs from 'fs/promises';
import * as path from 'path';
import { readFileTool, writeFileTool, listFilesTool } from '../src/tools/fs';
import { registry, ToolRegistry, Tool } from '../src/tools/registry';
import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';

async function testTools() {
  console.log('--- Testing Tools ---');
  const testDir = path.join(process.cwd(), 'test-temp');
  const testFile = path.join(testDir, 'test.txt');
  const content = 'Hello World';

  try {
    // 1. write_file
    const writeResult = await writeFileTool.execute({ path: testFile, content });
    if (writeResult.includes('Successfully wrote')) {
      console.log('PASS: write_file tool');
    } else {
      console.error('FAIL: write_file tool', writeResult);
      process.exit(1);
    }

    // 2. read_file
    const readResult = await readFileTool.execute({ path: testFile });
    if (readResult === content) {
      console.log('PASS: read_file tool');
    } else {
      console.error('FAIL: read_file tool. Expected:', content, 'Got:', readResult);
      process.exit(1);
    }

    // 3. list_files
    const listResult = await listFilesTool.execute({ path: testDir });
    if (listResult.includes('test.txt')) {
      console.log('PASS: list_files tool');
    } else {
      console.error('FAIL: list_files tool. Result:', listResult);
      process.exit(1);
    }
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

async function testRegistry() {
  console.log('--- Testing Registry ---');
  const localRegistry = new ToolRegistry();
  const dummyTool: Tool = {
    definition: {
      name: 'dummy',
      description: 'A dummy tool',
      parameters: { type: 'object', properties: { arg: { type: 'string' } } },
    },
    async execute({ arg }) {
      return `received: ${arg}`;
    },
  };
  localRegistry.register(dummyTool);

  // 1. Valid execution
  const result = await localRegistry.execute('dummy', JSON.stringify({ arg: 'hello' }));
  if (result === 'received: hello') {
    console.log('PASS: registry valid execution');
  } else {
    console.error('FAIL: registry valid execution. Got:', result);
    process.exit(1);
  }

  // 2. Invalid JSON
  try {
    await localRegistry.execute('dummy', '{ invalid json }');
    console.error('FAIL: registry invalid JSON did not throw');
    process.exit(1);
  } catch (e: any) {
    if (e.message.includes('Failed to parse arguments')) {
      console.log('PASS: registry invalid JSON throw');
    } else {
      console.error('FAIL: registry invalid JSON threw wrong error', e.message);
      process.exit(1);
    }
  }
}

class MockProvider implements Provider {
  private turn = 0;
  public calls = 0;

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.calls++;
    this.turn++;
    if (this.turn === 1) {
      return {
        message: { 
          role: 'assistant', 
          content: JSON.stringify({
            thought: "I will write a file to test the loop.",
            tool_call: { name: 'write_file', arguments: { path: 'test-temp/loop.txt', content: 'loop content' } },
            message: "Writing the file now.",
            satisfied: false
          })
        },
      };
    } else {
      return {
        message: { 
          role: 'assistant', 
          content: JSON.stringify({
            thought: "The file has been written. I am done.",
            tool_call: null,
            message: "I have finished writing the file.",
            satisfied: true
          })
        },
      };
    }
  }
}

async function testAgentLoop() {
  console.log('--- Testing Agent Loop ---');
  const mockProvider = new MockProvider();
  const agent = new Agent(mockProvider, 'mock-model');
  
  // Register necessary tools in the global registry since Agent uses it
  registry.register(writeFileTool);

  const testDir = path.join(process.cwd(), 'test-temp');
  await fs.mkdir(testDir, { recursive: true });

  try {
    await agent.chat('Write a file please');

    if (mockProvider.calls === 2) {
      console.log('PASS: agent loop iteration count');
    } else {
      console.error('FAIL: agent loop iteration count. Expected 2, Got:', mockProvider.calls);
      process.exit(1);
    }

    const fileContent = await fs.readFile(path.join(testDir, 'loop.txt'), 'utf-8');
    if (fileContent === 'loop content') {
      console.log('PASS: agent loop side effect (file written)');
    } else {
      console.error('FAIL: agent loop side effect. Got:', fileContent);
      process.exit(1);
    }
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

async function runAll() {
  await testTools();
  await testRegistry();
  await testAgentLoop();
}

runAll().catch(e => {
  console.error('Unexpected error during tests:', e);
  process.exit(1);
});
