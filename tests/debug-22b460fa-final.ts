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
    this.calls.push({ ...options, messages: [...options.messages] });
    const response = this.responses[this.currentResponse++];
    if (!response) {
       return { message: { role: 'assistant', content: '{"thought": "end", "tool_call": null, "message": "No more responses", "satisfied": true}' } };
    }
    return response;
  }
}

async function runTests() {
  console.log('--- Starting Approved Test Plan Assertions ---');

  // 1. Verify JSON Tool Call Parsing
  console.log('Checking: JSON Tool Call Parsing');
  const mockProvider1 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: '{ "thought": "Checking files...", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "message": "", "satisfied": false }' 
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
  
  const hasToolCall = mockProvider1.calls.length >= 1;
  const toolResultInHistory = mockProvider1.calls[1]?.messages.some(m => m.role === 'tool' && (m.content.includes('CLAUDE.md') || m.content.includes('package.json')));
  
  if (hasToolCall && toolResultInHistory) {
    console.log('PASS: JSON Tool Call Parsing');
  } else {
    console.log('FAIL: JSON Tool Call Parsing');
    console.log('Calls:', mockProvider1.calls.length);
    console.log('Messages in call 1:', JSON.stringify(mockProvider1.calls[1]?.messages, null, 2));
    process.exit(1);
  }

  // 2. Verify XML Rejection
  console.log('Checking: XML Rejection');
  const mockProvider2 = new MockProvider([
    { message: { role: 'assistant', content: 'I will use a tool. <tool_call>{"name": "list_files"}</tool_call>' } },
    { message: { role: 'assistant', content: '{ "thought": "Correcting format", "tool_call": null, "message": "Corrected", "satisfied": true }' } }
  ]);
  const agent2 = new Agent(mockProvider2, 'mock-model');
  await agent2.chat('Send any user request');
  
  const secondUserMessage = mockProvider2.calls[1]?.messages[mockProvider2.calls[1].messages.length - 1];
  if (secondUserMessage?.role === 'user' && secondUserMessage.content.includes('INVALID FORMAT') && secondUserMessage.content.includes('JSON')) {
    console.log('PASS: XML Rejection');
  } else {
    console.log('FAIL: XML Rejection');
    process.exit(1);
  }

  // 3. Verify JSON Repair Logic
  console.log('Checking: JSON Repair Logic');
  const mockProvider3 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Reasoning...", "message": "Hello" ' } } // missing brace
  ]);
  const agent3 = new Agent(mockProvider3, 'mock-model');
  
  let capturedOutput = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };
  
  await agent3.chat('Repair this');
  console.log = originalLog;

  if (capturedOutput.includes('Hello')) {
    console.log('PASS: JSON Repair Logic');
  } else {
    console.log('FAIL: JSON Repair Logic');
    process.exit(1);
  }

  // 4. Verify Workflow Termination
  console.log('Checking: Workflow Termination');
  const mockProvider4 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Task complete.", "tool_call": null, "message": "Here is your answer.", "satisfied": true}' } }
  ]);
  const agent4 = new Agent(mockProvider4, 'mock-model');
  
  capturedOutput = '';
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };
  
  await agent4.chat('Terminate');
  console.log = originalLog;

  if (capturedOutput.includes('Here is your answer.') && mockProvider4.calls.length === 1) {
    console.log('PASS: Workflow Termination');
  } else {
    console.log('FAIL: Workflow Termination');
    process.exit(1);
  }

  console.log('--- All Plan Assertions Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
