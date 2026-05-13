"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
const registry_1 = require("../tools/registry");
const chalk_1 = __importDefault(require("chalk"));
class Agent {
    constructor(provider, model, deepThinking = false, maxThinkingLoops = 5, systemPrompt = `You are an expert autonomous AI agent. You are part of the 'code-agent' project, which is a clone of Claude Code that supports multi-provider model execution via Replicate and Ollama.

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

When greeted or asked general questions, follow the JSON format and respond conversationally in the 'message' field.`) {
        this.provider = provider;
        this.model = model;
        this.deepThinking = deepThinking;
        this.maxThinkingLoops = maxThinkingLoops;
        this.messages = [];
        const toolDefinitions = registry_1.registry.getDefinitions();
        const toolList = toolDefinitions.map(t => `- ${t.name}: ${t.description}. Parameters: ${JSON.stringify(t.parameters)}`).join('\n');
        const toolInstructions = `

# Available Tools
${toolList}`;
        this.messages.push({ role: 'system', content: systemPrompt + toolInstructions });
    }
    parseJsonResponse(content) {
        if (!content || typeof content !== 'string')
            return null;
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
            }
            else if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(cleanedContent)) {
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
            }
            else {
                // If no closing brace, try to find the first opening brace and take everything after it
                const startMatch = cleanedContent.match(/\{[\s\S]*/);
                if (startMatch) {
                    jsonStr = startMatch[0];
                }
            }
            if (!jsonStr)
                return null;
            let parsed;
            try {
                parsed = JSON.parse(jsonStr);
            }
            catch (e) {
                // Try to handle literal newlines in strings before repair
                try {
                    // Replace literal newlines inside double quotes with \n
                    const escapedStr = jsonStr.replace(/"([^"]*)"/g, (match, p1) => {
                        return '"' + p1.replace(/\n/g, '\\n') + '"';
                    });
                    parsed = JSON.parse(escapedStr);
                }
                catch (innerE) {
                    // Basic repair attempt: try to fix missing closing braces
                    let repaired = jsonStr.trim();
                    while (repaired.length > 0 && !repaired.endsWith('}')) {
                        repaired += '}';
                        try {
                            parsed = JSON.parse(repaired);
                            break;
                        }
                        catch (retryE) {
                            if (repaired.length > jsonStr.length + 10)
                                throw retryE;
                        }
                    }
                }
                if (!parsed)
                    throw e;
            }
            if (typeof parsed === 'object' && parsed !== null) {
                if ('thought' in parsed || 'tool_call' in parsed || 'message' in parsed || 'satisfied' in parsed) {
                    return parsed;
                }
            }
            return null;
        }
        catch (e) {
            console.warn(`Failed to parse JSON response: ${content.slice(0, 100)}...`);
            return null;
        }
    }
    async chat(userInput) {
        this.messages.push({ role: 'user', content: userInput });
        let loop = true;
        let thinkingCount = 0;
        let consecutiveNoToolCalls = 0;
        let totalToolCalls = 0;
        let lastContent = '';
        let lastToolActions = [];
        while (loop) {
            thinkingCount++;
            if (thinkingCount > this.maxThinkingLoops * 2) {
                console.log(chalk_1.default.red('\nMaximum turns reached. Ending loop.'));
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
            console.log(chalk_1.default.blue('Thinking...'));
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
                console.error(chalk_1.default.red('Error: Model failed to provide a valid JSON response. Response:'), content);
                this.messages.push({
                    role: 'assistant',
                    content: content
                });
                this.messages.push({
                    role: 'user',
                    content: 'INVALID FORMAT. You MUST respond with a valid JSON block following the mandatory schema. DO NOT use XML tags like <tool_call>.'
                });
                if (thinkingCount >= this.maxThinkingLoops * 2)
                    break;
                continue;
            }
            // Check for connection error responses from providers
            const isConnectionError = jsonResponse.thought?.includes('Connection to Ollama server failed') ||
                jsonResponse.message?.includes('unable to connect to the Ollama server') ||
                jsonResponse.message?.includes("I'm unable to connect to the Ollama server");
            if (isConnectionError) {
                console.log(chalk_1.default.red('\n❌ Connection error detected.'));
                if (jsonResponse.message) {
                    console.log(chalk_1.default.yellow(`\nA: ${jsonResponse.message}`));
                }
                // End the current chat loop instead of terminating the entire process
                loop = false;
                break;
            }
            // Map JSON fields to internal message structure
            const reasoning = jsonResponse.thought || message.reasoning;
            const displayContent = jsonResponse.message || '';
            const isSatisfied = !!jsonResponse.satisfied;
            let toolCalls;
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
            // Repetition check for failed tool calls
            let isRepetitiveFailure = false;
            if (toolCalls && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                    const toolName = tc.function.name;
                    const toolArgs = tc.function.arguments;
                    // Check if this EXACT tool call (name + args) failed previously in this conversation
                    const previouslyFailed = this.messages.some((m, idx) => {
                        if (m.role === 'tool' && m.name === toolName && m.content.toLowerCase().includes('error')) {
                            // Found a tool error for this tool name. Now check if the arguments match the assistant call before it.
                            const assistantMsg = this.messages[idx - 1];
                            if (assistantMsg && assistantMsg.role === 'assistant' && assistantMsg.tool_calls) {
                                return assistantMsg.tool_calls.some(atc => atc.function.name === toolName &&
                                    atc.function.arguments === toolArgs);
                            }
                        }
                        return false;
                    });
                    if (previouslyFailed) {
                        console.log(chalk_1.default.red(`\nRepetitive failed tool call detected: ${toolName}`));
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
            const assistantMessage = {
                role: 'assistant',
                content: content, // Keep the original JSON for history
                reasoning: reasoning,
                tool_calls: toolCalls,
            };
            this.messages.push(assistantMessage);
            if (reasoning) {
                console.log(chalk_1.default.gray(`\nReasoning: ${reasoning}`));
            }
            if (displayContent) {
                const prefix = thinkingCount > 0 ? '\nAssistant (Refining):' : '\nAssistant:';
                console.log(chalk_1.default.green(prefix), displayContent);
            }
            if (toolCalls && toolCalls.length > 0) {
                totalToolCalls += toolCalls.length;
                consecutiveNoToolCalls = 0;
                for (const toolCall of toolCalls) {
                    console.log(chalk_1.default.yellow(`\nExecuting tool: ${toolCall.function.name}`));
                    console.log(chalk_1.default.gray(`Arguments: ${toolCall.function.arguments}`));
                    try {
                        const result = await registry_1.registry.execute(toolCall.function.name, toolCall.function.arguments);
                        console.log(chalk_1.default.cyan('Result:'), result.length > 100 ? result.substring(0, 100) + '...' : result);
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
                    }
                    catch (e) {
                        console.error(chalk_1.default.red(`Tool execution error: ${e.message}`));
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
            }
            else {
                consecutiveNoToolCalls++;
                // Stagnation detection
                if (consecutiveNoToolCalls >= 3) {
                    console.log(chalk_1.default.red('\nStagnation detected: 3 consecutive turns without tool calls. Ending loop.'));
                    loop = false;
                    break;
                }
                if (content && content === lastContent) {
                    console.log(chalk_1.default.red('\nStagnation detected: Repetitive response. Ending loop.'));
                    loop = false;
                    break;
                }
                lastContent = content;
                // No tool calls, check if we should reflect or if we are satisfied
                if (isSatisfied) {
                    // Check if it's a project-related question being answered without investigation
                    const projectKeywords = ['project', 'code', 'repo', 'repository', 'files', 'structure', 'this', 'about', 'work'];
                    const isProjectQuestion = projectKeywords.some(k => userInput.toLowerCase().includes(k));
                    if (isProjectQuestion && totalToolCalls === 0) {
                        console.log(chalk_1.default.yellow('\n(Enforcing empirical investigation...)'));
                        // Force list_files to break the hallucination and ensure mandatory investigation
                        try {
                            const toolName = 'list_files';
                            const toolArgs = '{"path":"."}';
                            const result = await registry_1.registry.execute(toolName, toolArgs);
                            totalToolCalls++;
                            const toolCallId = `mandatory_${Date.now()}`;
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
                            this.messages.push({
                                role: 'user',
                                content: 'I have automatically executed list_files for you because you are required to investigate the project structure before answering. Please use this information to provide a factual response based on the actual files.'
                            });
                            // Reset consecutive turns to allow the model to react to the new data
                            consecutiveNoToolCalls = 0;
                        }
                        catch (e) {
                            console.error(chalk_1.default.red(`Failed to enforce investigation: ${e.message}`));
                            loop = false;
                        }
                    }
                    else {
                        loop = false;
                    }
                }
                else if (this.deepThinking && thinkingCount < this.maxThinkingLoops * 2) {
                    // Trigger reflection
                    console.log(chalk_1.default.magenta(`\n(Self-Evaluating ${thinkingCount}/${this.maxThinkingLoops * 2}...)`));
                    this.messages.push({
                        role: 'user',
                        content: 'CRITICAL SELF-EVALUATION: Are you 100% satisfied that you have fully answered the user request with EMPIRICAL EVIDENCE? You are not yet satisfied and have NOT called a tool in this turn. You MUST use a tool to investigate the project or provide a more complete answer. Hallucinating information without tool use is strictly forbidden.'
                    });
                }
                else {
                    loop = false;
                }
            }
        }
    }
}
exports.Agent = Agent;
