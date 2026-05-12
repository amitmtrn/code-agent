
import { OllamaProvider } from '../src/providers/ollama';
import { config } from '../src/config';

// Define DOMException if not in global (it should be in modern Node)
if (typeof DOMException === 'undefined') {
  (global as any).DOMException = class extends Error {
    constructor(message: string, name: string) {
      super(message);
      this.name = name;
    }
  };
}

// Speed up the 60s timeout
const originalSetTimeout = global.setTimeout;
(global as any).setTimeout = (fn: any, ms: any) => {
  if (ms === 60000) {
    console.log('Intercepted 60s timeout, shortening to 100ms');
    return originalSetTimeout(fn, 100);
  }
  return originalSetTimeout(fn, ms);
};

async function reproduce() {
  console.log('Testing OllamaProvider timeout...');
  const provider = new OllamaProvider();
  
  // Update the fetch mock to handle the abort signal
  (global as any).fetch = async (url: any, options: any) => {
    console.log('Fetch called, waiting for timeout...');
    return new Promise((resolve, reject) => {
      if (options?.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('This operation was aborted', 'AbortError'));
        }
        options.signal.addEventListener('abort', () => {
          console.log('Abort signal received in mock fetch');
          reject(new DOMException('This operation was aborted', 'AbortError'));
        });
      }
    }) as any;
  };

  try {
    await provider.chat({
      model: config.DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'Hello' }],
    });
  } catch (error: any) {
    console.log('\n--- CAUGHT ERROR ---');
    console.log(`Name: ${error.name}`);
    console.log(`Message: ${error.message}`);
    console.log(`Is AbortError: ${error.name === 'AbortError'}`);
    console.log('--------------------\n');
  }
}

reproduce();
