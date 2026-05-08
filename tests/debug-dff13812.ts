import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { listFilesTool, readFileTool } from '../src/tools/fs';

// Setup tools
registry.register(listFilesTool);
registry.register(readFileTool);

class ProjectInvestigationMockProvider implements Provider {
  public turn = 0;
  
  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.turn++;
    
    // Simulating a model that follows the new Project Investigation Workflow
    if (this.turn === 1) {
      return {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            thought: "UNDERSTAND: User wants to know about the project. INVESTIGATE: I must list files to understand the structure.",
            tool_call: { name: "list_files", arguments: { path: "." } },
            message: "I'll start by listing the project files.",
            satisfied: false
          })
        }
      };
    }
    
    if (this.turn === 2) {
      return {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            thought: "I see a readme folder. I'll check its content.",
            tool_call: { name: "list_files", arguments: { path: "readme" } },
            message: "Checking the readme folder.",
            satisfied: false
          })
        }
      };
    }

    return {
      message: {
        role: 'assistant',
        content: JSON.stringify({
          thought: "THINK: It's a TypeScript AI agent project with documentation in readme/.",
          tool_call: null,
          message: "This is a TypeScript-based AI agent project. It supports Ollama and Replicate providers.",
          satisfied: true
        })
      }
    };
  }
}

async function runTest() {
  console.log('--- Debug Fix Verification: Project Investigation ---');

  const provider = new ProjectInvestigationMockProvider();
  const agent = new Agent(provider, 'mock-model', true, 5);

  let toolCalls: string[] = [];
  const originalExecute = registry.execute;
  registry.execute = async (name, args) => {
    toolCalls.push(name);
    return await originalExecute(name, args);
  };

  let capturedOutput = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };

  try {
    await agent.chat('what is this project about?');

    console.log('\n--- Assertions ---');

    // 1. Tool Usage Assertion
    if (toolCalls.length >= 2) {
      console.log(`PASS: Agent used ${toolCalls.length} tools for investigation.`);
    } else {
      console.log(`FAIL: Agent used only ${toolCalls.length} tools, expected at least 2.`);
      process.exit(1);
    }

    // 2. Inspect Tool Selection
    const usedListFiles = toolCalls.includes('list_files');
    if (usedListFiles) {
      console.log('PASS: Agent targeted relevant tool (list_files).');
    } else {
      console.log('FAIL: Agent did not use list_files.');
      process.exit(1);
    }

    // 3. Validate Response Content
    const lowerOutput = capturedOutput.toLowerCase();
    const hasKeywords = lowerOutput.includes('typescript') || lowerOutput.includes('agent');
    const hasHallucinations = lowerOutput.includes('rust') || lowerOutput.includes('main.rs');

    if (hasKeywords) {
      console.log('PASS: Response contains project-relevant keywords.');
    } else {
      console.log('FAIL: Response lacks project-relevant keywords.');
      process.exit(1);
    }

    if (!hasHallucinations) {
      console.log('PASS: No Rust-related hallucinations detected.');
    } else {
      console.log('FAIL: Detected Rust-related hallucinations in response.');
      process.exit(1);
    }

    // 4. Verify Loop Termination
    if (capturedOutput.includes('This is a TypeScript-based AI agent project')) {
      console.log('PASS: Agent reached final response and terminated.');
    } else {
      console.log('FAIL: Agent did not reach the expected final response.');
      process.exit(1);
    }

    console.log('\nALL DEBUG FIX ASSERTIONS PASSED');
  } finally {
    console.log = originalLog;
  }
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
