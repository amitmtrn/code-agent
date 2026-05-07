import { OllamaProvider } from '../src/providers/ollama';
import { Agent } from '../src/agent/core';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';
import { ChatOptions, ChatResponse } from '../src/providers/types';
import chalk from 'chalk';

// Mock Ollama client internally via OllamaProvider's client property
// Since client is private, we'll use a type-casting hack for testing
// or better, we can mock the entire provider for the Agent test, 
// and test the OllamaProvider separately.

async function testOllamaProviderFallback() {
  console.log('--- Testing OllamaProvider Fallback ---');
  
  const provider = new OllamaProvider();
  const client = (provider as any).client;

  // Mock the list and pull methods to avoid network calls
  client.list = async () => ({ models: [{ name: 'unsupported-model' }] });
  client.pull = async () => ({ status: 'success' });

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (options.tools && options.tools.length > 0) {
      // Simulate the error reported by the user
      const error = new Error('registry.ollama.ai/library/llama2-uncensored:7b does not support tools');
      (error as any).status_code = 400;
      throw error;
    }
    return {
      message: {
        role: 'assistant',
        content: 'I can answer this without tools!'
      }
    };
  };

  const response = await provider.chat({
    model: 'unsupported-model',
    messages: [{ role: 'user', content: 'what this project is about?' }],
    tools: registry.getDefinitions()
  });

  if (chatCalls === 2) {
    console.log('PASS: OllamaProvider fallback (retried without tools)');
  } else {
    console.error(`FAIL: OllamaProvider fallback. Expected 2 calls, got ${chatCalls}`);
    process.exit(1);
  }

  if (response.message.content === 'I can answer this without tools!') {
    console.log('PASS: OllamaProvider response (got content after fallback)');
  } else {
    console.error(`FAIL: OllamaProvider response. Got: ${response.message.content}`);
    process.exit(1);
  }
}

async function testAgentManualToolParsing() {
  console.log('\n--- Testing Agent Manual Tool Parsing ---');
  
  registry.register(listFilesTool);

  const mockProvider = {
    async chat(options: ChatOptions): Promise<ChatResponse> {
      if (options.messages.length === 2) { // First assistant turn
        return {
          message: {
            role: 'assistant',
            content: 'Let me list files. <tool_call>{"name": "list_files", "arguments": {"path": "."}}</tool_call>'
          }
        };
      }
      return {
        message: {
          role: 'assistant',
          content: 'I listed the files. <SATISFIED>'
        }
      };
    }
  };

  const agent = new Agent(mockProvider as any, 'mock-model');
  
  // Capture console.log to verify execution
  const capturedOutput: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedOutput.push(args.join(' '));
    // originalLog(...args); // Keep output quiet during test
  };

  await agent.chat('list files');
  
  console.log = originalLog;

  const fullOutput = capturedOutput.join('\n');
  const hasExecuting = fullOutput.includes('Executing tool: list_files');
  const hasToolResult = fullOutput.includes('package.json');
  const hasStrippedTags = !fullOutput.includes('<tool_call>');

  if (hasExecuting && hasToolResult) {
    console.log('PASS: Agent manual tool execution');
  } else {
    console.error('FAIL: Agent manual tool execution');
    console.error('Output:', fullOutput);
    process.exit(1);
  }

  if (hasStrippedTags) {
    console.log('PASS: Agent display hygiene (stripped tags)');
  } else {
    console.error('FAIL: Agent display hygiene (tags still present)');
    process.exit(1);
  }
}

async function runTests() {
  try {
    await testOllamaProviderFallback();
    await testAgentManualToolParsing();
    console.log('\n--- All assertions passed ---');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
