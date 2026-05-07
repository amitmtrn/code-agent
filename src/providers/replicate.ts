import Replicate from 'replicate';
import { Provider, ChatOptions, ChatResponse, Message, ToolCall } from './types';
import { config } from '../config';

export class ReplicateProvider implements Provider {
  private client: Replicate;

  constructor() {
    if (!config.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not set');
    }
    this.client = new Replicate({
      auth: config.REPLICATE_API_TOKEN,
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    // Replicate's API varies by model. 
    // For this implementation, we'll assume a model that supports tool use via a specific format,
    // or we use the 'official' chat models if available.
    // Llama 3 on Replicate often uses a specific input schema.
    
    const input: any = {
      prompt: this.formatPrompt(options.messages),
      system_prompt: options.messages.find(m => m.role === 'system')?.content,
    };

    const output: any = await this.client.run(options.model as any, { input });

    // Handle output which might be an array of strings (streamed) or a single string
    let content = Array.isArray(output) ? output.join('') : output;

    // Extract reasoning if present (e.g. wrapped in <thought> or <think> tags)
    let reasoning: string | undefined;
    const thoughtMatch = content.match(/<(thought|think)>([\s\S]*?)<\/\1>/);
    if (thoughtMatch) {
      reasoning = thoughtMatch[2].trim();
      content = content.replace(/<(thought|think)>([\s\S]*?)<\/\1>/, '').trim();
    }

    return {
      message: {
        role: 'assistant',
        content,
        reasoning,
      },
    };
  }

  private formatPrompt(messages: Message[]): string {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        let displayContent = m.content;
        if (m.reasoning) {
          displayContent = `<thought>\n${m.reasoning}\n</thought>\n${displayContent}`;
        }

        if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
          const calls = m.tool_calls.map(tc => `<tool_call>${JSON.stringify({ name: tc.function.name, arguments: JSON.parse(tc.function.arguments) })}</tool_call>`).join('\n');
          return `${m.role}: ${displayContent}${displayContent ? '\n' : ''}${calls}`;
        }
        if (m.role === 'tool') {
          return `tool result (${m.name}): ${displayContent}`;
        }
        return `${m.role}: ${displayContent}`;
      })
      .join('\n');
  }
}
