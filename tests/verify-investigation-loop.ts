import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';

// Mock Provider that can be configured for different test cases
class ConfigurableMockProvider implements Provider {
  public turn = 0;
  public chatResponses: (turn: number, messages: any[]) => ChatResponse;

  constructor(chatResponses: (turn: number, messages: any[]) => ChatResponse) {
    this.chatResponses = chatResponses;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.turn++;
    return this.chatResponses(this.turn, options.messages);
  }
}

async function runTest() {
  console.log('--- Investigation & Stagnation Test ---');

  // Case 1: Investigative Tool Usage
  console.log('\n[Case 1] Verifying investigative tool usage...');
  const toolExecSpy = { called: false, toolName: '' };
  const originalExecute = registry.execute;
  registry.execute = async (name: string, args: string) => {
    toolExecSpy.called = true;
    toolExecSpy.toolName = name;
    return 'Mock file content';
  };

  const case1Provider = new ConfigurableMockProvider((turn) => {
    if (turn === 1) {
      return { message: { role: 'assistant', content: 'I need to check the project files.' } };
    }
    if (turn === 2) {
      return { 
        message: { 
          role: 'assistant', 
          content: 'Checking package.json: <tool_call>{"name": "read_file", "arguments": {"file_path": "package.json"}}</tool_call>' 
        } 
      };
    }
    return { message: { role: 'assistant', content: 'I have found the information. <SATISFIED>' } };
  });

  const agent1 = new Agent(case1Provider, 'mock', true, 5);
  await agent1.chat('what this project is about?');

  if (toolExecSpy.called && toolExecSpy.toolName === 'read_file') {
    console.log('PASS: Agent used tool for investigation');
  } else {
    console.log('FAIL: Agent did not use tool for investigation');
    process.exit(1);
  }
  
  // Restore registry.execute
  registry.execute = originalExecute;

  // Case 2: Stagnation Hard-Stop (3 turn limit)
  console.log('\n[Case 2] Verifying stagnation hard-stop (3 turns)...');
  const case2Provider = new ConfigurableMockProvider((turn) => {
    return { message: { role: 'assistant', content: `Working on it... turn ${turn}` } };
  });

  const agent2 = new Agent(case2Provider, 'mock', true, 5);
  await agent2.chat('Do something complicated');

  if (case2Provider.turn === 3) {
    console.log('PASS: Agent stopped after 3 turns due to stagnation');
  } else {
    console.log(`FAIL: Agent should have stopped after 3 turns, but took ${case2Provider.turn} turns`);
    process.exit(1);
  }

  // Case 3: Keyword Termination
  console.log('\n[Case 3] Verifying keyword termination (<SATISFIED>)...');
  const case3Provider = new ConfigurableMockProvider((turn) => {
    return { message: { role: 'assistant', content: 'Done! <satisfied>' } };
  });

  const agent3 = new Agent(case3Provider, 'mock', true, 5);
  await agent3.chat('Quick task');

  if (case3Provider.turn === 1) {
    console.log('PASS: Agent terminated immediately on <SATISFIED>');
  } else {
    console.log(`FAIL: Agent should have terminated after 1 turn, but took ${case3Provider.turn} turns`);
    process.exit(1);
  }

  console.log('\nALL ASSERTIONS PASSED');
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
