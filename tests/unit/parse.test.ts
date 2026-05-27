import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseJsonResponse } from '../../src/agent/parse';

describe('parseJsonResponse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('parses a clean JSON response with all four schema fields', () => {
    const input = JSON.stringify({
      thought: 'thinking',
      tool_call: { name: 'list_files', arguments: { path: '.' } },
      message: 'ok',
      satisfied: false,
    });
    const result = parseJsonResponse(input);
    expect(result).not.toBeNull();
    expect(result?.thought).toBe('thinking');
    expect(result?.message).toBe('ok');
    expect(result?.satisfied).toBe(false);
    expect(result?.tool_call?.name).toBe('list_files');
  });

  it('parses JSON wrapped in a ```json fenced block', () => {
    const input = '```json\n{"satisfied": true, "message": "done"}\n```';
    const result = parseJsonResponse(input);
    expect(result?.satisfied).toBe(true);
    expect(result?.message).toBe('done');
  });

  it('parses JSON wrapped in a plain ``` fenced block', () => {
    const input = '```\n{"message": "hi", "satisfied": true}\n```';
    const result = parseJsonResponse(input);
    expect(result?.message).toBe('hi');
  });

  it('rejects content with a leading XML tag like <thinking>', () => {
    const input = '<thinking>foo</thinking>\n{"message": "x", "satisfied": true}';
    expect(parseJsonResponse(input)).toBeNull();
  });

  it('rejects content with a trailing XML tag after the JSON', () => {
    // Tag name must satisfy the parser's /<[a-zA-Z]+[0-9]*\b[^>]*>/ regex —
    // underscored names like <tool_call> slip past the \b. Use <reflect> here.
    const input = '{"message": "x", "satisfied": true}\n<reflect>foo</reflect>';
    expect(parseJsonResponse(input)).toBeNull();
  });

  it('accepts embedded XML inside a JSON string value', () => {
    const input = '{"message": "see <tag>x</tag>", "satisfied": true}';
    const result = parseJsonResponse(input);
    expect(result?.message).toBe('see <tag>x</tag>');
  });

  it('repairs literal newlines inside a string field', () => {
    const input = '{"message": "line1\nline2", "satisfied": true}';
    const result = parseJsonResponse(input);
    expect(result?.satisfied).toBe(true);
    expect(result?.message).toContain('line1');
  });

  it('repairs a missing trailing closing brace', () => {
    const input = '{"message": "x", "satisfied": true';
    const result = parseJsonResponse(input);
    expect(result?.satisfied).toBe(true);
  });

  it('trims trailing garbage after the JSON object', () => {
    const input = '{"message": "x", "satisfied": true}   trailing junk text   ';
    const result = parseJsonResponse(input);
    expect(result?.message).toBe('x');
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(parseJsonResponse('')).toBeNull();
    expect(parseJsonResponse('   \n\t  ')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseJsonResponse(null as unknown as string)).toBeNull();
    expect(parseJsonResponse(undefined as unknown as string)).toBeNull();
    expect(parseJsonResponse(42 as unknown as string)).toBeNull();
    expect(parseJsonResponse({} as unknown as string)).toBeNull();
  });

  it('returns null for a JSON object with none of the four known keys', () => {
    const input = '{"foo": "bar", "baz": 1}';
    expect(parseJsonResponse(input)).toBeNull();
  });

  it('accepts a JSON object with only `satisfied`', () => {
    const result = parseJsonResponse('{"satisfied": true}');
    expect(result?.satisfied).toBe(true);
  });

  it('preserves tool_call.arguments when passed as an object (not a string)', () => {
    const input = JSON.stringify({
      tool_call: { name: 'read_file', arguments: { path: 'foo.ts' } },
      satisfied: false,
    });
    const result = parseJsonResponse(input);
    expect(result?.tool_call?.arguments).toEqual({ path: 'foo.ts' });
  });

  it('returns null for irrecoverably malformed JSON without throwing', () => {
    expect(() => parseJsonResponse('{ this is not json at all ::: ')).not.toThrow();
    expect(parseJsonResponse('{ this is not json at all ::: ')).toBeNull();
  });

  it('extracts only the first JSON block when the model emits multiple ```json fences', () => {
    const input = [
      '```json',
      '{"thought": "step 1", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "satisfied": false}',
      '```',
      '```json',
      '{"thought": "step 2", "tool_call": {"name": "read_file", "arguments": {"path": "a"}}, "satisfied": false}',
      '```',
      '```json',
      '{"thought": "step 3", "satisfied": true, "message": "done"}',
      '```',
    ].join('\n');
    const result = parseJsonResponse(input);
    expect(result).not.toBeNull();
    expect(result?.thought).toBe('step 1');
    expect(result?.tool_call?.name).toBe('list_files');
    expect(result?.satisfied).toBe(false);
  });

  it("repairs JS-style invalid escapes like \\' inside a string field", () => {
    // Models sometimes leak `\'` (a JS escape) into JSON content fields,
    // which is illegal in JSON. Parser should recover by dropping the
    // backslash so the apostrophe survives.
    const input = '{"message": "Let\\\'s create a component", "satisfied": false}';
    const result = parseJsonResponse(input);
    expect(result?.message).toBe("Let's create a component");
  });

  it('parses a fenced block whose content contains \\\' invalid escapes', () => {
    // The real-world failure: gemma3 emits valid fenced JSON, but the
    // `content` field has Python/JS-style `\'` inside a code snippet.
    const input = [
      '```json',
      '{',
      '  "thought": "do the thing",',
      '  "tool_call": {',
      '    "name": "write_file",',
      '    "arguments": {',
      '      "path": "frontend/App.js",',
      '      "content": "const url = \\\'http://localhost:3001\\\';"',
      '    }',
      '  },',
      '  "satisfied": false',
      '}',
      '```',
    ].join('\n');
    const result = parseJsonResponse(input);
    expect(result).not.toBeNull();
    expect(result?.tool_call?.name).toBe('write_file');
    expect(result?.tool_call?.arguments?.content).toBe("const url = 'http://localhost:3001';");
  });

  it('extracts the first JSON object when multiple bare objects are concatenated', () => {
    const input =
      '{"thought": "first", "tool_call": {"name": "list_files", "arguments": {"path": "."}}, "satisfied": false}\n' +
      '{"thought": "second", "satisfied": true}';
    const result = parseJsonResponse(input);
    expect(result?.thought).toBe('first');
    expect(result?.tool_call?.name).toBe('list_files');
  });
});
