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

    // If tools are provided, we'd normally need to add them to the prompt 
    // since many Replicate models don't have a native 'tools' parameter in their primary API.
    // However, some newer ones do. For simplicity in this clone, 
    // we'll inject tool definitions into the system prompt if not natively supported.
    
    if (options.tools) {
      input.prompt = `Available tools: ${JSON.stringify(options.tools)}\n\n${input.prompt}`;
    }

    const output: any = await this.client.run(options.model as any, { input });

    // Handle output which might be an array of strings (streamed) or a single string
    const content = Array.isArray(output) ? output.join('') : output;

    // Check for tool calls in the output (simple regex for this clone)
    const toolCalls = this.parseToolCalls(content);

    return {
      message: {
        role: 'assistant',
        content: content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim(),
      },
      toolCalls,
    };
  }

  private formatPrompt(messages: Message[]): string {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
          const calls = m.tool_calls.map(tc => `<tool_call>${JSON.stringify({ name: tc.function.name, arguments: JSON.parse(tc.function.arguments) })}</tool_call>`).join('\n');
          return `${m.role}: ${m.content}${m.content ? '\n' : ''}${calls}`;
        }
        if (m.role === 'tool') {
          return `tool result (${m.name}): ${m.content}`;
        }
        return `${m.role}: ${m.content}`;
      })
      .join('\n');
  }

  private parseToolCalls(content: string): ToolCall[] | undefined {
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    const matches = [...content.matchAll(toolCallRegex)];
    
    if (matches.length === 0) return undefined;

    return matches.map((match, index) => {
      try {
        const call = JSON.parse(match[1]);
        return {
          id: `rep_${index}_${Date.now()}`,
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        };
      } catch (e) {
        return null as any;
      }
    }).filter(tc => tc !== null);
  }
}
