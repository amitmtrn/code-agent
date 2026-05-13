import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `http://${url}`;
  }
  return url;
}

const configSchema = z.object({
  REPLICATE_API_TOKEN: z.string().optional(),
  OLLAMA_BASE_URL: z.preprocess((val) => {
    if (typeof val === 'string') {
      return normalizeUrl(val);
    }
    return val;
  }, z.string()).default('http://localhost:11434'),
  DEFAULT_PROVIDER: z.enum(['ollama', 'replicate']).default('ollama'),
  DEFAULT_MODEL: z.string().default('llama3'),
  DEEP_THINKING: z.preprocess((val) => val === 'true', z.boolean()).default(false),
  MAX_THINKING_LOOPS: z.preprocess((val) => val ? parseInt(val as string, 10) : undefined, z.number()).default(5),
});

export type Config = z.infer<typeof configSchema>;

// Function to get fallback Ollama URLs in case the primary one fails
export function getOllamaFallbackUrls(primaryUrl: string): string[] {
  const fallbacks = [
    primaryUrl,
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://host.docker.internal:11434',
  ];

  // Remove duplicates while preserving order
  return [...new Set(fallbacks)];
}

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
