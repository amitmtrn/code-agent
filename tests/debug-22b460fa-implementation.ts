import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';

// Register tools
registry.register(listFilesTool);

class MockProvider implements Provider {
  public calls: ChatOptions[] = [];
  constructor(private responses: ChatResponse[]) {}
  private currentResponse = 0;

  async chat(options: ChatOptions): Promise<ChatResponse> {
    // Clone messages to avoid mutations affecting recorded history
    this.calls.push({ ...options, messages: [...options.messages] });
    const response = this.responses[this.currentResponse++];
    if (!response) {
       return { message: { role: 'assistant', content: '{"thought": "end", "tool_call": null, "message": "No more responses", "satisfied": true}' } };
    }
    return response;
  }
}

async function runTests() {
  console.log('--- STARTING TEST PLAN FOR DEBUG-22B460FA ---');

  // 1. Verify JSON Tool Call Parsing
  console.log('Test 1: JSON Tool Call Parsing');
  const mockProvider1 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: '{ "thought": "Checking files...", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "message": "I will list the files.", "satisfied": false }' 
      }
    },
    {
      message: {
        role: 'assistant',
        content: '{ "thought": "Task complete.", "tool_call": null, "message": "Here is your answer.", "satisfied": true }'
      }
    }
  ]);
  const agent1 = new Agent(mockProvider1, 'mock-model');
  await agent1.chat('list files in current directory');
  
  if (mockProvider1.calls.length === 2) {
    console.log('PASS: Tool call executed and result passed back');
    
    // Check history for tool output
    const history = mockProvider1.calls[1].messages;
    const toolResultMessage = history.find(m => m.role === 'user' && m.content.includes('CLAUDE.md'));
    if (toolResultMessage) {
      console.log('PASS: Tool output contains expected files (CLAUDE.md)');
    } else {
      console.log('FAIL: Tool output does not contain expected files. History:', JSON.stringify(history, null, 2));
      process.exit(1);
    }
  } else {
    console.log('FAIL: Expected 2 provider calls, got ' + mockProvider1.calls.length);
    process.exit(1);
  }

  // 2. Verify XML Rejection
  console.log('Test 2: XML Rejection');
  const mockProvider2 = new MockProvider([
    { message: { role: 'assistant', content: 'I will use a tool. <tool_call>{"name": "list_files", "arguments": {"path": "."}}</tool_call>' } },
    { message: { role: 'assistant', content: '{ "thought": "Correcting format", "tool_call": null, "message": "Corrected", "satisfied": true }' } }
  ]);
  const agent2 = new Agent(mockProvider2, 'mock-model');
  await agent2.chat('list files');
  
  const secondUserMessage = mockProvider2.calls[1].messages[mockProvider2.calls[1].messages.length - 1];
  if (secondUserMessage.role === 'user' && secondUserMessage.content.includes('INVALID FORMAT')) {
    console.log('PASS: Agent rejected XML and requested JSON with explicit error');
  } else {
    console.log('FAIL: Agent did not reject XML correctly');
    process.exit(1);
  }

  // 3. Verify JSON Repair Logic
  console.log('Test 3: JSON Repair Logic');
  const mockProvider3 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Reasoning...", "message": "Hello" ' } },
    { message: { role: 'assistant', content: '{"thought": "Done", "tool_call": null, "message": "OK", "satisfied": true}' } }
  ]);
  const agent3 = new Agent(mockProvider3, 'mock-model');
  
  let capturedOutput = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };
  
  await agent3.chat('user request');
  console.log = originalLog;

  if (capturedOutput.includes('Reasoning...') && capturedOutput.includes('Hello')) {
    console.log('PASS: Successfully repaired and parsed JSON with missing brace');
  } else {
    console.log('FAIL: Failed to repair JSON. Output: ' + capturedOutput);
    process.exit(1);
  }

  // 4. Verify Workflow Termination
  console.log('Test 4: Workflow Termination');
  const mockProvider4 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Task complete.", "tool_call": null, "message": "Here is your answer.", "satisfied": true}' } }
  ]);
  const agent4 = new Agent(mockProvider4, 'mock-model');
  
  capturedOutput = '';
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };
  
  await agent4.chat('final check');
  console.log = originalLog;

  if (capturedOutput.includes('Here is your answer.')) {
    console.log('PASS: Agent loop terminated and message displayed correctly');
  } else {
    console.log('FAIL: Workflow termination or message display failed');
    process.exit(1);
  }

  console.log('--- ALL TESTS PASSED ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
