import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';

class MockProvider implements Provider {
  async chat(options: ChatOptions): Promise<ChatResponse> {
    return {
      message: {
        role: 'assistant',
        content: JSON.stringify({
          thought: "Nothing",
          tool_call: null,
          message: "I am a generic agent.",
          satisfied: true
        })
      }
    };
  }
}

async function runTest() {
  const provider = new MockProvider();
  const agent = new Agent(provider, 'mock-model');
  
  // Access private messages to check the system prompt
  const messages = (agent as any).messages;
  const systemMessage = messages.find((m: any) => m.role === 'system');
  
  if (!systemMessage) {
    console.error('BUG REPRODUCED: No system message found.');
    process.exit(1);
  }

  const content = systemMessage.content.toLowerCase();
  const hasOllama = content.includes('ollama');
  const hasReplicate = content.includes('replicate');

  console.log('Checking system prompt for keywords...');
  console.log('Has "ollama":', hasOllama);
  console.log('Has "replicate":', hasReplicate);

  if (!hasOllama || !hasReplicate) {
    console.error('BUG REPRODUCED: System prompt does not mention Ollama or Replicate.');
    process.exit(1);
  }

  console.log('SUCCESS: System prompt contains required keywords.');
  process.exit(0);
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
