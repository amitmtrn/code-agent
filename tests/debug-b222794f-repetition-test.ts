import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { readFileTool, listFilesTool } from '../src/tools/fs';

// Setup tools
registry.register(readFileTool);
registry.register(listFilesTool);

class MockProvider implements Provider {
  public turn = 0;
  constructor(public responses: any[]) {}

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const resp = this.responses[this.turn] || this.responses[this.responses.length - 1];
    this.turn++;
    return {
      message: {
        role: 'assistant',
        content: JSON.stringify(resp)
      }
    };
  }
}

async function runTest() {
  console.log('--- Verifying Repetitive Tool Call Prevention ---');

  const responses = [
    // Turn 1: Try to read a file that doesn't exist
    {
      thought: "I'll read src/main.ts to understand the project.",
      tool_call: { name: "read_file", arguments: { file_path: "src/main.ts" } },
      message: "Reading main.ts...",
      satisfied: false
    },
    // Turn 2: Attempt to repeat the same failed call
    {
      thought: "I really want to read src/main.ts.",
      tool_call: { name: "read_file", arguments: { file_path: "src/main.ts" } },
      message: "Trying to read main.ts again...",
      satisfied: false
    },
    // Turn 3: Finally give up or do something else
    {
      thought: "Okay, I'll list files instead since reading main.ts failed.",
      tool_call: { name: "list_files", arguments: { path: "." } },
      message: "Listing files...",
      satisfied: true
    }
  ];

  const provider = new MockProvider(responses);
  const agent = new Agent(provider, 'mock-model', false, 5);

  // Capture console.log to check for "Repetitive failed tool call detected"
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };

  await agent.chat('What is this project about?');

  // Verify repetition was detected
  const repetitionDetected = logs.some(log => log.includes('Repetitive failed tool call detected: read_file'));
  
  if (repetitionDetected) {
    console.log('PASS: Repetitive tool call was detected and blocked.');
  } else {
    console.log('FAIL: Repetitive tool call was NOT detected.');
    process.exit(1);
  }

  // Verify history contains the error message sent back to the model
  const messages = (agent as any).messages;
  const errorSentToModel = messages.some((m: any) => 
    m.role === 'user' && m.content.includes('ERROR: You are attempting to repeat the same tool call that already failed')
  );

  if (errorSentToModel) {
    console.log('PASS: Error message was sent to the model history.');
  } else {
    console.log('FAIL: Error message was NOT found in history.');
    process.exit(1);
  }

  // Verify context of previous actions was sent
  const contextSent = messages.some((m: any) => 
    m.role === 'user' && m.content.includes('CONTEXT (Previous Actions):')
  );

  if (contextSent) {
    console.log('PASS: Context of previous actions was sent to the model.');
  } else {
    console.log('FAIL: Context of previous actions was NOT found in history.');
    process.exit(1);
  }

  console.log('ALL REPETITION PREVENTION ASSERTIONS PASSED');
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
