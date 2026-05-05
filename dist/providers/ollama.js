"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const ollama_1 = require("ollama");
const config_1 = require("../config");
const chalk_1 = __importDefault(require("chalk"));
class OllamaProvider {
    constructor() {
        this.verifiedModels = new Set();
        this.client = new ollama_1.Ollama({ host: config_1.config.OLLAMA_BASE_URL });
    }
    async ensureModelExists(model) {
        if (this.verifiedModels.has(model))
            return;
        try {
            const { models } = await this.client.list();
            const exists = models.some(m => m.name === model ||
                m.name === `${model}:latest` ||
                m.name.split(':')[0] === model);
            if (!exists) {
                console.log(chalk_1.default.blue(`\n📥 Model ${model} not found locally. Pulling...`));
                await this.client.pull({ model });
                console.log(chalk_1.default.green(`✅ Model ${model} pulled successfully.\n`));
            }
            this.verifiedModels.add(model);
        }
        catch (error) {
            console.warn(chalk_1.default.yellow(`\n⚠️  Could not verify or pull model ${model}: ${error.message}`));
            // Continue anyway, as the chat might still work if the check failed due to other reasons
        }
    }
    async chat(options) {
        await this.ensureModelExists(options.model);
        const response = await this.client.chat({
            model: options.model,
            messages: options.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                thinking: msg.reasoning,
                reasoning_content: msg.reasoning,
                tool_call_id: msg.tool_call_id,
                name: msg.name,
                tool_calls: msg.tool_calls?.map(tc => ({
                    type: 'function',
                    function: {
                        name: tc.function.name,
                        arguments: JSON.parse(tc.function.arguments),
                    },
                })),
            })),
            tools: options.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                },
            })),
        });
        const message = response.message;
        return {
            message: {
                role: message.role,
                content: message.content,
                reasoning: message.thinking || message.reasoning_content,
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
exports.OllamaProvider = OllamaProvider;
