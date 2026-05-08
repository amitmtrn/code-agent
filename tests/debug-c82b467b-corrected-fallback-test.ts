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

async function testPrimaryBugFixVerification() {
  console.log('--- Test 1: Primary bug fix verification (tools undefined with valid tool call) ---');

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
      // First call simulates tool parsing error with valid tool call
      const error = new Error("error parsing tool call: raw='{\"name\":\"list_files\",\"arguments\":{\"path\":\".\"}}' <|call|>commentary");
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

async function testCorrectedInvalidJsonHandling() {
  console.log('\n--- Test 2: Corrected invalid JSON handling (malformed JSON) ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (chatCalls === 1) {
      // Initial call fails with malformed JSON that can't be parsed
      const error = new Error("error parsing tool call: raw='{\"incomplete_json<|call|>error'");
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

  // Should return safe fallback response instead of malformed content
  if (response.message.content?.includes('I encountered a technical issue')) {
    console.log('PASS: Safe fallback response returned for malformed JSON');
  } else {
    console.error(`FAIL: Wrong fallback response: ${response.message.content}`);
    process.exit(1);
  }

  // Verify no extraction occurred for malformed JSON
  const hasNoExtraction = !consoleOutput.some(line =>
    line.includes('Extracted valid tool call from error')
  );
  if (hasNoExtraction) {
    console.log('PASS: Malformed JSON correctly not extracted');
  } else {
    console.error(`FAIL: Malformed JSON was incorrectly extracted. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testValidToolCallExtraction() {
  console.log('\n--- Test 3: Valid tool call extraction ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (chatCalls === 1) {
      // Error with valid tool call that should be extracted
      const error = new Error("error parsing tool call: raw='{\"cmd\":[\"ls\",\"-la\"]}<|call|>commentary'");
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

  // Should extract and use the valid tool call
  if (response.message.content === '{"cmd":["ls","-la"]}') {
    console.log('PASS: Valid tool call extracted successfully');
  } else {
    console.error(`FAIL: Wrong extracted content: ${response.message.content}`);
    process.exit(1);
  }

  if (response.message.reasoning === 'Recovered from tool parsing error using extracted tool call') {
    console.log('PASS: Correct reasoning for extracted tool call');
  } else {
    console.error(`FAIL: Wrong reasoning: ${response.message.reasoning}`);
    process.exit(1);
  }

  // Verify extraction was logged
  const hasExtraction = consoleOutput.some(line =>
    line.includes('Extracted valid tool call from error')
  );
  if (hasExtraction) {
    console.log('PASS: Tool call extraction logged correctly');
  } else {
    console.error(`FAIL: No extraction log found. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testNonToolJsonRejection() {
  console.log('\n--- Test 4: Non-tool JSON rejection ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    if (chatCalls === 1) {
      // Error with valid JSON but not a tool call
      const error = new Error("error parsing tool call: raw='{\"random\":\"data\",\"not\":\"tool\"}<|call|>commentary'");
      (error as any).status_code = 500;
      throw error;
    } else {
      // Retry also fails
      throw new Error("Connection timeout");
    }
  };

  captureConsole();

  const response = await provider.chat({
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    tools: undefined
  });

  restoreConsole();

  // Should reject non-tool JSON and return safe fallback
  if (response.message.content?.includes('I encountered a technical issue')) {
    console.log('PASS: Non-tool JSON rejected, safe response returned');
  } else {
    console.error(`FAIL: Expected safe response, got: ${response.message.content}`);
    process.exit(1);
  }

  // Verify validation failure was logged (no extraction log)
  const hasNoExtraction = !consoleOutput.some(line =>
    line.includes('Extracted valid tool call from error')
  );
  if (hasNoExtraction) {
    console.log('PASS: Non-tool JSON correctly not extracted');
  } else {
    console.error(`FAIL: Non-tool JSON was incorrectly extracted. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }

  // Verify validation skip was logged
  const hasValidationLog = consoleOutput.some(line =>
    line.includes('Found JSON-like content in error but failed validation')
  );
  if (hasValidationLog) {
    console.log('PASS: Validation failure logged correctly');
  } else {
    console.error(`FAIL: No validation failure log found. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testCompleteFailureHandling() {
  console.log('\n--- Test 5: Complete failure handling ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  let chatCalls = 0;
  client.chat = async (options: any) => {
    chatCalls++;
    // All calls fail, no extractable content
    const error = new Error("error parsing tool call: malformed response with no extractable content");
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

  // Should return safe error response with diagnostic information
  if (response.message.content?.includes('I encountered a technical issue') &&
      response.message.content?.includes('Original error:') &&
      response.message.content?.includes('Retry error:')) {
    console.log('PASS: Complete failure handled with diagnostic safe response');
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

  // Verify safe fallback logging
  const hasSafeFallbackLog = consoleOutput.some(line =>
    line.includes('Using safe fallback response due to persistent errors')
  );
  if (hasSafeFallbackLog) {
    console.log('PASS: Safe fallback logging verified');
  } else {
    console.error(`FAIL: No safe fallback log found. Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testEnhancedLoggingOutput() {
  console.log('\n--- Test 6: Enhanced logging output verification ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  // Test case with name-based tool call for different logging path
  client.chat = async (options: any) => {
    const error = new Error("error parsing tool call: raw='{\"name\":\"test_tool\",\"arguments\":{\"param\":\"value\"}}<|call|>commentary'");
    (error as any).status_code = 500;
    throw error;
  };

  captureConsole();

  await provider.chat({
    model: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    tools: undefined
  });

  restoreConsole();

  // Verify that logging correctly distinguishes different scenarios
  const hasValidExtractionLog = consoleOutput.some(line =>
    line.includes('Extracted valid tool call from error')
  );
  const hasRetryFailureLog = consoleOutput.some(line =>
    line.includes('Fallback retry also failed')
  );
  const hasExtractionAttemptLog = consoleOutput.some(line =>
    line.includes('Attempting to use extracted tool call from original error')
  );

  if (hasValidExtractionLog && hasRetryFailureLog && hasExtractionAttemptLog) {
    console.log('PASS: Enhanced logging correctly distinguishes between different recovery paths');
  } else {
    console.error(`FAIL: Enhanced logging incomplete. Valid: ${hasValidExtractionLog}, Retry: ${hasRetryFailureLog}, Attempt: ${hasExtractionAttemptLog}`);
    console.error(`Output: ${JSON.stringify(consoleOutput)}`);
    process.exit(1);
  }
}

async function testNoExceptionsPropagated() {
  console.log('\n--- Test 7: Assert no exceptions propagated ---');

  const provider = new OllamaProvider();
  const client = (provider as any).client;

  // Test that even the worst error scenarios don't throw unhandled exceptions
  client.chat = async () => {
    throw new Error("Catastrophic unrecoverable failure");
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
    await testPrimaryBugFixVerification();
    await testCorrectedInvalidJsonHandling();
    await testValidToolCallExtraction();
    await testNonToolJsonRejection();
    await testCompleteFailureHandling();
    await testEnhancedLoggingOutput();
    await testNoExceptionsPropagated();

    console.log('\n🎉 All corrected Ollama fallback fix tests passed!');
  } catch (error) {
    console.error('Test suite failed with error:', error);
    process.exit(1);
  }
}

runTests();