import { Agent } from './src/agent/core';

// Mock provider for testing
class MockProvider {
  async chat() {
    return {
      message: { role: 'assistant', content: 'test response' },
      toolCalls: []
    };
  }
}

async function testExactErrorPattern() {
  console.log('--- Test 1: Exact Error Pattern from Bug Report ---');

  const agent = new Agent(new MockProvider() as any, 'gurubot/gpt-oss-derestricted:20b');
  const malformedContent = process.env.MALFORMED_CONTENT || '';

  let didCrash = false;

  try {
    // Test the exact parsing method that was failing
    const result = (agent as any).parseManualToolCalls(malformedContent);
    console.log('PASS: parseManualToolCalls completed without crashing');

    // Verify it returns an array (basic sanity check)
    if (Array.isArray(result)) {
      console.log('PASS: Parsing method returns valid array format');
    } else {
      console.error('FAIL: Parsing method should return array');
      process.exit(1);
    }
  } catch (error: any) {
    didCrash = true;
    if (error.message && error.message.includes('error parsing tool call')) {
      console.error('FAIL: Still getting "error parsing tool call" crashes');
      process.exit(1);
    } else if (error.message && error.message.includes('invalid character')) {
      console.error('FAIL: Still getting "invalid character" crashes');
      process.exit(1);
    } else if (error.message && error.message.includes('Cannot read properties of null')) {
      console.error('FAIL: Null safety regression - TypeError on parsing');
      process.exit(1);
    } else {
      console.error(`FAIL: Unexpected error during parsing: ${error.message}`);
      process.exit(1);
    }
  }

  if (didCrash) {
    process.exit(1);
  }
}

async function testToolExtraction() {
  console.log('\n--- Test 2: Tool Extraction from Malformed Content ---');

  const agent = new Agent(new MockMalformedProvider() as any, 'test-model');
  const malformedContent = process.env.MALFORMED_CONTENT || '';

  // Test the parsing methods directly
  const toolCalls = (agent as any).parseManualToolCalls(malformedContent);

  if (toolCalls.length > 0) {
    console.log('PASS: Tool calls extracted from malformed content');
  } else {
    console.error('FAIL: No tool calls extracted from malformed content');
    process.exit(1);
  }

  // Verify tool name inference
  const hasListFiles = toolCalls.some((call: any) => call.function.name === 'list_files');
  if (hasListFiles) {
    console.log('PASS: Correctly inferred list_files tool from malformed content');
  } else {
    console.error('FAIL: Failed to infer list_files tool name');
    process.exit(1);
  }

  // Verify JSON extraction
  const hasPathArg = toolCalls.some((call: any) => {
    try {
      const args = JSON.parse(call.function.arguments);
      return args.path === '.';
    } catch {
      return false;
    }
  });

  if (hasPathArg) {
    console.log('PASS: Correctly extracted path argument from malformed JSON');
  } else {
    console.error('FAIL: Failed to extract path argument from malformed JSON');
    process.exit(1);
  }
}

async function testNullSafety() {
  console.log('\n--- Test 3: Null Safety Guards ---');

  const agent = new Agent(new MockMalformedProvider() as any, 'test-model');

  const nullInputs = [null, undefined, 123, {}, ''];

  for (let i = 0; i < nullInputs.length; i++) {
    try {
      const result = (agent as any).parseManualToolCalls(nullInputs[i] as any);
      if (Array.isArray(result)) {
        console.log(`PASS: Null safety test ${i + 1} - no crash on invalid input`);
      } else {
        console.error(`FAIL: Null safety test ${i + 1} - invalid return type`);
        process.exit(1);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('Cannot read properties of null')) {
        console.error(`FAIL: Null safety test ${i + 1} - TypeError on null input`);
        process.exit(1);
      } else {
        console.error(`FAIL: Null safety test ${i + 1} - unexpected error: ${error.message}`);
        process.exit(1);
      }
    }
  }
}

async function testPerformance() {
  console.log('\n--- Test 4: Performance with Large Malformed Content ---');

  const agent = new Agent(new MockMalformedProvider() as any, 'test-model');

  // Create large malformed content (>2000 chars)
  const largeContent = '{"path":"."}'.repeat(200) + '<|call|>commentary'.repeat(100);

  const startTime = Date.now();
  try {
    const result = (agent as any).parseManualToolCalls(largeContent);
    const endTime = Date.now();
    const duration = endTime - startTime;

    if (duration < 1000) {
      console.log(`PASS: Large content parsing completed in ${duration}ms`);
    } else {
      console.error(`FAIL: Large content parsing too slow: ${duration}ms`);
      process.exit(1);
    }

    if (Array.isArray(result)) {
      console.log(`PASS: Large content returns valid array (${result.length} results)`);
    } else {
      console.error('FAIL: Large content should return array');
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`FAIL: Exception with large content: ${error.message}`);
    process.exit(1);
  }
}

async function runTests() {
  try {
    await testExactErrorPattern();
    await testToolExtraction();
    await testNullSafety();
    await testPerformance();

    console.log('\n✅ All malformed tool call parsing tests passed!');
    console.log('The fix successfully handles the gurubot/gpt-oss-derestricted:20b model output');
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

runTests();
