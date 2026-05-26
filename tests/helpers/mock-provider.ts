import { ChatOptions, ChatResponse, Message, Provider } from '../../src/providers/types';

export type ScriptedResponse = string | ((messages: Message[]) => string);

export class MockProvider implements Provider {
  public calls: ChatOptions[] = [];
  private index = 0;

  constructor(private responses: ScriptedResponse[]) {}

  async chat(options: ChatOptions): Promise<ChatResponse> {
    this.calls.push(options);

    if (this.index >= this.responses.length) {
      throw new Error(
        `MockProvider exhausted: ${this.calls.length} calls made, only ${this.responses.length} responses scripted.`,
      );
    }

    const next = this.responses[this.index++];
    const content = typeof next === 'function' ? next(options.messages) : next;

    return {
      message: { role: 'assistant', content },
    };
  }

  get callCount(): number {
    return this.calls.length;
  }
}

export function jsonResponse(payload: {
  thought?: string;
  tool_call?: { name: string; arguments: Record<string, any> } | null;
  message?: string;
  satisfied?: boolean;
}): string {
  return JSON.stringify(payload);
}
