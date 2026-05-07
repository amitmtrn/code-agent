import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  REPLICATE_API_TOKEN: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  DEFAULT_PROVIDER: z.enum(['ollama', 'replicate']).default('ollama'),
  DEFAULT_MODEL: z.string().default('llama3'),
  DEEP_THINKING: z.preprocess((val) => val === 'true', z.boolean()).default(false),
  MAX_THINKING_LOOPS: z.preprocess((val) => val ? parseInt(val as string, 10) : undefined, z.number()).default(2),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid configuration:', result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const config = loadConfig();
