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
    systemPrompt: string = `You are an expert autonomous AI agent. Your goal is to provide high-quality, verified answers.

### Operational Workflow:
1. **Understand**: Analyze the user's request. Identify what you know and what you need to find out.
2. **Investigate**: Use tools to gather data. NEVER guess if you can verify facts using a tool (e.g., list files, read code).
3. **Think & Analyze**: Critically evaluate the data. Look for contradictions or missing pieces.
4. **Respond**: Provide a comprehensive answer based on evidence.

### Tool Usage:
- Use tools through the internal mechanism.
- If your model doesn't support native tool calls, you MUST call tools manually by using the following XML-like format in your response:
<tool_call>{"name": "tool_name", "arguments": {"arg1": "value1"}}</tool_call>
- NEVER output raw JSON to the user.

### Self-Evaluation:
- After each response, you must decide if you have fully solved the problem.
- If you are 100% certain and satisfied, respond with the exact keyword: <SATISFIED>
- If you are NOT satisfied, you MUST identify what is missing and CONTINUE your investigation using tools or further reasoning.
- DO NOT say you are satisfied or confident without using the <SATISFIED> keyword.
- DO NOT repeat yourself. If you are stuck, try a different approach.

When greeted or asked general questions, respond conversationally. For technical tasks, follow the investigative process above.`
  ) {
    const toolDefinitions = registry.getDefinitions();
    const toolList = toolDefinitions.map(t => `- ${t.name}: ${t.description}. Parameters: ${JSON.stringify(t.parameters)}`).join('\n');
    
    const toolInstructions = `

# Available Tools
${toolList}`;

    this.messages.push({ role: 'system', content: systemPrompt + toolInstructions });
  }

  private extractJSONFromMalformed(content: string): ToolCall[] {
    try {
      // Limit content length to avoid performance issues
      const truncatedContent = content.slice(0, 2000);

      // Strategy 1: Find JSON blocks before control tokens
      const controlTokenPattern = /<\|(?:call|channel|message|constrain|start)\|>/;
      const beforeControlTokens = truncatedContent.split(controlTokenPattern)[0];

      // Strategy 2: Extract JSON objects using regex
      const jsonObjectRegex = /\{[^{}]*\}/g;
      const potentialJsons = beforeControlTokens.match(jsonObjectRegex) || [];

      const extractedCalls: ToolCall[] = [];

      for (let i = 0; i < potentialJsons.length; i++) {
        const jsonStr = potentialJsons[i];
        try {
          const parsed = JSON.parse(jsonStr);

          // Strategy 3: Infer tool name from common parameter patterns
          let toolName = '';
          let arguments_obj = {};

          if (typeof parsed === 'object' && parsed !== null) {
            // Check for common parameter patterns and infer tool names
            if (parsed.path !== undefined) {
              toolName = 'list_files';
              arguments_obj = { path: parsed.path };
            } else if (parsed.command !== undefined) {
              toolName = 'execute_shell';
              arguments_obj = { command: parsed.command };
            } else if (parsed.content !== undefined && parsed.file_path !== undefined) {
              toolName = 'write_file';
              arguments_obj = parsed;
            } else if (parsed.file_path !== undefined) {
              toolName = 'read_file';
              arguments_obj = { file_path: parsed.file_path };
            } else {
              // Try to find tool name in surrounding context
              const contextBefore = content.slice(Math.max(0, content.indexOf(jsonStr) - 100), content.indexOf(jsonStr));
              const contextAfter = content.slice(content.indexOf(jsonStr) + jsonStr.length, content.indexOf(jsonStr) + jsonStr.length + 100);
              const fullContext = contextBefore + contextAfter;

              if (fullContext.includes('list_files') || fullContext.includes('list files')) {
                toolName = 'list_files';
                arguments_obj = parsed;
              } else if (fullContext.includes('read_file') || fullContext.includes('read file')) {
                toolName = 'read_file';
                arguments_obj = parsed;
              } else if (fullContext.includes('execute_shell') || fullContext.includes('shell')) {
                toolName = 'execute_shell';
                arguments_obj = parsed;
              } else {
                // Skip if we can't determine tool name
                continue;
              }
            }

            if (toolName) {
              extractedCalls.push({
                id: `malformed_${i}_${Date.now()}`,
                type: 'function',
                function: {
                  name: toolName,
                  arguments: typeof arguments_obj === 'string'
                    ? arguments_obj
                    : JSON.stringify(arguments_obj),
                },
              });
            }
          }
        } catch (e) {
          // Continue trying other JSON objects
          continue;
        }
      }

      return extractedCalls;
    } catch (e) {
      // Log parsing failure for debugging (truncated to avoid log spam)
      const truncatedContent = content.slice(0, 200);
      console.warn(`Failed to extract JSON from malformed content: ${truncatedContent}...`);
      return [];
    }
  }

  private parseManualToolCalls(content: string): ToolCall[] {
    // Strategy 1: Standard XML parsing
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    const matches = [...content.matchAll(toolCallRegex)];

    const xmlParsedCalls = matches.map((match, index) => {
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
        return null;
      }
    }).filter((tc): tc is ToolCall => tc !== null);

    // If XML parsing succeeded, return those results
    if (xmlParsedCalls.length > 0) {
      return xmlParsedCalls;
    }

    // Strategy 2: Fallback to malformed content extraction
    return this.extractJSONFromMalformed(content);
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

      if (message.content) {
        const prefix = thinkingCount > 0 ? '\nAssistant (Refining):' : '\nAssistant:';
        // Strip manual tool call tags and <SATISFIED> from display output
        const displayContent = message.content
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
          .replace(/<SATISFIED>/gi, '')
          .trim();
        
        if (displayContent) {
          console.log(chalk.green(prefix), displayContent);
        }
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

        if (message.content && message.content === lastContent) {
          console.log(chalk.red('\nStagnation detected: Repetitive response. Ending loop.'));
          loop = false;
          break;
        }
        
        lastContent = message.content || '';

        // No tool calls, check if we should reflect
        if (this.deepThinking && thinkingCount < this.maxThinkingLoops) {
          // Check if this message was a <SATISFIED> response
          if (/<SATISFIED>/i.test(message.content || '')) {
            loop = false;
          } else {
            // Trigger reflection
            thinkingCount++;
            console.log(chalk.magenta(`\n(Self-Evaluating ${thinkingCount}/${this.maxThinkingLoops}...)`));
            this.messages.push({
              role: 'user',
              content: 'CRITICAL SELF-EVALUATION: Are you 100% satisfied that this response fully answers the user\'s request and is of the highest quality? If yes, respond with ONLY the exact keyword: <SATISFIED>. If no, you MUST use a tool to continue your investigation.'
            });
          }
        } else {
          loop = false;
        }
      }
    }
  }
}
