"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
const registry_1 = require("../tools/registry");
const chalk_1 = __importDefault(require("chalk"));
class Agent {
    constructor(provider, model, systemPrompt = 'You are a helpful coding assistant with access to tools. Use them to help the user.') {
        this.provider = provider;
        this.model = model;
        this.messages = [];
        this.messages.push({ role: 'system', content: systemPrompt });
    }
    async chat(userInput) {
        this.messages.push({ role: 'user', content: userInput });
        let loop = true;
        while (loop) {
            console.log(chalk_1.default.blue('Thinking...'));
            const response = await this.provider.chat({
                model: this.model,
                messages: this.messages,
                tools: registry_1.registry.getDefinitions(),
            });
            const { message, toolCalls } = response;
            const assistantMessage = {
                ...message,
                tool_calls: toolCalls,
            };
            this.messages.push(assistantMessage);
<<<<<<< Updated upstream
            if (message.reasoning) {
                console.log(chalk_1.default.gray(`\nReasoning: ${message.reasoning}`));
            }
=======
>>>>>>> Stashed changes
            if (message.content) {
                console.log(chalk_1.default.green('\nAssistant:'), message.content);
            }
            if (toolCalls && toolCalls.length > 0) {
                for (const toolCall of toolCalls) {
                    console.log(chalk_1.default.yellow(`\nExecuting tool: ${toolCall.function.name}`));
                    console.log(chalk_1.default.gray(`Arguments: ${toolCall.function.arguments}`));
                    try {
                        const result = await registry_1.registry.execute(toolCall.function.name, toolCall.function.arguments);
                        console.log(chalk_1.default.cyan('Result:'), result.length > 100 ? result.substring(0, 100) + '...' : result);
                        this.messages.push({
                            role: 'tool',
                            content: result,
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                        });
                    }
                    catch (e) {
                        console.error(chalk_1.default.red(`Tool execution error: ${e.message}`));
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
                loop = false;
            }
        }
    }
}
exports.Agent = Agent;
