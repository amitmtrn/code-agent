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
        const output = await this.client.run(options.model, { input });
        // Handle output which might be an array of strings (streamed) or a single string
        let content = Array.isArray(output) ? output.join('') : output;
        return {
            message: {
                role: 'assistant',
                content,
            },
        };
    }
    formatPrompt(messages) {
        return messages
            .filter(m => m.role !== 'system')
            .map(m => {
            if (m.role === 'tool') {
                return `tool result (${m.name}): ${m.content}`;
            }
            return `${m.role}: ${m.content}`;
        })
            .join('\n');
    }
}
exports.ReplicateProvider = ReplicateProvider;
