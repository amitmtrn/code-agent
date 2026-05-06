import { listFilesTool } from '../src/tools/fs';
import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import * as path from 'path';

// Helper to capture console.log
let capturedOutput: string[] = [];
const originalLog = console.log;
console.log = (...args: any[]) => {
  capturedOutput.push(args.join(' '));
  originalLog(...args);
};

class MockProvider implements Provider {
  constructor(private responses: ChatResponse[]) {}
  private currentResponse = 0;
  public calls = 0;

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.calls++;
    return this.responses[this.currentResponse++] || { message: { role: 'assistant', content: 'No more responses' } };
  }
}

async function runTests() {
  console.log('--- Starting Fix Verification Tests ---');

  // 1. Tool Verification
  try {
    const listResult = await listFilesTool.execute({ path: '.' });
    if (listResult.includes('package.json') && listResult.includes('src')) {
      console.log('PASS: Tool Verification (list_files correctly lists files)');
    } else {
      console.log('FAIL: Tool Verification (list_files output unexpected)');
      console.log('Output was:', listResult);
      process.exit(1);
    }
  } catch (e: any) {
    console.log('FAIL: Tool Verification (threw error)', e.message);
    process.exit(1);
  }

  // 2. Conversational Response Test
  const mockProvider1 = new MockProvider([
    { message: { role: 'assistant', content: 'Hello there! How can I help you today?' } }
  ]);
  const agent1 = new Agent(mockProvider1, 'mock-model');
  capturedOutput = [];
  await agent1.chat('hi');

  const output1 = capturedOutput.join('\n');
  if (output1.includes('Hello there!') && !output1.includes('Executing tool:')) {
    console.log('PASS: Conversational Response Test (agent responds naturally without tools)');
  } else {
    console.log('FAIL: Conversational Response Test');
    console.log('Output was:', output1);
    process.exit(1);
  }

  // 3. Tool Integration Test (list_files)
  registry.register(listFilesTool);
  const mockProvider2 = new MockProvider([
    {
      message: { role: 'assistant', content: 'Let me check the files for you.' },
      toolCalls: [
        {
          id: 'call_ls',
          type: 'function',
          function: {
            name: 'list_files',
            arguments: JSON.stringify({ path: '.' }),
          },
        },
      ],
    },
    {
      message: { role: 'assistant', content: 'I found several files in the directory.' },
    }
  ]);
  const agent2 = new Agent(mockProvider2, 'mock-model');
  capturedOutput = [];
  await agent2.chat('list files');

  const output2 = capturedOutput.join('\n');
  const hasThinking = output2.includes('Thinking...');
  const hasExecuting = output2.includes('Executing tool: list_files');
  const hasResult = output2.includes('package.json');
  const hasSummary = output2.includes('I found several files');

  if (hasThinking && hasExecuting && hasResult && hasSummary) {
    console.log('PASS: Tool Integration Test (agent executes tool and summarizes)');
  } else {
    console.log('FAIL: Tool Integration Test');
    console.log('Thinking:', hasThinking, 'Executing:', hasExecuting, 'Result:', hasResult, 'Summary:', hasSummary);
    console.log('Output was:', output2);
    process.exit(1);
  }

  // 4. System Prompt Validation
  const agent3 = new Agent(mockProvider1, 'mock-model');
  // Accessing private messages via type casting to any
  const systemMessage = (agent3 as any).messages.find((m: any) => m.role === 'system');
  if (systemMessage && systemMessage.content.includes('NEVER output raw JSON function call syntax')) {
    console.log('PASS: System Prompt Validation (negative constraint present)');
  } else {
    console.log('FAIL: System Prompt Validation (constraint missing or message not found)');
    process.exit(1);
  }

  console.log('--- All Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
