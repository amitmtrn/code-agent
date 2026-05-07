import { Provider, Message, ToolCall } from '../providers/types';
import { registry } from '../tools/registry';
import chalk from 'chalk';

export class Agent {
  private messages: Message[] = [];

  constructor(
    private provider: Provider,
    private model: string,
    private deepThinking: boolean = false,
    private maxThinkingLoops: number = 5,
    systemPrompt: string = `You are an expert autonomous AI agent. You MUST ALWAYS respond in the following JSON format, and NOTHING ELSE. No conversational text before or after the JSON block.

### Mandatory JSON Schema:
{
  "thought": "your internal reasoning and plan",
  "tool_call": { "name": "tool_name", "arguments": { "arg1": "value1" } } | null,
  "message": "your user-facing response",
  "satisfied": true | false
}

### Guidelines:
1. **Thought**: Explain your reasoning. What do you know? What do you need to find out?
2. **Tool Call**: Use a tool if you need to gather data. Set to null if no tool is needed.
3. **Message**: Your response to the user. This can be empty if you are only calling a tool.
4. **Satisfied**: Set to true only when you have fully answered the user's request with high confidence.

### Few-Shot Examples:

**Example 1: Investigating with a tool**
User: "What files are in the current directory?"
Response:
{
  "thought": "The user wants to see the file structure. I need to list the files in the current directory.",
  "tool_call": { "name": "list_files", "arguments": { "path": "." } },
  "message": "I'll check the current directory for you.",
  "satisfied": false
}

**Example 2: Final response**
User: "What's 2+2?"
Response:
{
  "thought": "This is a simple arithmetic question that doesn't require tools.",
  "tool_call": null,
  "message": "2 + 2 is 4.",
  "satisfied": true
}

When greeted or asked general questions, follow the JSON format and respond conversationally in the 'message' field.`
  ) {
    const toolDefinitions = registry.getDefinitions();
    const toolList = toolDefinitions.map(t => `- ${t.name}: ${t.description}. Parameters: ${JSON.stringify(t.parameters)}`).join('\n');
    
    const toolInstructions = `

# Available Tools
${toolList}`;

    this.messages.push({ role: 'system', content: systemPrompt + toolInstructions });
  }

  private parseJsonResponse(content: string): any {
    if (!content || typeof content !== 'string') return null;

    try {
      // Find the first occurrence of { and the last occurrence of }
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const jsonStr = jsonMatch[0];
      return JSON.parse(jsonStr);
    } catch (e) {
      // Basic repair attempt: try to fix missing closing braces
      try {
        let repaired = content.trim();
        if (!repaired.endsWith('}')) {
          repaired += '}';
          const secondMatch = repaired.match(/\{[\s\S]*\}/);
          if (secondMatch) return JSON.parse(secondMatch[0]);
        }
      } catch (innerE) {
        // Fallback failed
      }
      
      console.warn(`Failed to parse JSON response: ${content.slice(0, 100)}...`);
      return null;
    }
  }

  async chat(userInput: string): Promise<void> {
    this.messages.push({ role: 'user', content: userInput });

    let loop = true;
    let thinkingCount = 0;
    let consecutiveNoToolCalls = 0;
    let lastContent = '';

    while (loop) {
      console.log(chalk.blue('Thinking...'));
      
      const response = await this.provider.chat({
        model: this.model,
        messages: this.messages,
        // Disable native tools to force JSON format in content
        tools: undefined,
      });

      const { message } = response;
      const content = message.content || '';
      const jsonResponse = this.parseJsonResponse(content);

      if (!jsonResponse) {
        console.error(chalk.red('Error: Model failed to provide a valid JSON response.'));
        this.messages.push({
          role: 'user',
          content: 'INVALID FORMAT. You MUST respond with a valid JSON block following the mandatory schema.'
        });
        thinkingCount++;
        if (thinkingCount >= this.maxThinkingLoops) break;
        continue;
      }

      // Map JSON fields to internal message structure
      const reasoning = jsonResponse.thought || message.reasoning;
      const displayContent = jsonResponse.message || '';
      const isSatisfied = !!jsonResponse.satisfied;
      
      let toolCalls: ToolCall[] | undefined;
      if (jsonResponse.tool_call && jsonResponse.tool_call.name) {
        toolCalls = [{
          id: `json_${Date.now()}`,
          type: 'function',
          function: {
            name: jsonResponse.tool_call.name,
            arguments: typeof jsonResponse.tool_call.arguments === 'string'
              ? jsonResponse.tool_call.arguments
              : JSON.stringify(jsonResponse.tool_call.arguments),
          },
        }];
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: content, // Keep the original JSON for history
        reasoning: reasoning,
        tool_calls: toolCalls,
      };
      this.messages.push(assistantMessage);

      if (reasoning) {
        console.log(chalk.gray(`\nReasoning: ${reasoning}`));
      }

      if (displayContent) {
        const prefix = thinkingCount > 0 ? '\nAssistant (Refining):' : '\nAssistant:';
        console.log(chalk.green(prefix), displayContent);
      }

      if (toolCalls && toolCalls.length > 0) {
        consecutiveNoToolCalls = 0;
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
        consecutiveNoToolCalls++;
        
        // Stagnation detection
        if (consecutiveNoToolCalls >= 3) {
          console.log(chalk.red('\nStagnation detected: 3 consecutive turns without tool calls. Ending loop.'));
          loop = false;
          break;
        }

        if (content && content === lastContent) {
          console.log(chalk.red('\nStagnation detected: Repetitive response. Ending loop.'));
          loop = false;
          break;
        }
        
        lastContent = content;

        // No tool calls, check if we should reflect or if we are satisfied
        if (isSatisfied) {
          loop = false;
        } else if (this.deepThinking && thinkingCount < this.maxThinkingLoops) {
          // Trigger reflection
          thinkingCount++;
          console.log(chalk.magenta(`\n(Self-Evaluating ${thinkingCount}/${this.maxThinkingLoops}...)`));
          this.messages.push({
            role: 'user',
            content: 'CRITICAL SELF-EVALUATION: You are not yet satisfied but have not called a tool. You MUST use a tool to continue your investigation or provide a more complete answer if possible.'
          });
        } else {
          loop = false;
        }
      }
    }
  }
}
