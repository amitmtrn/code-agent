import chalk from 'chalk';
import { runtime } from '../runtime';

export interface UsageStats {
  input_tokens: number;
  output_tokens: number;
}

export function emitMessage(text: string): void {
  if (!text) return;
  if (runtime.json) {
    process.stdout.write(JSON.stringify({ type: 'message', content: text }) + '\n');
  } else {
    console.log(chalk.green('\nAssistant:'), text);
  }
}

export function emitToolUse(name: string, args: any, id: string): void {
  if (runtime.json) {
    process.stdout.write(JSON.stringify({
      type: 'tool_use',
      tool_name: name,
      parameters: args,
      tool_id: id,
    }) + '\n');
  } else {
    console.log(chalk.yellow(`\nExecuting tool: ${name}`));
    console.log(chalk.gray(`Arguments: ${typeof args === 'string' ? args : JSON.stringify(args)}`));
  }
}

export function emitToolResult(id: string, output: string): void {
  if (runtime.json) {
    process.stdout.write(JSON.stringify({
      type: 'tool_result',
      tool_id: id,
      output,
    }) + '\n');
  } else {
    const truncated = output.length > 100 ? output.substring(0, 100) + '...' : output;
    console.log(chalk.cyan('Result:'), truncated);
  }
}

export function emitResult(usage: UsageStats, model: string): void {
  if (runtime.json) {
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'Success',
      stats: usage,
      model,
    }) + '\n');
  }
}

export function emitError(message: string): void {
  if (runtime.json) {
    process.stdout.write(JSON.stringify({ type: 'error', message }) + '\n');
  } else {
    console.error(chalk.red(message));
  }
}

export function emitInfo(message: string): void {
  if (runtime.json) return;
  console.log(chalk.gray(message));
}
