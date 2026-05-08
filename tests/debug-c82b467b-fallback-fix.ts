import { OllamaProvider } from '../src/providers/ollama';
import { registry } from '../src/tools/registry';
import { listFilesTool } from '../src/tools/fs';

// Capture console output for logging verification
let consoleOutput: string[] = [];
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

function captureConsole() {
  consoleOutput = [];
  console.warn = (...args: any[]) => consoleOutput.push(`WARN: ${args.join(' ')}`);
  console.error = (...args: any[]) => consoleOutput.push(`ERROR: ${args.join(' ')}`);
  console.log = (...args: any[]) => consoleOutput.push(`LOG: ${args.join(' ')}`);
}

function restoreConsole() {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
}

async function testToolsUndefinedWithParsingErrors() {
  console.log('--- Test 1: Tools undefined with parsing errors (main fix) ---');

  registry.register(listFilesTool);
  const provider = new OllamaProvider();
  const client = (provider as any).client;

  // Mock the list and pull methods
  client.list = async () => ({ models: [{ name: 'test-model' }] });
  client.pull = async () => ({ status: 'success' });

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (chatCalls === 1) {
      // First call simulates the exact error from user report
      const error = new Error("error parsing tool call: raw='{\"cmd\":[\"bash\",\"-lc\",\"ls -R\"]}<|call|>commentary<|channel|>analysis<|message|>Let\\'s run.'");
      (error as any).status_code = 500;
      throw error;
    }
    // Second call (fallback) succeeds
    return {
      message: {
        role: 'assistant',
        content: 'Fallback successful after tools undefined parsing error'
      }
    };
  };

  captureConsole();

  const response = await provider.chat({
    model: 'test-model',
    messages: [{ role: 'user', content: 'test message' }],
    tools: undefined // This is the key - tools is undefined but error still occurs
  });

  restoreConsole();

  if (chatCalls === 2) {
    console.log('PASS: Fallback triggered with tools undefined (2 chat calls made)');
  } else {
    console.error(`FAIL: Expected 2 chat calls, got ${chatCalls}`);
    process.exit(1);
  }

  if (response.message.content === 'Fallback successful after tools undefined parsing error') {
    console.log('PASS: Correct response received after fallback');
  } else {
    console.error(`FAIL: Wrong response content: ${response.message.content}`);
    process.exit(1);
  }

  // Verify fallback warning was logged
  const hasWarning = consoleOutput.some(line =>
    line.includes('had trouble with tool parsing (without tools)')
  );
  if (hasWarning) {
    console.log('PASS: Fallback warning logged correctly');
  } else {
    console.error(`FAIL: No fallback warning found. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testNestedRetryFailure() {
  console.log('\n--- Test 2: Nested retry failure ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (chatCalls === 1) {
      // Initial call fails with tool parsing error
      const error = new Error("error parsing tool call: raw='{\"invalid\":\"json\"}<|call|>error'");
      (error as any).status_code = 500;
      throw error;
    } else {
      // Retry also fails
      const retryError = new Error("Connection timeout");
      (retryError as any).status_code = 500;
      throw retryError;
    }
  };

  captureConsole();

  const response = await provider.chat({
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    tools: undefined
  });

  restoreConsole();

  if (chatCalls === 2) {
    console.log('PASS: Retry attempted after initial failure');
  } else {
    console.error(`FAIL: Expected 2 chat calls, got ${chatCalls}`);
    process.exit(1);
  }

  // Should return safe fallback response
  if (response.message.content?.includes('I encountered a technical issue')) {
    console.log('PASS: Safe fallback response returned');
  } else {
    console.error(`FAIL: Wrong fallback response: ${response.message.content}`);
    process.exit(1);
  }

  // Verify retry error was logged
  const hasRetryError = consoleOutput.some(line =>
    line.includes('Fallback retry also failed')
  );
  if (hasRetryError) {
    console.log('PASS: Retry failure logged correctly');
  } else {
    console.error(`FAIL: No retry failure log found. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testJsonExtractionSuccess() {
  console.log('\n--- Test 3: JSON extraction success ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (chatCalls === 1) {
      // Error with extractable JSON content
      const error = new Error("error parsing tool call: raw='{\"cmd\":[\"test\"]}<|call|>garbage'");
      (error as any).status_code = 500;
      throw error;
    } else {
      // Retry also fails, should use extracted content
      throw new Error("Retry failed");
    }
  };

  captureConsole();

  const response = await provider.chat({
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    tools: undefined
  });

  restoreConsole();

  // Should extract and use the JSON content
  if (response.message.content === '{"cmd":["test"]}') {
    console.log('PASS: JSON content extracted successfully');
  } else {
    console.error(`FAIL: Wrong extracted content: ${response.message.content}`);
    process.exit(1);
  }

  if (response.message.reasoning === 'Recovered from tool parsing error using extracted content') {
    console.log('PASS: Correct reasoning for extracted content');
  } else {
    console.error(`FAIL: Wrong reasoning: ${response.message.reasoning}`);
    process.exit(1);
  }

  // Verify extraction was logged
  const hasExtraction = consoleOutput.some(line =>
    line.includes('Extracted JSON from error')
  );
  if (hasExtraction) {
    console.log('PASS: JSON extraction logged correctly');
  } else {
    console.error(`FAIL: No extraction log found. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testCompleteFallbackFailure() {
  console.log('\n--- Test 4: Complete fallback failure ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    // All calls fail, no extractable content
    const error = new Error("error parsing tool call: malformed response");
    (error as any).status_code = 500;
    throw error;
  };

  captureConsole();

  const response = await provider.chat({
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    tools: undefined
  });

  restoreConsole();

  // Should return safe error response
  if (response.message.content?.includes('I encountered a technical issue') &&
      response.message.content?.includes('Original error:') &&
      response.message.content?.includes('Retry error:')) {
    console.log('PASS: Complete failure handled with safe response');
  } else {
    console.error(`FAIL: Wrong complete failure response: ${response.message.content}`);
    process.exit(1);
  }

  if (response.message.reasoning === 'Fallback response due to persistent errors') {
    console.log('PASS: Correct reasoning for complete failure');
  } else {
    console.error(`FAIL: Wrong complete failure reasoning: ${response.message.reasoning}`);
    process.exit(1);
  }
}

async function testNoExceptionsPropagated() {
  console.log('\n--- Test 5: Assert no exceptions propagated ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  // Test that even the worst error scenarios don't throw unhandled exceptions
  client.chat = async () => {
    throw new Error("Catastrophic failure");
  };

  try {
    await provider.chat({
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      tools: undefined
    });
    console.log('PASS: No exceptions propagated (call completed normally)');
  } catch (error) {
    // This should NOT happen - the provider should handle all errors gracefully
    console.error(`FAIL: Unhandled exception propagated: ${error}`);
    process.exit(1);
  }
}

async function runTests() {
  try {
    await testToolsUndefinedWithParsingErrors();
    await testNestedRetryFailure();
    await testJsonExtractionSuccess();
    await testCompleteFallbackFailure();
    await testNoExceptionsPropagated();

    console.log('\n🎉 All Ollama fallback fix tests passed!');
  } catch (error) {
    console.error('Test suite failed with error:', error);
    process.exit(1);
  }
}

runTests();