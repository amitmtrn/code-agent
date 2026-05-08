import { Agent } from '../src/agent/core';

// Mock provider for testing
class MockProvider {
  async chat() {
    return {
      message: { role: 'assistant', content: 'test' },
      toolCalls: []
    };
  }
}

async function testJsonExtractionFromNoisyText() {
  console.log('--- Test 1: JSON Extraction from Noisy Text ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');
  const testContent = 'Here is some text before the JSON: {"thought": "thinking", "tool_call": null, "message": "hello", "satisfied": true} and some text after.';

  const result = (agent as any).parseJsonResponse(testContent);

  if (result && result.thought === 'thinking') {
    console.log('PASS: Extracted JSON from noisy text');
  } else {
    console.error(`FAIL: Failed to extract JSON. Result: ${JSON.stringify(result)}`);
    process.exit(1);
  }
}

async function testMissingClosingBraceRepair() {
  console.log('\n--- Test 2: Missing Closing Brace Repair ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');
  const testContent = '{"thought": "repaired", "tool_call": null, "message": "hello", "satisfied": true';

  const result = (agent as any).parseJsonResponse(testContent);

  if (result && result.thought === 'repaired') {
    console.log('PASS: Repaired missing closing brace');
  } else {
    console.error(`FAIL: Failed to repair missing brace. Result: ${JSON.stringify(result)}`);
    process.exit(1);
  }
}

async function testInvalidJsonHandling() {
  console.log('\n--- Test 3: Invalid JSON Handling ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');
  const testContent = 'This is just text with no JSON at all.';

  const result = (agent as any).parseJsonResponse(testContent);

  if (result === null) {
    console.log('PASS: Correctly returned null for no JSON');
  } else {
    console.error(`FAIL: Expected null for invalid JSON, got ${JSON.stringify(result)}`);
    process.exit(1);
  }
}

async function testMalformedJsonButValidStructure() {
  console.log('\n--- Test 4: Malformed JSON but Valid Structure ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');
  const testContent = 'Some text { "broken": "json", missing_quotes: true } more text';

  const result = (agent as any).parseJsonResponse(testContent);

  if (result === null) {
    console.log('PASS: Correctly returned null for malformed JSON structure');
  } else {
    console.error(`FAIL: Expected null for malformed JSON, got ${JSON.stringify(result)}`);
    process.exit(1);
  }
}

async function testNoExceptionsThrown() {
  console.log('\n--- Test 5: Verify No Exceptions Thrown ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const problematicInputs = [
    null as any,
    undefined as any,
    123 as any,
    {},
    '',
    '   ',
    '{{{',
    '}}}'
  ];

  for (let i = 0; i < problematicInputs.length; i++) {
    try {
      const result = (agent as any).parseJsonResponse(problematicInputs[i]);
      console.log(`PASS: No exception thrown for problematic input ${i + 1}`);
    } catch (error) {
      console.error(`FAIL: Exception thrown for input ${i + 1}: ${error}`);
      process.exit(1);
    }
  }
}

async function runTests() {
  try {
    await testJsonExtractionFromNoisyText();
    await testMissingClosingBraceRepair();
    await testInvalidJsonHandling();
    await testMalformedJsonButValidStructure();
    await testNoExceptionsThrown();

    console.log('\n🎉 All JSON parsing tests passed!');
  } catch (error) {
    console.error('Test suite failed with error:', error);
    process.exit(1);
  }
}

runTests();
