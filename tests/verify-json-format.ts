import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';

// Register tools
registry.register(listFilesTool);

// Helper to capture console.log
let capturedOutput: string[] = [];
const originalLog = console.log;
console.log = (...args: any[]) => {
  capturedOutput.push(args.join(' '));
  originalLog(...args);
};

class MockProvider implements Provider {
  public calls = 0;
  constructor(private responses: ChatResponse[]) {}
  private currentResponse = 0;

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.calls++;
    return this.responses[this.currentResponse++] || { message: { role: 'assistant', content: '{"thought": "end", "tool_call": null, "message": "No more responses", "satisfied": true}' } };
  }
}

async function runTests() {
  console.log('--- Starting JSON Format Verification Tests ---');

  // Test Case 1: Pure Conversational Response
  console.log('Test Case 1: Pure Conversational Response');
  const mockProvider1 = new MockProvider([
    { message: { role: 'assistant', content: '{ "thought": "Greeting the user.", "tool_call": null, "message": "Hello! How can I help you today?", "satisfied": true }' } }
  ]);
  const agent1 = new Agent(mockProvider1, 'mock-model');
  capturedOutput = [];
  await agent1.chat('Hello');

  const output1 = capturedOutput.join('\n');
  if (output1.includes('Hello! How can I help you today?') && !output1.includes('Executing tool:')) {
    console.log('PASS: Test Case 1');
  } else {
    console.log('FAIL: Test Case 1');
    console.log('Output was:', output1);
    process.exit(1);
  }

  // Test Case 2: Tool Invocation
  console.log('Test Case 2: Tool Invocation');
  const mockProvider2 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: '{ "thought": "I need to list files in the src directory.", "tool_call": { "name": "list_files", "arguments": { "path": "src" } }, "message": "Checking the src directory...", "satisfied": false }' 
      }
    },
    {
      message: {
        role: 'assistant',
        content: '{ "thought": "I see the files.", "tool_call": null, "message": "I found the files in src.", "satisfied": true }'
      }
    }
  ]);
  const agent2 = new Agent(mockProvider2, 'mock-model');
  capturedOutput = [];
  await agent2.chat('List files in src');

  const output2 = capturedOutput.join('\n');
  if (output2.includes('Executing tool: list_files') && output2.includes('Arguments: {"path":"src"}') && output2.includes('I found the files in src.')) {
    console.log('PASS: Test Case 2');
  } else {
    console.log('FAIL: Test Case 2');
    console.log('Output was:', output2);
    process.exit(1);
  }

  // Test Case 3: Parsing Robustness (Mixed Content)
  console.log('Test Case 3: Parsing Robustness (Mixed Content)');
  const mockProvider3 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: 'Certainly! Here is the response:\n\n{ "thought": "Listing files", "tool_call": { "name": "list_files", "arguments": { "path": "." } }, "message": "Listing...", "satisfied": false }' 
      }
    },
    {
        message: {
          role: 'assistant',
          content: '{ "thought": "Done", "tool_call": null, "message": "Finished listing.", "satisfied": true }'
        }
    }
  ]);
  const agent3 = new Agent(mockProvider3, 'mock-model');
  capturedOutput = [];
  await agent3.chat('List files');

  const output3 = capturedOutput.join('\n');
  if (output3.includes('Executing tool: list_files') && output3.includes('Finished listing.')) {
    console.log('PASS: Test Case 3');
  } else {
    console.log('FAIL: Test Case 3');
    console.log('Output was:', output3);
    process.exit(1);
  }

  // Test Case 4: Satisfaction-based Termination
  console.log('Test Case 4: Satisfaction-based Termination');
  const mockProvider4 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: '{ "thought": "First turn", "tool_call": null, "message": "Wait...", "satisfied": false }' 
      }
    },
    {
        message: {
          role: 'assistant',
          content: '{ "thought": "Second turn", "tool_call": null, "message": "Ready.", "satisfied": true }'
        }
    }
  ]);
  const agent4 = new Agent(mockProvider4, 'mock-model', true, 5); // deepThinking=true
  capturedOutput = [];
  await agent4.chat('Are you ready?');

  if (mockProvider4.calls === 2) {
    console.log('PASS: Test Case 4');
  } else {
    console.log('FAIL: Test Case 4');
    console.log('Provider calls:', mockProvider4.calls);
    process.exit(1);
  }

  console.log('--- All JSON Format Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
