import { ToolDefinition } from '../providers/types';

export interface Tool {
  definition: ToolDefinition;
  execute(args: any): Promise<string>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.definition.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async execute(name: string, args: string): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    let parsedArgs;
    try {
      parsedArgs = JSON.parse(args);
    } catch (e) {
      // Sometimes models might pass the object directly if the provider handles it
      if (typeof args === 'object') {
        parsedArgs = args;
      } else {
        throw new Error(`Failed to parse arguments for tool ${name}: ${args}`);
      }
    }

    return await tool.execute(parsedArgs);
  }
}

export const registry = new ToolRegistry();
