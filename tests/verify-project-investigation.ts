import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { listFilesTool, readFileTool } from '../src/tools/fs';

// Setup tools
registry.register(listFilesTool);
registry.register(readFileTool);

class MockProvider implements Provider {
  public turns: any[] = [];
  public currentTurn = 0;

  constructor(responses: any[]) {
    this.turns = responses;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = this.turns[this.currentTurn++] || { 
      thought: "No more mock responses", 
      message: "No more mock responses", 
      satisfied: true 
    };
    
    return {
      message: {
        role: 'assistant',
        content: JSON.stringify(response)
      }
    };
  }
}

async function runTest() {
  console.log('--- Project Investigation Verification ---');

  const responses = [
    // Turn 1: Initial thought, calls list_files
    {
      thought: "The user wants to know about the project. I need to list files first.",
      tool_call: { name: "list_files", arguments: { path: "." } },
      message: "I'll start by listing the files in the project to understand its structure.",
      satisfied: false
    },
    // Turn 2: Sees src/index.ts, decides to read it
    {
      thought: "I see src/index.ts. I'll read it to understand the entry point.",
      tool_call: { name: "read_file", arguments: { file_path: "src/index.ts" } },
      message: "Listing files showed a src directory. I'm reading src/index.ts now.",
      satisfied: false
    },
    // Turn 3: Final conclusion
    {
      thought: "Now I know it's a TypeScript project with an agent core.",
      tool_call: null,
      message: "This is a TypeScript-based AI agent project.",
      satisfied: true
    }
  ];

  const provider = new MockProvider(responses);
  const agent = new Agent(provider, 'mock-model', true, 5);

  let toolCallsCount = 0;
  const originalExecute = registry.execute;
  registry.execute = async (name, args) => {
    toolCallsCount++;
    return await originalExecute(name, args);
  };

  await agent.chat('what is this project about?');

  if (toolCallsCount >= 2) {
    console.log(`PASS: Agent used ${toolCallsCount} tools for investigation.`);
  } else {
    console.log(`FAIL: Agent only used ${toolCallsCount} tools, expected at least 2.`);
    process.exit(1);
  }

  const messages = (agent as any).messages;
  const lastMessageContent = messages[messages.length - 1].content;
  if (lastMessageContent.includes('"satisfied":true')) {
    console.log('PASS: Agent set satisfied to true at the end.');
  } else {
    console.log('FAIL: Agent did not set satisfied to true.');
    process.exit(1);
  }

  console.log('ALL PROJECT INVESTIGATION ASSERTIONS PASSED');
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
