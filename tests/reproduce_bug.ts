import { Agent } from '../src/agent/core';
import { Provider, ChatOptions, ChatResponse } from '../src/providers/types';
import { registry } from '../src/tools/registry';
import { listFilesTool, readFileTool } from '../src/tools/fs';

class HallucinatingProvider implements Provider {
  public turn = 0;
  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.turn++;
    if (this.turn === 1) {
      // Model hallucinates/uses hardcoded info and claims to be satisfied without tool use
      return {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            thought: "I know this project is code-agent, a clone of Claude Code. I don't need to check files.",
            tool_call: null,
            message: "This project is a code-agent, which is a clone of Claude Code.",
            satisfied: true
          })
        }
      };
    }
    return { message: { role: 'assistant', content: '{"satisfied": true}' } };
  }
}

async function runReproduction() {
  console.log("Testing if agent allows 'satisfied: true' without empirical investigation for project questions...");
  
  const provider = new HallucinatingProvider();
  const agent = new Agent(provider, 'mock', true, 5); // Enable deep thinking
  
  registry.register(listFilesTool);
  registry.register(readFileTool);

  const executedTools: string[] = [];
  const originalExecute = registry.execute;
  registry.execute = async (name: string, args: string) => {
    executedTools.push(name);
    return "mock content";
  };

  await agent.chat("what is this project about?");
  
  if (executedTools.length === 0) {
    console.error("FAIL: Agent accepted a satisfied response for a project question WITHOUT any tool execution.");
    process.exit(1);
  }
  
  console.log("PASS: Agent insisted on investigation.");
}

runReproduction().catch(e => {
  console.error(e);
  process.exit(1);
});
