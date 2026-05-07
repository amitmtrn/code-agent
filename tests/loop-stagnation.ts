import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';

class MockLoopingProvider implements Provider {
  private currentLoop = 0;
  public calls = 0;

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.calls++;
    this.currentLoop++;
    
    // Simulate a model that says it's satisfied but forgets the keyword
    if (this.currentLoop === 1) {
      return { message: { role: 'assistant', content: 'I am thinking about it.' } };
    }
    return { message: { role: 'assistant', content: 'Yes, I am satisfied and have finished my work.' } };
  }
}

async function runTest() {
  console.log('--- Loop Stagnation Test ---');
  
  const mock = new MockLoopingProvider();
  // Set max loops to 5
  const agent = new Agent(mock, 'mock', true, 5);
  
  console.log('Starting chat...');
  await agent.chat('Tell me a joke');
  
  console.log(`Total calls made: ${mock.calls}`);
  
  if (mock.calls >= 6) {
    console.log('FAIL: Agent got stuck in a loop despite no progress');
    process.exit(1);
  } else {
    console.log('PASS: Agent stopped looping');
  }
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
