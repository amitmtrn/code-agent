"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = exports.ToolRegistry = void 0;
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }
    register(tool) {
        this.tools.set(tool.definition.name, tool);
    }
    getTool(name) {
        return this.tools.get(name);
    }
    getDefinitions() {
        return Array.from(this.tools.values()).map(t => t.definition);
    }
    async execute(name, args) {
        const tool = this.getTool(name);
        if (!tool) {
            throw new Error(`Tool ${name} not found`);
        }
        let parsedArgs;
        try {
            parsedArgs = JSON.parse(args);
        }
        catch (e) {
            // Sometimes models might pass the object directly if the provider handles it
            if (typeof args === 'object') {
                parsedArgs = args;
            }
            else {
                throw new Error(`Failed to parse arguments for tool ${name}: ${args}`);
            }
        }
        return await tool.execute(parsedArgs);
    }
}
exports.ToolRegistry = ToolRegistry;
exports.registry = new ToolRegistry();
