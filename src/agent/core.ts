import { Provider, Message, ToolCall } from '../providers/types';
import { registry } from '../tools/registry';
import chalk from 'chalk';

export class Agent {
  private messages: Message[] = [];

  constructor(
    private provider: Provider,
    private model: string,
    private deepThinking: boolean = false,
    private maxThinkingLoops: number = 2,
    systemPrompt: string = `You are a helpful, interactive coding assistant. 
When greeted or asked general questions, respond conversationally. 
You have access to tools that can help with coding tasks. 
Use tools ONLY when necessary to complete a specific user request like reading a file, listing directory contents, or running a shell command. 
NEVER output raw JSON function call syntax or any other technical tool-calling format directly to the user. 
If you decide to use a tool, do so through the internal tool-calling mechanism. 
Always prioritize being helpful and clear in your human-readable responses.

After you provide a final response (without tool calls), you will be asked to evaluate if you are satisfied. 
If you are satisfied that you have fully answered the user's request with high quality, respond with the exact keyword: <SATISFIED>. 
If you are NOT satisfied, explain why and continue your investigation or refine your answer.`
  ) {
    const toolDefinitions = registry.getDefinitions();
    const toolInstructions = `

# Tools
You have access to the following tools:
${toolDefinitions.map(t => `- ${t.name}: ${t.description}. Parameters: ${JSON.stringify(t.parameters)}`).join('\n')}

If your model does not support native tool calling, you can call tools manually by using the following XML-like format in your response:
<tool_call>{"name": "tool_name", "arguments": {"arg1": "value1"}}</tool_call>`;

    this.messages.push({ role: 'system', content: systemPrompt + toolInstructions });
  }

  private parseManualToolCalls(content: string): ToolCall[] {
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    const matches = [...content.matchAll(toolCallRegex)];
    
    return matches.map((match, index) => {
      try {
        const call = JSON.parse(match[1]);
        return {
          id: `manual_${index}_${Date.now()}`,
          type: 'function',
          function: {
            name: call.name,
            arguments: typeof call.arguments === 'string' 
              ? call.arguments 
              : JSON.stringify(call.arguments),
          },
        };
      } catch (e) {
        return null as any;
      }
    }).filter(tc => tc !== null);
  }

  async chat(userInput: string): Promise<void> {
    this.messages.push({ role: 'user', content: userInput });

    let loop = true;
    let thinkingCount = 0;

    while (loop) {
      console.log(chalk.blue('Thinking...'));
      
      const response = await this.provider.chat({
        model: this.model,
        messages: this.messages,
        tools: registry.getDefinitions(),
      });

      const { message, toolCalls: providerToolCalls } = response;
      
      // Combine provider tool calls with manually parsed ones if necessary
      let toolCalls = providerToolCalls;
      if ((!toolCalls || toolCalls.length === 0) && message.content) {
        toolCalls = this.parseManualToolCalls(message.content);
      }

      const assistantMessage: Message = {
        ...message,
        tool_calls: toolCalls,
      };
      this.messages.push(assistantMessage);

      if (message.reasoning) {
        console.log(chalk.gray(`\nReasoning: ${message.reasoning}`));
      }

      if (message.content && !message.content.includes('<SATISFIED>')) {
        const prefix = thinkingCount > 0 ? '\nAssistant (Refining):' : '\nAssistant:';
        // Strip manual tool call tags from display output
        const displayContent = message.content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
        if (displayContent) {
          console.log(chalk.green(prefix), displayContent);
        }
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
        // No tool calls, check if we should reflect
        if (this.deepThinking && thinkingCount < this.maxThinkingLoops) {
          // Check if this message was a <SATISFIED> response
          if (message.content?.includes('<SATISFIED>')) {
            loop = false;
          } else {
            // Trigger reflection
            thinkingCount++;
            console.log(chalk.magenta(`\n(Self-Evaluating ${thinkingCount}/${this.maxThinkingLoops}...)`));
            this.messages.push({
              role: 'user',
              content: 'Are you satisfied with this response? If yes, respond with <SATISFIED>. If no, please continue or improve your answer.'
            });
          }
        } else {
          loop = false;
        }
      }
    }
  }
}
