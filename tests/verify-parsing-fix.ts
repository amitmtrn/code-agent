import { OllamaProvider } from '../src/providers/ollama';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';

async function testOllamaProviderParsingFallback() {
  console.log('--- Testing OllamaProvider Parsing Error Fallback ---');
  
  registry.register(listFilesTool);
  const provider = new OllamaProvider();
  const client = (provider as any).client;

  // Mock the list and pull methods
  client.list = async () => ({ models: [{ name: 'buggy-model' }] });
  client.pull = async () => ({ status: 'success' });

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (options.tools && options.tools.length > 0) {
      // Simulate the "error parsing tool call" error reported by the user
      const error = new Error("error parsing tool call: raw='{\"path\":\".\"}<|call|>commentary...'");
      (error as any).status_code = 500;
      throw error;
    }
    return {
      message: {
        role: 'assistant',
        content: 'I caught the parsing error and retried!'
      }
    };
  };

  const response = await provider.chat({
    model: 'buggy-model',
    messages: [{ role: 'user', content: 'what this project is about?' }],
    tools: registry.getDefinitions()
  });

  if (chatCalls === 2) {
    console.log('PASS: OllamaProvider fallback on parsing error (retried without tools)');
  } else {
    console.error(`FAIL: OllamaProvider fallback on parsing error. Expected 2 calls, got ${chatCalls}`);
    process.exit(1);
  }

  if (response.message.content === 'I caught the parsing error and retried!') {
    console.log('PASS: OllamaProvider response received after parsing error fallback');
  } else {
    console.error(`FAIL: OllamaProvider response. Got: ${response.message.content}`);
    process.exit(1);
  }
}

async function testOllamaProviderInvalidCharFallback() {
  console.log('\n--- Testing OllamaProvider Invalid Character Fallback ---');
  
  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (options.tools && options.tools.length > 0) {
      // Simulate the "invalid character" error
      const error = new Error("invalid character '<' after top-level value");
      (error as any).status_code = 500;
      throw error;
    }
    return {
      message: {
        role: 'assistant',
        content: 'I caught the invalid char error and retried!'
      }
    };
  };

  const response = await provider.chat({
    model: 'buggy-model',
    messages: [{ role: 'user', content: 'hi' }],
    tools: registry.getDefinitions()
  });

  if (chatCalls === 2) {
    console.log('PASS: OllamaProvider fallback on invalid character (retried without tools)');
  } else {
    console.error(`FAIL: OllamaProvider fallback on invalid character. Expected 2 calls, got ${chatCalls}`);
    process.exit(1);
  }
}

async function runTests() {
  try {
    await testOllamaProviderParsingFallback();
    await testOllamaProviderInvalidCharFallback();
    console.log('\n--- All parsing fix assertions passed ---');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
