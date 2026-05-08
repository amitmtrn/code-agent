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
    return this.responses[this.currentResponse++];
  }
}

async function testErrorResponseLogging() {
  console.log('--- Testing Error Response Logging ---');

  const invalidResponse = "This is not JSON at all!";
  const mockProvider = new MockProvider([
    {
      message: { 
        role: 'assistant', 
        content: invalidResponse
      }
    },
    {
      message: {
        role: 'assistant',
        content: '{ "thought": "Corrected", "tool_call": null, "message": "I fixed it", "satisfied": true }'
      }
    }
  ]);

  const agent = new Agent(mockProvider, 'mock-model');
  
  let capturedError = '';
  const originalError = console.error;
  console.error = (...args: any[]) => {
    capturedError += args.join(' ') + '\n';
    originalError(...args);
  };
  
  await agent.chat('Please fail');
  console.error = originalError;

  const expectedMessage = 'Error: Model failed to provide a valid JSON response. Response:';
  if (capturedError.includes(expectedMessage) && capturedError.includes(invalidResponse)) {
    console.log('PASS: Error message includes the expected text and the raw response content');
  } else {
    console.error('FAIL: Error message missing expected content.');
    console.error('Captured Error:', capturedError);
    process.exit(1);
  }
}

testErrorResponseLogging().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
