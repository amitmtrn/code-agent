import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';
import chalk from 'chalk';

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
    return this.responses[this.currentResponse++] || { message: { role: 'assistant', content: '<SATISFIED>' } };
  }
}

async function runTests() {
  console.log('--- Starting Tool Fallback Verification Tests ---');

  // Setup: Register tools
  registry.register(listFilesTool);

  // 1. Action - Manual Tool Recognition & Display Hygiene
  // Provide a mocked assistant response with manual tool call tags
  const manualToolResponse = 'Let me check that for you. <tool_call>{"name": "list_files", "arguments": {"path": "."}}</tool_call>';
  const mockProvider = new MockProvider([
    {
      message: { role: 'assistant', content: manualToolResponse }
    },
    {
      message: { role: 'assistant', content: 'I found the files. <SATISFIED>' }
    }
  ]);

  const agent = new Agent(mockProvider, 'mock-model');
  capturedOutput = [];
  
  console.log('Running chat for manual tool call test...');
  await agent.chat('list files');

  const fullOutput = capturedOutput.join('\n');
  
  // Assertion - Manual Tool Recognition & Execution
  const hasExecuting = fullOutput.includes('Executing tool: list_files');
  const hasResult = fullOutput.includes('CLAUDE.md') || fullOutput.includes('Dockerfile') || fullOutput.includes('dist');
  
  if (hasExecuting && hasResult) {
    console.log('PASS: Manual Tool Recognition (agent parsed and executed manual tool call)');
  } else {
    console.log('FAIL: Manual Tool Recognition');
    console.log('Executing:', hasExecuting, 'Result:', hasResult);
    process.exit(1);
  }

  // Assertion - Display Hygiene
  const hasRawTags = fullOutput.includes('<tool_call>') || fullOutput.includes('</tool_call>');
  const hasNaturalLanguage = fullOutput.includes('Let me check that for you.');
  
  if (!hasRawTags && hasNaturalLanguage) {
    console.log('PASS: Display Hygiene (raw tags stripped from output)');
  } else {
    console.log('FAIL: Display Hygiene');
    console.log('Has raw tags:', hasRawTags, 'Has natural language:', hasNaturalLanguage);
    process.exit(1);
  }

  // Assertion - Loop Completion
  const hasFinalSummary = fullOutput.includes('I found the files.');
  if (hasFinalSummary && mockProvider.calls === 2) {
    console.log('PASS: Loop Completion (agent processed tool result and provided final answer)');
  } else {
    console.log('FAIL: Loop Completion');
    console.log('Has final summary:', hasFinalSummary, 'Provider calls:', mockProvider.calls);
    process.exit(1);
  }

  // 2. Assertion - Fallback Invariant (Still works if provider provides native tool calls)
  const nativeToolProvider = new MockProvider([
    {
      message: { role: 'assistant', content: 'Checking natively.' },
      toolCalls: [
        {
          id: 'native_call',
          type: 'function',
          function: {
            name: 'list_files',
            arguments: JSON.stringify({ path: '.' }),
          },
        },
      ],
    },
    {
      message: { role: 'assistant', content: 'Native check complete. <SATISFIED>' }
    }
  ]);

  const agentNative = new Agent(nativeToolProvider, 'mock-model');
  capturedOutput = [];
  await agentNative.chat('list files natively');

  const nativeOutput = capturedOutput.join('\n');
  if (nativeOutput.includes('Executing tool: list_files') && nativeOutput.includes('Native check complete.')) {
    console.log('PASS: Fallback Invariant (native tool calls still work)');
  } else {
    console.log('FAIL: Fallback Invariant');
    process.exit(1);
  }

  console.log('--- All Tool Fallback Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
