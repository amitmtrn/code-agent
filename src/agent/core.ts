import { Provider, Message, ToolCall } from '../providers/types';
import { registry } from '../tools/registry';
import chalk from 'chalk';

export class Agent {
  private messages: Message[] = [];

  constructor(
    private provider: Provider,
    private model: string,
    systemPrompt: string = 'You are a helpful coding assistant with access to tools. Use them to help the user.'
  ) {
    this.messages.push({ role: 'system', content: systemPrompt });
  }

  async chat(userInput: string): Promise<void> {
    this.messages.push({ role: 'user', content: userInput });

    let loop = true;
    while (loop) {
      console.log(chalk.blue('Thinking...'));
      
      const response = await this.provider.chat({
        model: this.model,
        messages: this.messages,
        tools: registry.getDefinitions(),
      });

      const { message, toolCalls } = response;
      const assistantMessage: Message = {
        ...message,
        tool_calls: toolCalls,
      };
      this.messages.push(assistantMessage);

      if (message.reasoning) {
        console.log(chalk.gray(`\nReasoning: ${message.reasoning}`));
      }

      if (message.content) {
        console.log(chalk.green('\nAssistant:'), message.content);
      }

      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          console.log(chalk.yellow(`\nExecuting tool: ${toolCall.function.name}`));
          console.log(chalk.gray(`Arguments: ${toolCall.function.arguments}`));

          try {
            const result = await registry.execute(
              toolCall.function.name,
              toolCall.function.arguments
            );
            
            console.log(chalk.cyan('Result:'), result.length > 100 ? result.substring(0, 100) + '...' : result);

            this.messages.push({
              role: 'tool',
              content: result,
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
          } catch (e: any) {
            console.error(chalk.red(`Tool execution error: ${e.message}`));
            this.messages.push({
              role: 'tool',
              content: `Error: ${e.message}`,
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
          }
        }
      } else {
        loop = false;
      }
    }
  }
}
