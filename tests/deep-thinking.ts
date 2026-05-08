import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';

class MockProvider implements Provider {
  constructor(private responses: ChatResponse[]) {}
  private currentResponse = 0;
  public calls = 0;

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.calls++;
    return this.responses[this.currentResponse++] || { message: { role: 'assistant', content: '{"thought": "done", "tool_call": null, "message": "No more responses", "satisfied": true}' } };
  }
}

async function runTests() {
  console.log('--- Deep Thinking Verification Tests ---');

  // Scenario 1: Deep Thinking Disabled
  {
    console.log('Scenario 1: Deep Thinking Disabled');
    const mock = new MockProvider([{ message: { role: 'assistant', content: '{"thought": "hello", "tool_call": null, "message": "Hello", "satisfied": true}' } }]);
    const agent = new Agent(mock, 'mock', false);
    await agent.chat('Hello');
    if (mock.calls === 1) {
      console.log('PASS: Scenario 1');
    } else {
      console.log(`FAIL: Scenario 1 (Expected 1 call, got ${mock.calls})`);
      process.exit(1);
    }
  }

  // Scenario 2: Deep Thinking Enabled - Immediate Satisfaction
  {
    console.log('Scenario 2: Deep Thinking Enabled - Immediate Satisfaction');
    const mock = new MockProvider([{ message: { role: 'assistant', content: '{"thought": "I am done.", "tool_call": null, "message": "I am done.", "satisfied": true}' } }]);
    const agent = new Agent(mock, 'mock', true);
    await agent.chat('Hello');
    if (mock.calls === 1) {
      console.log('PASS: Scenario 2');
    } else {
      console.log(`FAIL: Scenario 2 (Expected 1 call, got ${mock.calls})`);
      process.exit(1);
    }
  }

  // Scenario 3: Deep Thinking Enabled - Multi-loop Satisfaction
  {
    console.log('Scenario 3: Deep Thinking Enabled - Multi-loop Satisfaction');
    const mock = new MockProvider([
      { message: { role: 'assistant', content: '{"thought": "initial answer", "tool_call": null, "message": "Here is an initial answer.", "satisfied": false}' } },
      { message: { role: 'assistant', content: '{"thought": "satisfied now", "tool_call": null, "message": "Now I am satisfied.", "satisfied": true}' } }
    ]);
    const agent = new Agent(mock, 'mock', true, 2);
    await agent.chat('Hello');
    if (mock.calls === 2) {
      console.log('PASS: Scenario 3');
    } else {
      console.log(`FAIL: Scenario 3 (Expected 2 calls, got ${mock.calls})`);
      process.exit(1);
    }
  }

  // Scenario 4: Deep Thinking Enabled - Max Loops Limit
  {
    console.log('Scenario 4: Deep Thinking Enabled - Max Loops Limit');
    const mock = new MockProvider([
      { message: { role: 'assistant', content: '{"thought": "not satisfied", "tool_call": null, "message": "I am still not satisfied.", "satisfied": false}' } },
      { message: { role: 'assistant', content: '{"thought": "still not satisfied", "tool_call": null, "message": "Still not satisfied.", "satisfied": false}' } },
      { message: { role: 'assistant', content: '{"thought": "should stop", "tool_call": null, "message": "I should have stopped before this.", "satisfied": false}' } }
    ]);
    const agent = new Agent(mock, 'mock', true, 1);
    await agent.chat('Hello');
    // 1 initial + 1 loop = 2 calls
    if (mock.calls === 2) {
      console.log('PASS: Scenario 4');
    } else {
      console.log(`FAIL: Scenario 4 (Expected 2 calls, got ${mock.calls})`);
      process.exit(1);
    }
  }

  console.log('--- All Deep Thinking Tests Passed ---');
}

runTests().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
