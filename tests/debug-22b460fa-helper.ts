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
  console.log('--- Starting JSON Format Migration Tests ---');

  // 1. Valid JSON Tool Call
  console.log('1. Valid JSON Tool Call');
  const mockProvider1 = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: '{ "thought": "Searching files", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "message": "I will list the files.", "satisfied": false }' 
      }
    },
    {
      message: {
        role: 'assistant',
        content: '{ "thought": "Done", "tool_call": null, "message": "Finished.", "satisfied": true }'
      }
    }
  ]);
  const agent1 = new Agent(mockProvider1, 'mock-model');
  await agent1.chat('List files');
  
  if (mockProvider1.calls.length === 2) {
    console.log('PASS: Tool call executed and result passed back');
  } else {
    console.log('FAIL: Expected 2 provider calls, got ' + mockProvider1.calls.length);
    process.exit(1);
  }

  // 2. XML Rejection
  console.log('2. XML Rejection');
  const mockProvider2 = new MockProvider([
    { message: { role: 'assistant', content: 'I will use a tool. <tool_call>{"name": "list_files"}</tool_call>' } },
    { message: { role: 'assistant', content: '{ "thought": "Correcting format", "tool_call": null, "message": "Corrected", "satisfied": true }' } }
  ]);
  const agent2 = new Agent(mockProvider2, 'mock-model');
  await agent2.chat('List files');
  
  const secondUserMessage = mockProvider2.calls[1].messages[mockProvider2.calls[1].messages.length - 1];
  if (secondUserMessage.role === 'user' && secondUserMessage.content.includes('INVALID FORMAT')) {
    console.log('PASS: Agent rejected XML and requested JSON');
  } else {
    console.log('FAIL: Agent did not reject XML correctly');
    process.exit(1);
  }

  // 3. JSON Repair (Missing brace)
  console.log('3. JSON Repair (Missing brace)');
  const mockProvider3 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Reasoning...", "message": "Answer is 42", "satisfied": true' } }
  ]);
  const agent3 = new Agent(mockProvider3, 'mock-model');
  
  let capturedOutput = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };
  
  await agent3.chat('What is the answer?');
  console.log = originalLog;

  if (capturedOutput.includes('Answer is 42')) {
    console.log('PASS: Successfully repaired and parsed JSON with missing brace');
  } else {
    console.log('FAIL: Failed to repair JSON');
    process.exit(1);
  }

  // 4. Stagnation Detection (3 turns without tool calls)
  console.log('4. Stagnation Detection (3 turns without tool calls)');
  const mockProvider4 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Thinking...", "tool_call": null, "message": "Turn 1", "satisfied": false}' } },
    { message: { role: 'assistant', content: '{"thought": "Thinking...", "tool_call": null, "message": "Turn 2", "satisfied": false}' } },
    { message: { role: 'assistant', content: '{"thought": "Thinking...", "tool_call": null, "message": "Turn 3", "satisfied": false}' } },
    { message: { role: 'assistant', content: '{"thought": "Thinking...", "tool_call": null, "message": "Turn 4", "satisfied": false}' } }
  ]);
  // deepThinking must be true to trigger more turns if not satisfied
  const agent4 = new Agent(mockProvider4, 'mock-model', true, 5);
  await agent4.chat('Keep thinking');
  
  if (mockProvider4.calls.length === 3) {
    console.log('PASS: Agent terminated after 3 turns without tool calls');
  } else {
    console.log('FAIL: Agent failed to detect stagnation. Calls: ' + mockProvider4.calls.length);
    process.exit(1);
  }

  // 5. Display Hygiene
  console.log('5. Display Hygiene');
  const mockProvider5 = new MockProvider([
    { message: { role: 'assistant', content: '{"thought": "Confidential thought", "tool_call": null, "message": "Public message", "satisfied": true}' } }
  ]);
  const agent5 = new Agent(mockProvider5, 'mock-model');
  
  capturedOutput = '';
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };
  
  await agent5.chat('Say something');
  console.log = originalLog;

  const containsRawJson = capturedOutput.includes('{"thought":');
  const containsMessage = capturedOutput.includes('Public message');
  const containsThought = capturedOutput.includes('Confidential thought');

  if (!containsRawJson && containsMessage && containsThought) {
    console.log('PASS: Output shows message and thought but hides raw JSON');
  } else {
    console.log('FAIL: Display hygiene check failed');
    console.log('Contains Raw JSON:', containsRawJson);
    console.log('Contains Message:', containsMessage);
    console.log('Contains Thought:', containsThought);
    process.exit(1);
  }

  console.log('--- All JSON Migration Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed with error:', e);
  process.exit(1);
});
