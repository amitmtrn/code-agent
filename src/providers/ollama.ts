import { Ollama } from 'ollama';
import { Provider, ChatOptions, ChatResponse, Message } from './types';
import { config } from '../config';
import chalk from 'chalk';

export class OllamaProvider implements Provider {
  private client: Ollama;
  private verifiedModels: Set<string> = new Set();

  constructor() {
    this.client = new Ollama({ host: config.OLLAMA_BASE_URL });
  }

  private async ensureModelExists(model: string) {
    if (this.verifiedModels.has(model)) return;

    try {
      const { models } = await this.client.list();
      const exists = models.some(m => 
        m.name === model || 
        m.name === `${model}:latest` || 
        m.name.split(':')[0] === model
      );
      
      if (!exists) {
        console.log(chalk.blue(`\n📥 Model ${model} not found locally. Pulling...`));
        await this.client.pull({ model });
        console.log(chalk.green(`✅ Model ${model} pulled successfully.\n`));
      }
      this.verifiedModels.add(model);
    } catch (error: any) {
      console.warn(chalk.yellow(`\n⚠️  Could not verify or pull model ${model}: ${error.message}`));
      // Continue anyway, as the chat might still work if the check failed due to other reasons
    }
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    await this.ensureModelExists(options.model);

    const response = await this.client.chat({
      model: options.model,
      messages: options.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        tool_call_id: msg.tool_call_id,
        name: msg.name,
        tool_calls: msg.tool_calls?.map(tc => ({
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          },
        })),
      })) as any,
      tools: options.tools?.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })) as any,
    });

    const message = response.message;
    
    return {
      message: {
        role: message.role as any,
        content: message.content,
      },
      toolCalls: message.tool_calls?.map((tc, index) => ({
        id: `call_${index}_${Date.now()}`, // Ollama doesn't always provide IDs
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      })),
    };
  }
}
