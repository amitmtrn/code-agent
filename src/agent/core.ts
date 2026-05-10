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
    systemPrompt: string = `You are an expert autonomous AI agent. You are part of the 'code-agent' project, which is a clone of Claude Code that supports multi-provider model execution via Replicate and Ollama.

You MUST ALWAYS respond in the following JSON format, and NOTHING ELSE. No conversational text before or after the JSON block. DO NOT use any XML tags like <tool_call> or <thinking>.

### Mandatory JSON Schema:
{
  "thought": "your internal reasoning and plan",
  "tool_call": { "name": "tool_name", "arguments": { "arg1": "value1" } } | null,
  "message": "your user-facing response",
  "satisfied": true | false
}

### Workflow:
1. **Understand**: Analyze the user's request. What is the core goal?
2. **Investigate**: If the request requires information about the current project, environment, or files, you MUST use tools to gather facts. NEVER rely on assumptions or hallucinated file structures.
3. **Think & Analyze**: Evaluate the findings from your investigation. Do you have enough information to satisfy the request?
4. **Respond**: Communicate your findings or ask for clarification if needed.

### Critical Rules:
- **No Hallucinations**: NEVER assume you know the project's structure or content. If you haven't called 'list_files', you know nothing about the current directory.
- **Mandatory Investigation**: For any question about "this project", "the code", or "how it works", you MUST perform at least one tool call to investigate.
- **Documentation First**: When investigating a project, look for README files, package manifests (package.json, Cargo.toml), and documentation folders first.

### Guidelines:
1. **Thought**: Explain your progress through the 4-step workflow (Understand, Investigate, Think, Respond).
2. **Tool Call**: Use a tool if you need to gather data. Set to null if no tool is needed.
3. **Message**: Your response to the user. This can be empty if you are only calling a tool.
4. **Satisfied**: Set to true ONLY when you have fully answered the user's request with high confidence. For project-related tasks, high confidence REQUIRES empirical verification.
5. **Empirical Verification**: You MUST use 'list_files' and 'read_file' to understand a project before answering questions about it. Hallucinating files or structure is a critical failure.

### Few-Shot Examples:

**Example 1: Project investigation**
User: "what is this project about?"
Response:
{
  "thought": "UNDERSTAND: The user wants an overview of the project. INVESTIGATE: I don't know the project structure yet. I must list the files to identify key documentation like README or package.json.",
  "tool_call": { "name": "list_files", "arguments": { "path": "." } },
  "message": "I'll start by listing the files in the project to understand its structure.",
  "satisfied": false
}

**Example 2: Following up after list_files**
User: "I've listed the files and I see a 'readme/' folder. What's in it?"
Response:
{
  "thought": "UNDERSTAND: The user wants to know the contents of the 'readme/' folder. INVESTIGATE: I will list the files in that specific directory.",
  "tool_call": { "name": "list_files", "arguments": { "path": "readme" } },
  "message": "Checking the 'readme/' folder for documentation.",
  "satisfied": false
}

**Example 3: Deep Investigation**
User: "What does the config system do?"
Response:
{
  "thought": "UNDERSTAND: User wants to know about the config system. INVESTIGATE: I see src/config.ts in the file list. I need to read its content to understand how it works.",
  "tool_call": { "name": "read_file", "arguments": { "path": "src/config.ts" } },
  "message": "I'm reading the config file to explain how it works.",
  "satisfied": false
}

**Example 4: Final response**
User: "What's 2+2?"
Response:
{
  "thought": "UNDERSTAND: Simple math. No investigation needed. THINK: 2+2=4. RESPOND: Provide answer.",
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

    // Remove code blocks if present
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
    }

    if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(cleanedContent)) {
      // Only reject if it looks like an XML tag that IS NOT inside a JSON string
      const firstBrace = cleanedContent.indexOf('{');
      const lastBrace = cleanedContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const prefix = cleanedContent.substring(0, firstBrace);
        const suffix = cleanedContent.substring(lastBrace + 1);
        if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(prefix) || /<[a-zA-Z]+[0-9]*\b[^>]*>/.test(suffix)) {
          console.warn(`Rejected content containing XML tags outside JSON: ${cleanedContent.slice(0, 100)}...`);
          return null;
        }
      } else if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(cleanedContent)) {
        console.warn(`Rejected content containing XML tags: ${cleanedContent.slice(0, 100)}...`);
        return null;
      }
    }

    try {
      // Find the first occurrence of { and the last occurrence of }
      let jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      let jsonStr = '';
      
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        // If no closing brace, try to find the first opening brace and take everything after it
        const startMatch = cleanedContent.match(/\{[\s\S]*/);
        if (startMatch) {
          jsonStr = startMatch[0];
        }
      }

      if (!jsonStr) return null;

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        // Try to handle literal newlines in strings before repair
        try {
          // Replace literal newlines inside double quotes with \n
          const escapedStr = jsonStr.replace(/"([^"]*)"/g, (match, p1) => {
            return '"' + p1.replace(/\n/g, '\\n') + '"';
          });
          parsed = JSON.parse(escapedStr);
        } catch (innerE) {
          // Basic repair attempt: try to fix missing closing braces
          let repaired = jsonStr.trim();
          while (repaired.length > 0 && !repaired.endsWith('}')) {
            repaired += '}';
            try {
              parsed = JSON.parse(repaired);
              break;
            } catch (retryE) {
              if (repaired.length > jsonStr.length + 10) throw retryE; 
            }
          }
        }
        if (!parsed) throw e;
      }
      
      if (typeof parsed === 'object' && parsed !== null) {
        if ('thought' in parsed || 'tool_call' in parsed || 'message' in parsed || 'satisfied' in parsed) {
          return parsed;
        }
      }
      return null;
    } catch (e) {
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
      thinkingCount++;
      if (thinkingCount > this.maxThinkingLoops * 2) {
        console.log(chalk.red('\nMaximum turns reached. Ending loop.'));
        break;
      }

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
        console.error(chalk.red('Error: Model failed to provide a valid JSON response. Response:'), content);
        this.messages.push({
          role: 'assistant',
          content: content
        });
        this.messages.push({
          role: 'user',
          content: 'INVALID FORMAT. You MUST respond with a valid JSON block following the mandatory schema. DO NOT use XML tags like <tool_call>.'
        });
        if (thinkingCount >= this.maxThinkingLoops * 2) break;
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
        } else if (this.deepThinking && thinkingCount < this.maxThinkingLoops * 2) {
          // Trigger reflection
          console.log(chalk.magenta(`\n(Self-Evaluating ${thinkingCount}/${this.maxThinkingLoops * 2}...)`));
          this.messages.push({
            role: 'user',
            content: 'CRITICAL SELF-EVALUATION: Are you 100% satisfied that you have fully answered the user request with EMPIRICAL EVIDENCE? You are not yet satisfied and have NOT called a tool in this turn. You MUST use a tool to investigate the project or provide a more complete answer. Hallucinating information without tool use is strictly forbidden.'
          });
        } else {
          loop = false;
        }
      }
    }
  }
}
