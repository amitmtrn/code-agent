import { Provider, Message, ToolCall } from '../providers/types';
import { registry } from '../tools/registry';
import { parseJsonResponse } from './parse';
import { emitMessage, emitToolUse, emitToolResult, emitResult, emitError, emitInfo, UsageStats } from '../output/emit';
import { runtime } from '../runtime';
import chalk from 'chalk';

const PLAN_MODE_ADDENDUM = `

### PLAN MODE ACTIVE
You are in PLAN MODE. Only read-only tools (list_files, read_file) are available. write_file and execute_shell are blocked.

## Hard requirement: investigate before planning
A plan that does not reference specific files in this project is NOT a plan — it is a generic template, and will be rejected. Before setting satisfied:true you MUST:
1. Call list_files on '.' to see the project layout.
2. Read package.json (or the equivalent manifest) to know what kind of project this is, what dependencies exist, what scripts are defined.
3. Read README.md and any obviously relevant source files to understand existing structure.
4. Only AFTER 2-5 read-only tool calls should you produce the plan.

If the user's request can already be satisfied by code that exists, your plan should say so and propose extending it — not propose building from scratch.

## Required plan format
When satisfied:true, the 'message' field MUST be a markdown document with these sections, in this order:

\`\`\`
## Context
2-4 sentences: what the user asked for, and what you found during investigation that shapes the approach.

## Approach
A short paragraph describing the chosen approach and why (one main tradeoff if relevant).

## Files to modify
- \`path/to/file.ts\` — what changes and why. Reference real symbols/functions you saw during investigation.
- \`path/to/other.ts\` — what changes and why.
(One bullet per file. Use real paths from this project, not placeholder paths.)

## New files
- \`path/to/new.ts\` — purpose and rough contents (or "none" if nothing new).

## Dependencies
Any new packages to install (or "none").

## Verification
Concrete commands or steps the user can run to confirm it works end-to-end. Include actual commands, not vague descriptions.
\`\`\`

A plan with placeholder file paths, generic phrases like "create a file to store tasks", or no references to actual project files is unacceptable. If you don't know enough to fill in real paths, you haven't investigated enough — keep reading.

The user will review your plan and either approve it (you exit plan mode and execute) or ask for revisions. Do not attempt to execute yourself.`;

export class Agent {
  private messages: Message[] = [];

  constructor(
    private provider: Provider,
    private model: string,
    private deepThinking: boolean = false,
    private maxThinkingLoops: number = 5,
    private planMode: boolean = false,
    systemPrompt: string = `You are a concise, capable coding assistant. Use tools to gather facts before answering questions about the current project — never hallucinate file structure or contents.

You operate autonomously. DO NOT ask the user clarifying questions like "which file should I edit?" or "what content should I add?". The user has already given you a complete request — your job is to investigate the project with tools (list_files, read_file) and then act (write_file, execute_shell). If something is ambiguous, make a reasonable choice based on the project's conventions and proceed. A response whose 'message' field is a question to the user is never an acceptable final answer.

You MUST ALWAYS respond in the following JSON format, and NOTHING ELSE. No conversational text before or after the JSON block. DO NOT use any XML tags like <tool_call> or <thinking>.

### Mandatory JSON Schema:
{
  "thought": "brief internal note about what you're doing next",
  "tool_call": { "name": "tool_name", "arguments": { "arg1": "value1" } } | null,
  "message": "your user-facing response",
  "satisfied": true | false
}

### Field rules:
- **thought**: One short sentence. Not a multi-step plan.
- **tool_call**: Use a tool when you need data you don't already have. Null otherwise.
- **message**: While investigating, keep it to one short sentence stating what you're checking ("Reading the README."). When satisfied:true, this is the final answer — it MUST directly answer the user's ORIGINAL question, not summarize the last file you happened to read. Aim for 2-4 sentences unless detail was explicitly requested.
- **satisfied**: true only when the message fully answers the original question. false while still gathering info.

### How to investigate a project:
1. Start with 'list_files' on '.' to see what exists.
2. Read the README first (README.md, readme/index.md) — it usually contains the answer to "what is this project."
3. Check package.json / manifest files for name, description, dependencies.
4. Only dive into source files when the question is specifically about implementation, not when it's a general overview.

Do not chain tool calls beyond what the question requires. If the README answered "what is this project about", stop and answer — don't keep reading config files.

### Example: project overview question

User: "what is this project about?"

Turn 1:
{
  "thought": "Need to see project layout first.",
  "tool_call": { "name": "list_files", "arguments": { "path": "." } },
  "message": "Checking the project layout.",
  "satisfied": false
}

Turn 2 (after seeing README.md in the listing):
{
  "thought": "README will describe the project.",
  "tool_call": { "name": "read_file", "arguments": { "path": "README.md" } },
  "message": "Reading the README.",
  "satisfied": false
}

Turn 3 (after reading README — answer the ORIGINAL question):
{
  "thought": "Have enough to answer.",
  "tool_call": null,
  "message": "Codagent is a CLI coding agent inspired by Claude Code. It supports multiple model providers (Ollama for local models, Replicate for cloud models) and ships built-in tools for reading/writing files and running shell commands. It also has an optional deep-thinking mode for self-reflection loops.",
  "satisfied": true
}

### Example: simple question, no tools needed

User: "What's 2+2?"
{
  "thought": "Arithmetic.",
  "tool_call": null,
  "message": "4.",
  "satisfied": true
}`
  ) {
    const toolDefinitions = registry.getDefinitions({ readOnlyOnly: this.planMode });
    const toolList = toolDefinitions.map(t => `- ${t.name}: ${t.description}. Parameters: ${JSON.stringify(t.parameters)}`).join('\n');

    const toolInstructions = `

# Available Tools
${toolList}`;

    const pwdContext = `

# Working Directory
pwd: ${process.cwd()}
All relative paths in tool calls (e.g. 'list_files' with path '.', or 'read_file' with path 'README.md') resolve against this directory. This is the project the user is asking about — investigate THIS directory, not any other.

# Working Directory Persistence — IMPORTANT
Each \`execute_shell\` call runs in a fresh subshell that starts at the project root above. \`cd subdir\` inside one call does NOT carry over to the next call. Consequences:
- If you need to work inside a subdirectory (e.g. \`backend\`), chain the commands together with \`&&\` in the SAME execute_shell call: \`cd backend && npm install && node index.js\`. A subsequent call like \`npm install\` after a prior \`cd backend\` will run in the project root, not in backend.
- read_file / write_file / list_files / create_directory resolve relative paths against the project root above — not against any prior \`cd\`. If you Glob'd \`backend/\` and saw \`index.js\`, the read path is \`backend/index.js\`, not \`index.js\`.
- When a path lookup fails with ENOENT, the error tells you the absolute path that was tried — re-read it carefully, you almost certainly forgot a parent directory.

# Verifying backgrounded servers
A backgrounded command (\`nohup ... &\`) returns immediately with empty stdout regardless of whether the server actually came up — for example, \`nohup npm start &\` silently does nothing if there's no \`start\` script in package.json. To know if it really started, chain a quick probe in the SAME call:
  \`nohup npm start > /tmp/server.log 2>&1 & sleep 1 && curl --max-time 5 http://localhost:PORT/ && echo OK || (echo FAILED && tail -50 /tmp/server.log)\`

If you need to \`cd\` into a subdirectory first, wrap the whole chain in \`sh -c '...'\` — \`nohup\` CANNOT wrap a bare \`cd\` (it's a shell builtin, not an executable). The correct form is:
  \`nohup sh -c 'cd backend && npm start' > /tmp/server.log 2>&1 & sleep 1 && curl --max-time 5 http://localhost:3001/ && echo OK || (echo FAILED && tail -50 /tmp/server.log)\`
Do NOT write \`nohup cd backend && npm start &\` — that runs \`cd\` under nohup (which fails) and then \`npm start\` separately.

If the probe fails, read /tmp/server.log to see why the server died.`;

    const finalPrompt = systemPrompt + (this.planMode ? PLAN_MODE_ADDENDUM : '') + pwdContext + toolInstructions;
    this.messages.push({ role: 'system', content: finalPrompt });
  }

  isInPlanMode(): boolean {
    return this.planMode;
  }

  exitPlanMode(): void {
    if (!this.planMode) return;
    this.planMode = false;
    this.messages.push({
      role: 'user',
      content: 'PLAN APPROVED. You are no longer in plan mode. All tools are now available. Execute the plan you just proposed. Do not re-summarize it — just start carrying it out.',
    });
  }

  async chat(userInput: string): Promise<void> {
    this.messages.push({ role: 'user', content: userInput });

    let loop = true;
    let thinkingCount = 0;
    let consecutiveNoToolCalls = 0;
    let totalToolCalls = 0;
    let lastContent = '';
    let lastToolActions: { name: string; args: string; result: string }[] = [];
    const totalUsage: UsageStats = { input_tokens: 0, output_tokens: 0 };

    while (loop) {
      thinkingCount++;
      if (thinkingCount > this.maxThinkingLoops * 2) {
        emitError('Maximum turns reached. Ending loop.');
        break;
      }

      if (lastToolActions.length > 0) {
        const summary = lastToolActions.map(a => `- Executed tool '${a.name}' with arguments: ${a.args}\n  Result: ${a.result.length > 200 ? a.result.substring(0, 200) + '...' : a.result}`).join('\n');
        
        this.messages.push({
          role: 'user',
          content: `CONTEXT (Previous Actions):\n${summary}\n\nIMPORTANT: Do not repeat the same failed tool calls. If a tool call returned an error, try a different approach (e.g., list files in the parent directory, check for typos, or use a different tool).`
        });
        lastToolActions = [];
      }

      emitInfo('Thinking...');

      const response = await this.provider.chat({
        model: this.model,
        messages: this.messages,
        // Disable native tools to force JSON format in content
        tools: undefined,
      });

      if (response.usage) {
        totalUsage.input_tokens += response.usage.input_tokens || 0;
        totalUsage.output_tokens += response.usage.output_tokens || 0;
      }

      const { message } = response;
      const content = message.content || '';
      const jsonResponse = parseJsonResponse(content);

      if (!jsonResponse) {
        emitError(`Model failed to provide a valid JSON response. Response: ${content}`);
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

      // Detect when the model itself is reporting a connection problem (no tool call,
      // explicit error language). Real network-layer connection errors are surfaced
      // by the provider directly. Without the no-tool-call guard, this substring match
      // false-positives on valid responses that happen to mention connectivity.
      const hasToolCallInResponse = !!(jsonResponse.tool_call && jsonResponse.tool_call.name);
      const isConnectionError = !hasToolCallInResponse && (
        jsonResponse.thought?.includes('Connection to Ollama server failed') ||
        jsonResponse.message?.includes('unable to connect to the Ollama server') ||
        jsonResponse.message?.includes("I'm unable to connect to the Ollama server")
      );

      if (isConnectionError) {
        emitError('Connection error detected.');
        if (jsonResponse.message) {
          emitError(jsonResponse.message);
        }
        // End the current chat loop instead of terminating the entire process
        loop = false;
        break;
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

      // Repetition check for failed tool calls — only looks at the most
      // recent invocations of the same tool. A whole-history scan misfires
      // after state-changing retries (e.g. an earlier `node server` that
      // failed because express was missing should NOT keep blocking the
      // call AFTER a successful `npm install express` has run).
      const RECENT_FAILURE_WINDOW = 3;
      let isRepetitiveFailure = false;
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          const toolArgs = tc.function.arguments;

          const recentSameToolMsgs = this.messages
            .map((m, idx) => ({ m, idx }))
            .filter(({ m }) => m.role === 'tool' && m.name === toolName)
            .slice(-RECENT_FAILURE_WINDOW);

          const previouslyFailed = recentSameToolMsgs.some(({ m, idx }) => {
            if (!m.content.toLowerCase().includes('error')) return false;
            const assistantMsg = this.messages[idx - 1];
            if (!(assistantMsg && assistantMsg.role === 'assistant' && assistantMsg.tool_calls)) return false;
            return assistantMsg.tool_calls.some(atc =>
              atc.function.name === toolName &&
              atc.function.arguments === toolArgs
            );
          });

          if (previouslyFailed) {
            emitError(`Repetitive failed tool call detected: ${toolName}`);
            this.messages.push({
              role: 'user',
              content: `ERROR: You are attempting to repeat the same tool call that already failed: '${toolName}' with arguments ${toolArgs}. DO NOT repeat this mistake. You MUST try a different path (e.g., list files first, check for typos, or use a different tool) or admit you cannot proceed.`
            });
            isRepetitiveFailure = true;
            break;
          }
        }
      }

      if (isRepetitiveFailure) {
        consecutiveNoToolCalls = 0;
        continue;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: content, // Keep the original JSON for history
        reasoning: reasoning,
        tool_calls: toolCalls,
      };
      this.messages.push(assistantMessage);

      if (displayContent) {
        emitMessage(displayContent);
      }

      if (toolCalls && toolCalls.length > 0) {
        totalToolCalls += toolCalls.length;
        consecutiveNoToolCalls = 0;
        for (const toolCall of toolCalls) {
          if (this.planMode && !registry.isReadOnly(toolCall.function.name)) {
            const blockMsg = `Error: '${toolCall.function.name}' is blocked in plan mode. You can only investigate with read-only tools. Produce your plan in the 'message' field and set satisfied:true so the user can approve it.`;
            emitInfo(`Plan mode: blocked '${toolCall.function.name}'.`);
            lastToolActions.push({
              name: toolCall.function.name,
              args: toolCall.function.arguments,
              result: blockMsg,
            });
            this.messages.push({
              role: 'tool',
              content: blockMsg,
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
            continue;
          }

          let parsedArgs: any = toolCall.function.arguments;
          try { parsedArgs = JSON.parse(toolCall.function.arguments); } catch { /* keep raw */ }
          emitToolUse(toolCall.function.name, parsedArgs, toolCall.id);

          try {
            const result = await registry.execute(
              toolCall.function.name,
              toolCall.function.arguments
            );

            emitToolResult(toolCall.id, result);

            lastToolActions.push({
              name: toolCall.function.name,
              args: toolCall.function.arguments,
              result: result
            });

            this.messages.push({
              role: 'tool',
              content: result,
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
          } catch (e: any) {
            emitToolResult(toolCall.id, `Error: ${e.message}`);

            lastToolActions.push({
              name: toolCall.function.name,
              args: toolCall.function.arguments,
              result: `Error: ${e.message}`
            });

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
          emitError('Stagnation detected: 3 consecutive turns without tool calls. Ending loop.');
          loop = false;
          break;
        }

        if (content && content === lastContent) {
          emitError('Stagnation detected: Repetitive response. Ending loop.');
          loop = false;
          break;
        }

        lastContent = content;

        // No tool calls, check if we should reflect or if we are satisfied
        if (isSatisfied) {
          // The model is "done" but it just asked the user a clarifying question.
          // For an autonomous agent that's not done — push back instead of exiting
          // with a question masquerading as the answer.
          const trimmedMessage = (displayContent || '').trim();
          const isClarifyingQuestion = trimmedMessage.endsWith('?') && trimmedMessage.length > 0;
          if (isClarifyingQuestion) {
            emitInfo('(Rejecting clarifying question — pushing model to investigate and act.)');
            this.messages.push({
              role: 'user',
              content: "Do not ask the user clarifying questions. You operate autonomously. Investigate the project with list_files / read_file, then make a reasonable choice based on what you find and use write_file or execute_shell to carry out the request. Set satisfied:true only after you have actually done the work."
            });
            consecutiveNoToolCalls = 0;
            continue;
          }

          // Plan mode requires investigation. So do project-related questions.
          const projectKeywords = ['project', 'code', 'repo', 'repository', 'files', 'structure', 'this', 'about', 'work'];
          const isProjectQuestion = projectKeywords.some(k => userInput.toLowerCase().includes(k));
          const needsInvestigation = this.planMode || isProjectQuestion;

          if (needsInvestigation && totalToolCalls === 0) {
            emitInfo('(Enforcing empirical investigation...)');

            // Force list_files to break the hallucination and ensure mandatory investigation
            try {
              const toolName = 'list_files';
              const toolArgs = '{"path":"."}';
              const toolCallId = `mandatory_${Date.now()}`;
              // Emit BEFORE executing so embedding hosts (skuld, etc.) see the
              // tool_use event as real activity instead of a silent run.
              emitToolUse(toolName, JSON.parse(toolArgs), toolCallId);
              const result = await registry.execute(toolName, toolArgs);
              emitToolResult(toolCallId, result);
              totalToolCalls++;

              // Update the assistant message to include the tool call so history is consistent
              assistantMessage.tool_calls = [{
                id: toolCallId,
                type: 'function',
                function: { name: toolName, arguments: toolArgs }
              }];

              this.messages.push({
                role: 'tool',
                content: result,
                tool_call_id: toolCallId,
                name: toolName,
              });
              
              const guidance = this.planMode
                ? 'I have automatically executed list_files for you because plan mode requires investigation before producing a plan. Now read at least one or two relevant files (README.md, package.json, and any obviously-related source files) using read_file, THEN produce a plan in the required markdown format with REAL file paths from this project. Do not set satisfied:true until your plan references actual files you have read.'
                : 'I have automatically executed list_files for you because you are required to investigate the project structure before answering. Please use this information to provide a factual response based on the actual files.';
              this.messages.push({
                role: 'user',
                content: guidance,
              });
              
              // Reset consecutive turns to allow the model to react to the new data
              consecutiveNoToolCalls = 0;
            } catch (e: any) {
              emitError(`Failed to enforce investigation: ${e.message}`);
              loop = false;
            }
          } else {
            loop = false;
          }
        } else if (this.deepThinking && thinkingCount < this.maxThinkingLoops * 2) {
          // Trigger reflection
          const cap = Number.isFinite(this.maxThinkingLoops) ? `${this.maxThinkingLoops * 2}` : '∞';
          emitInfo(`(Self-Evaluating ${thinkingCount}/${cap}...)`);
          this.messages.push({
            role: 'user',
            content: 'CRITICAL SELF-EVALUATION: Are you 100% satisfied that you have fully answered the user request with EMPIRICAL EVIDENCE? You are not yet satisfied and have NOT called a tool in this turn. You MUST use a tool to investigate the project or provide a more complete answer. Hallucinating information without tool use is strictly forbidden.'
          });
        } else {
          loop = false;
        }
      }
    }

    emitResult(totalUsage, this.model);
  }
}
