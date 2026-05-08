import { Agent } from '../src/agent/core';
import { registry } from '../src/tools/registry';
import { listFilesTool, readFileTool } from '../src/tools/fs';
import { OllamaProvider } from '../src/providers/ollama';
import { ReplicateProvider } from '../src/providers/replicate';
import { Provider } from '../src/providers/types';
import * as dotenv from 'dotenv';

dotenv.config();

// Register tools
registry.register(listFilesTool);
registry.register(readFileTool);

async function runTest() {
  console.log('--- Final Project Investigation Verification ---');

  const providerName = process.env.DEFAULT_PROVIDER || 'ollama';
  const model = process.env.DEFAULT_MODEL || 'llama2';

  console.log(`Using Provider: ${providerName}, Model: ${model}`);

  let provider: Provider;
  if (providerName === 'ollama') {
    provider = new OllamaProvider();
  } else if (providerName === 'replicate') {
    provider = new ReplicateProvider();
  } else {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  const agent = new Agent(provider, model, true, 5);

  let toolCalls: any[] = [];
  const originalExecute = registry.execute;
  registry.execute = async (name, args) => {
    console.log(`[TEST] Intercepted tool call: ${name} with args: ${args}`);
    toolCalls.push({ name, args });
    return await originalExecute(name, args);
  };

  // Capture output to check for keywords
  let capturedOutput = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedOutput += args.join(' ') + '\n';
    originalLog(...args);
  };

  try {
    console.log('Question: what is this project about?');
    await agent.chat('what is this project about?');

    console.log('\n--- Assertions ---');

    // 1. Tool Usage Assertion
    if (toolCalls.length >= 1) {
      console.log(`PASS: Agent used ${toolCalls.length} tools for investigation.`);
    } else {
      console.log(`FAIL: Agent used 0 tools. It should have investigated the project.`);
      process.exit(1);
    }

    // 2. Inspect Tool Selection
    const targetedRelevantFile = toolCalls.some(tc => {
      const args = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
      return args.includes('package.json') || args.includes('src') || args.includes('readme') || args.includes('.');
    });

    if (targetedRelevantFile) {
      console.log('PASS: Agent targeted relevant files/directories.');
    } else {
      console.log('FAIL: Agent did not target package.json, src, or readme.');
      process.exit(1);
    }

    // 3. Validate Response Content
    const lowerOutput = capturedOutput.toLowerCase();
    const hasKeywords = ['typescript', 'agent', 'ollama', 'replicate', 'cli', 'node'].some(k => lowerOutput.includes(k));
    const hasHallucinations = ['rust', 'main.rs', 'struct.rs', 'lib/'].some(k => lowerOutput.includes(k));

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

    // 4. Verify loop termination (if agent.chat finished, it terminated)
    console.log('PASS: Agent successfully terminated investigation loop.');

    console.log('\nALL PROJECT INVESTIGATION ASSERTIONS PASSED');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    console.log = originalLog;
  }
}

runTest();
