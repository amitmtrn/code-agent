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
    return this.responses[this.currentResponse++] || { message: { role: 'assistant', content: '{"thought": "done", "tool_call": null, "message": "Done", "satisfied": true}' } };
  }
}

async function runTests() {
  console.log('--- Starting Tool Fallback Verification Tests ---');

  // Setup: Register tools
  registry.register(listFilesTool);

  // 1. Action - Manual Tool Recognition (JSON-based)
  // Provide a mocked assistant response with JSON tool call
  const jsonToolResponse = '{"thought": "I need to list files", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "message": "Let me check that for you.", "satisfied": false}';
  const mockProvider = new MockProvider([
    {
      message: { role: 'assistant', content: jsonToolResponse }
    },
    {
      message: { role: 'assistant', content: '{"thought": "I found the files", "tool_call": null, "message": "I found the files.", "satisfied": true}' }
    }
  ]);

  const agent = new Agent(mockProvider, 'mock-model');
  capturedOutput = [];
  
  console.log('Running chat for JSON tool call test...');
  await agent.chat('list files');

  const fullOutput = capturedOutput.join('\n');
  
  // Assertion - Tool Recognition & Execution
  const hasExecuting = fullOutput.includes('Executing tool: list_files');
  const hasResult = fullOutput.includes('CLAUDE.md') || fullOutput.includes('Dockerfile') || fullOutput.includes('dist');
  
  if (hasExecuting && hasResult) {
    console.log('PASS: Tool Recognition (agent parsed and executed JSON tool call)');
  } else {
    console.log('FAIL: Tool Recognition');
    console.log('Executing:', hasExecuting, 'Result:', hasResult);
    process.exit(1);
  }

  // Assertion - Display Hygiene (should only show message field)
  const hasRawJson = fullOutput.includes('"tool_call"');
  const hasNaturalLanguage = fullOutput.includes('Let me check that for you.');
  
  if (!hasRawJson && hasNaturalLanguage) {
    console.log('PASS: Display Hygiene (raw JSON not shown in user-facing output)');
  } else {
    console.log('FAIL: Display Hygiene');
    console.log('Has raw JSON:', hasRawJson, 'Has natural language:', hasNaturalLanguage);
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

  console.log('--- All Tool Fallback Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
