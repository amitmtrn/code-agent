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
    return this.responses[this.currentResponse++] || { message: { role: 'assistant', content: '{"thought": "end", "tool_call": null, "message": "No more responses", "satisfied": true}' } };
  }
}

async function runTests() {
  console.log('--- Starting JSON Format Migration Tests (PHASE 7) ---');

  // 1. System Prompt Verification
  console.log('1. System Prompt Verification');
  const mockProvider1 = new MockProvider([]);
  const agent1 = new Agent(mockProvider1, 'mock-model');
  // Accessing private messages for verification
  const messages = (agent1 as any).messages;
  const systemMessage = messages.find((m: any) => m.role === 'system');
  
  const hasSchema = systemMessage.content.includes('"thought":');
  const hasNoXmlWarning = systemMessage.content.includes('DO NOT use any XML tags like <tool_call> or <thinking>');
  
  if (hasSchema && hasNoXmlWarning) {
    console.log('PASS: System Prompt contains JSON schema and XML warning');
  } else {
    console.log('FAIL: System Prompt is missing required instructions');
    console.log('Content:', systemMessage.content);
    process.exit(1);
  }

  // 2. JSON Parsing with Mixed Content
  console.log('2. JSON Parsing with Mixed Content');
  const mixedContent = 'Here is what I found:\n\n{ "thought": "Extracting info", "tool_call": null, "message": "The result is 42", "satisfied": true }\n\nHope this helps!';
  const mockProvider2 = new MockProvider([{ message: { role: 'assistant', content: mixedContent } }]);
  const agent2 = new Agent(mockProvider2, 'mock-model');
  
  let capturedMessage = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    const s = args.join(' ');
    if (s.includes('Assistant:')) capturedMessage = s;
    originalLog(...args);
  };

  await agent2.chat('What is the answer?');
  console.log = originalLog;

  if (capturedMessage.includes('The result is 42')) {
    console.log('PASS: Successfully parsed JSON from mixed content');
  } else {
    console.log('FAIL: Failed to extract message from mixed content');
    process.exit(1);
  }

  // 3. Integration Test: Tool Call Execution
  console.log('3. Integration Test: Tool Call Execution');
  const mockProvider3 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: '{ "thought": "I need to list files.", "tool_call": { "name": "list_files", "arguments": { "path": "." } }, "message": "Listing files...", "satisfied": false }' 
      }
    },
    {
      message: {
        role: 'assistant',
        content: '{ "thought": "Done", "tool_call": null, "message": "Finished.", "satisfied": true }'
      }
    }
  ]);
  const agent3 = new Agent(mockProvider3, 'mock-model');
  await agent3.chat('List files');
  
  if (mockProvider3.calls.length === 2) {
    console.log('PASS: Tool call executed and result passed back');
  } else {
    console.log('FAIL: Expected 2 provider calls, got ' + mockProvider3.calls.length);
    process.exit(1);
  }

  // 4. Negative Test: XML Rejection
  console.log('4. Negative Test: XML Rejection');
  const mockProvider4 = new MockProvider([
    { message: { role: 'assistant', content: '<tool_call>{"name": "list_files", "arguments": {"path": "."}}</tool_call>' } },
    { message: { role: 'assistant', content: '{ "thought": "Correcting format", "tool_call": null, "message": "Corrected", "satisfied": true }' } }
  ]);
  const agent4 = new Agent(mockProvider4, 'mock-model');
  await agent4.chat('List files');
  
  // Check if second message from user was "INVALID FORMAT"
  const secondUserMessage = mockProvider4.calls[1].messages[mockProvider4.calls[1].messages.length - 1];
  if (secondUserMessage.role === 'user' && secondUserMessage.content.includes('INVALID FORMAT')) {
    console.log('PASS: Agent rejected XML and requested JSON');
  } else {
    console.log('FAIL: Agent did not reject XML correctly');
    console.log('Second user message:', JSON.stringify(secondUserMessage));
    process.exit(1);
  }

  console.log('--- All JSON Migration Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
