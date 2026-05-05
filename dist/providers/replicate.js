"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicateProvider = void 0;
const replicate_1 = __importDefault(require("replicate"));
const config_1 = require("../config");
class ReplicateProvider {
    constructor() {
        if (!config_1.config.REPLICATE_API_TOKEN) {
            throw new Error('REPLICATE_API_TOKEN is not set');
        }
        this.client = new replicate_1.default({
            auth: config_1.config.REPLICATE_API_TOKEN,
        });
    }
    async chat(options) {
        // Replicate's API varies by model. 
        // For this implementation, we'll assume a model that supports tool use via a specific format,
        // or we use the 'official' chat models if available.
        // Llama 3 on Replicate often uses a specific input schema.
        const input = {
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
        const output = await this.client.run(options.model, { input });
        // Handle output which might be an array of strings (streamed) or a single string
        let content = Array.isArray(output) ? output.join('') : output;
        // Extract reasoning if present (e.g. wrapped in <thought> or <think> tags)
        let reasoning;
        const thoughtMatch = content.match(/<(thought|think)>([\s\S]*?)<\/\1>/);
        if (thoughtMatch) {
            reasoning = thoughtMatch[2].trim();
            content = content.replace(/<(thought|think)>([\s\S]*?)<\/\1>/, '').trim();
        }
        // Check for tool calls in the output (simple regex for this clone)
        const toolCalls = this.parseToolCalls(content);
        return {
            message: {
                role: 'assistant',
                content: content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim(),
                reasoning,
            },
            toolCalls,
        };
    }
    formatPrompt(messages) {
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
    parseToolCalls(content) {
        const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
        const matches = [...content.matchAll(toolCallRegex)];
        if (matches.length === 0)
            return undefined;
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
            }
            catch (e) {
                return null;
            }
        }).filter(tc => tc !== null);
    }
}
exports.ReplicateProvider = ReplicateProvider;
