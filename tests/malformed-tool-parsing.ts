import { Agent } from '../src/agent/core';
import { registry } from '../src/tools/registry';

// Mock provider for testing
class MockProvider {
  async chat() {
    return {
      message: { role: 'assistant', content: 'test' },
      toolCalls: []
    };
  }
}

async function testSpecificReportedPattern() {
  console.log('--- Test 1: Specific Reported Error Pattern ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');
  const testContent = '{"path":"."}<|call|>commentary<|channel|>assistant<|channel|>commentary to=tool: list_files';

  const result = (agent as any).parseManualToolCalls(testContent);

  if (result.length === 1) {
    console.log('PASS: Extracted exactly one tool call from malformed content');
  } else {
    console.error(`FAIL: Expected 1 tool call, got ${result.length}`);
    process.exit(1);
  }

  if (result[0].function.name === 'list_files') {
    console.log('PASS: Correctly inferred tool name as list_files');
  } else {
    console.error(`FAIL: Expected tool name 'list_files', got '${result[0].function.name}'`);
    process.exit(1);
  }

  const args = JSON.parse(result[0].function.arguments);
  if (args.path === '.') {
    console.log('PASS: Correctly extracted path argument');
  } else {
    console.error(`FAIL: Expected path '.', got '${args.path}'`);
    process.exit(1);
  }
}

async function testControlTokenCombinations() {
  console.log('\n--- Test 2: Various Control Token Combinations ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const testCases = [
    '{"command":"ls"}<|call|>extra stuff',
    '{"path":"test"}<|channel|>more commentary',
    '{"file_path":"README.md"}<|message|>analysis text',
    '{"content":"data","file_path":"test.txt"}<|constrain|>constraints',
    '{"path":"."}<|start|>beginning text'
  ];

  const expectedTools = ['execute_shell', 'list_files', 'read_file', 'write_file', 'list_files'];

  for (let i = 0; i < testCases.length; i++) {
    const result = (agent as any).parseManualToolCalls(testCases[i]);
    if (result.length === 1 && result[0].function.name === expectedTools[i]) {
      console.log(`PASS: Control token pattern ${i + 1} correctly parsed as ${expectedTools[i]}`);
    } else {
      console.error(`FAIL: Control token pattern ${i + 1}. Expected ${expectedTools[i]}, got ${result[0]?.function.name || 'none'}`);
      process.exit(1);
    }
  }
}

async function testToolNameInference() {
  console.log('\n--- Test 3: Tool Name Inference from Parameters ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const testCases = [
    { input: '{"command": "ls"}', expected: 'execute_shell' },
    { input: '{"file_path": "test.txt"}', expected: 'read_file' },
    { input: '{"content": "data", "file_path": "test.txt"}', expected: 'write_file' },
    { input: '{"path": "/tmp"}', expected: 'list_files' }
  ];

  for (const testCase of testCases) {
    const result = (agent as any).parseManualToolCalls(testCase.input);
    if (result.length === 1 && result[0].function.name === testCase.expected) {
      console.log(`PASS: Correctly inferred ${testCase.expected} from parameters`);
    } else {
      console.error(`FAIL: Expected ${testCase.expected}, got ${result[0]?.function.name || 'none'} for ${testCase.input}`);
      process.exit(1);
    }
  }
}

async function testContextBasedDetection() {
  console.log('\n--- Test 4: Context-Based Tool Name Detection ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const testCases = [
    { input: 'commentary about list files {"path": "."} more commentary', expected: 'list_files' },
    { input: 'we need to read file {"file_path": "test.txt"} for analysis', expected: 'read_file' },
    { input: 'execute shell command {"command": "pwd"} in directory', expected: 'execute_shell' }
  ];

  for (const testCase of testCases) {
    const result = (agent as any).parseManualToolCalls(testCase.input);
    if (result.length === 1 && result[0].function.name === testCase.expected) {
      console.log(`PASS: Context-based detection for ${testCase.expected}`);
    } else {
      console.error(`FAIL: Context-based detection. Expected ${testCase.expected}, got ${result[0]?.function.name || 'none'}`);
      process.exit(1);
    }
  }
}

async function testBackwardCompatibility() {
  console.log('\n--- Test 5: Backward Compatibility with Standard XML Format ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const xmlInput = '<tool_call>{"name": "list_files", "arguments": {"path": "."}}</tool_call>';
  const result = (agent as any).parseManualToolCalls(xmlInput);

  if (result.length === 1) {
    console.log('PASS: Standard XML format still parsed correctly');
  } else {
    console.error(`FAIL: Standard XML parsing. Expected 1 result, got ${result.length}`);
    process.exit(1);
  }

  if (result[0].function.name === 'list_files') {
    console.log('PASS: Standard XML tool name preserved');
  } else {
    console.error(`FAIL: Standard XML tool name. Expected 'list_files', got '${result[0].function.name}'`);
    process.exit(1);
  }
}

async function testGracefulDegradation() {
  console.log('\n--- Test 6: Graceful Degradation on Parsing Failure ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const unparsableInputs = [
    'completely random text with no JSON',
    '{invalid json format',
    '{"malformed": json with no closing',
    'random symbols !@#$%^&*()',
    ''
  ];

  for (const input of unparsableInputs) {
    try {
      const result = (agent as any).parseManualToolCalls(input);
      if (Array.isArray(result)) {
        console.log(`PASS: Graceful degradation for unparsable input (returned ${result.length} results)`);
      } else {
        console.error(`FAIL: Graceful degradation. Expected array, got ${typeof result}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`FAIL: Exception thrown on unparsable input: ${error}`);
      process.exit(1);
    }
  }
}

async function testPerformanceWithLargeContent() {
  console.log('\n--- Test 7: Performance with Large Malformed Content ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  // Create content larger than 2000 characters
  const largeContent = '{"path": "."}'.repeat(200) + '<|call|>commentary'.repeat(100);

  const startTime = Date.now();
  try {
    const result = (agent as any).parseManualToolCalls(largeContent);
    const endTime = Date.now();
    const duration = endTime - startTime;

    if (duration < 1000) { // Should complete within 1 second
      console.log(`PASS: Large content parsing completed in ${duration}ms`);
    } else {
      console.error(`FAIL: Large content parsing too slow: ${duration}ms`);
      process.exit(1);
    }

    if (Array.isArray(result)) {
      console.log(`PASS: Large content returns valid array (${result.length} results)`);
    } else {
      console.error(`FAIL: Large content should return array, got ${typeof result}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`FAIL: Exception with large content: ${error}`);
    process.exit(1);
  }
}

async function testNoExceptionsThrown() {
  console.log('\n--- Test 8: Verify No Exceptions Thrown ---');

  const agent = new Agent(new MockProvider() as any, 'test-model');

  const problematicInputs = [
    '{"path":"."}<|call|>commentary<|channel|>assistant<|channel|>commentary to=tool: list_files',
    '{"command":"ls"}<|call|><|channel|><|message|><|constrain|>',
    '{corrupted json}<|start|>text',
    null as any,
    undefined as any,
    123 as any,
    {} as any
  ];

  for (let i = 0; i < problematicInputs.length; i++) {
    try {
      const result = (agent as any).parseManualToolCalls(problematicInputs[i]);
      console.log(`PASS: No exception thrown for problematic input ${i + 1}`);
    } catch (error) {
      console.error(`FAIL: Exception thrown for input ${i + 1}: ${error}`);
      process.exit(1);
    }
  }
}

async function runTests() {
  try {
    await testSpecificReportedPattern();
    await testControlTokenCombinations();
    await testToolNameInference();
    await testContextBasedDetection();
    await testBackwardCompatibility();
    await testGracefulDegradation();
    await testPerformanceWithLargeContent();
    await testNoExceptionsThrown();

    console.log('\n🎉 All malformed tool call parsing tests passed!');
  } catch (error) {
    console.error('Test suite failed with error:', error);
    process.exit(1);
  }
}

runTests();