import { OllamaProvider } from '../src/providers/ollama';
import { Agent } from '../src/agent/core';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';
import { ChatOptions, ChatResponse } from '../src/providers/types';
import { Ollama } from 'ollama';
import { config } from '../src/config';
import chalk from 'chalk';

// Mock Ollama client internally via OllamaProvider's client property
async function testOllamaProviderFallback() {
  console.log('--- Testing OllamaProvider Fallback ---');
  
  // Ensure we have at least one tool registered
  registry.register(listFilesTool);
  
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
        content: '{"thought": "no tools needed", "tool_call": null, "message": "I can answer this without tools!", "satisfied": true}'
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

  // The Agent would parse this, but here we are checking the raw provider response content
  if (response.message.content.includes('I can answer this without tools!')) {
    console.log('PASS: OllamaProvider response (got content after fallback)');
  } else {
    console.error(`FAIL: OllamaProvider response. Got: ${response.message.content}`);
    process.exit(1);
  }
}

async function testAgentManualToolParsing() {
  console.log('\n--- Testing Agent JSON Tool Parsing ---');
  
  registry.register(listFilesTool);

  const mockProvider = {
    async chat(options: ChatOptions): Promise<ChatResponse> {
      if (options.messages.length === 2) { // First assistant turn
        return {
          message: {
            role: 'assistant',
            content: '{"thought": "Listing files", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "message": "Let me list files.", "satisfied": false}'
          }
        };
      }
      return {
        message: {
          role: 'assistant',
          content: '{"thought": "Done", "tool_call": null, "message": "I listed the files.", "satisfied": true}'
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
  };

  await agent.chat('list files');
  
  console.log = originalLog;

  const fullOutput = capturedOutput.join('\n');
  const hasExecuting = fullOutput.includes('Executing tool: list_files');
  const hasToolResult = fullOutput.includes('package.json') || fullOutput.includes('Dockerfile') || fullOutput.includes('src');
  const hasStrippedJson = !fullOutput.includes('"tool_call"');

  if (hasExecuting && hasToolResult) {
    console.log('PASS: Agent JSON tool execution');
  } else {
    console.error('FAIL: Agent JSON tool execution');
    console.error('Output:', fullOutput);
    process.exit(1);
  }

  if (hasStrippedJson) {
    console.log('PASS: Agent display hygiene (raw JSON keys not in output)');
  } else {
    console.error('FAIL: Agent display hygiene (raw JSON keys still present)');
    console.error('Output:', fullOutput);
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
