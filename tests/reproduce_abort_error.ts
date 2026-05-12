import { OllamaProvider } from '../src/providers/ollama';
import { ChatOptions } from '../src/providers/types';
import * as assert from 'assert';

async function testAbortErrorHandling() {
  console.log('Testing AbortError handling in OllamaProvider...');

  // Mock global fetch to throw AbortError
  const originalFetch = global.fetch;
  (global as any).fetch = async () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    throw error;
  };

  const provider = new OllamaProvider();
  const options: ChatOptions = {
    model: 'test-model',
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  };

  try {
    const response = await provider.chat(options);
    
    console.log('Response content:', response.message.content);

    // Assertions
    assert.ok(response, 'Should return a response');
    assert.ok(response.message, 'Response should have a message');
    
    const content = response.message.content;
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      assert.fail('Response content should be valid JSON');
    }

    assert.ok(parsedContent.message, 'Parsed content should have a message field');
    assert.ok(parsedContent.message.includes('timed out'), 'Message should mention "timed out"');
    assert.ok(parsedContent.message.includes('Use a smaller or more efficient model'), 'Message should provide advice');
    
    console.log('PASS: AbortError handled correctly and returned friendly JSON message');
  } catch (error) {
    console.error('FAIL: chat() threw an exception:', error);
    process.exit(1);
  } finally {
    // Restore original fetch
    global.fetch = originalFetch;
  }
}

testAbortErrorHandling().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
