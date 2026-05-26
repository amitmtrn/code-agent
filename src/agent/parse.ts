export interface ParsedAgentResponse {
  thought?: string;
  tool_call?: { name?: string; arguments?: any } | null;
  message?: string;
  satisfied?: boolean;
  [key: string]: any;
}

export function parseJsonResponse(content: unknown): ParsedAgentResponse | null {
  if (!content || typeof content !== 'string') return null;

  let cleanedContent = content.trim();
  if (cleanedContent.startsWith('```')) {
    cleanedContent = cleanedContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
  }

  if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(cleanedContent)) {
    const firstBrace = cleanedContent.indexOf('{');
    const lastBrace = cleanedContent.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      const prefix = cleanedContent.substring(0, firstBrace);
      const suffix = cleanedContent.substring(lastBrace + 1);
      if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(prefix) || /<[a-zA-Z]+[0-9]*\b[^>]*>/.test(suffix)) {
        console.warn(`Rejected content containing XML tags outside JSON: ${cleanedContent.slice(0, 100)}...`);
        return null;
      }
    } else if (/<[a-zA-Z]+[0-9]*\b[^>]*>/.test(cleanedContent)) {
      console.warn(`Rejected content containing XML tags: ${cleanedContent.slice(0, 100)}...`);
      return null;
    }
  }

  try {
    let jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    let jsonStr = '';

    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else {
      const startMatch = cleanedContent.match(/\{[\s\S]*/);
      if (startMatch) {
        jsonStr = startMatch[0];
      }
    }

    if (!jsonStr) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      try {
        const escapedStr = jsonStr.replace(/"([^"]*)"/g, (_match, p1) => {
          return '"' + p1.replace(/\n/g, '\\n') + '"';
        });
        parsed = JSON.parse(escapedStr);
      } catch (innerE) {
        let repaired = jsonStr.trim();
        while (repaired.length > 0 && !repaired.endsWith('}')) {
          repaired += '}';
          try {
            parsed = JSON.parse(repaired);
            break;
          } catch (retryE) {
            if (repaired.length > jsonStr.length + 10) throw retryE;
          }
        }
      }
      if (!parsed) throw e;
    }

    if (typeof parsed === 'object' && parsed !== null) {
      if ('thought' in parsed || 'tool_call' in parsed || 'message' in parsed || 'satisfied' in parsed) {
        return parsed;
      }
    }
    return null;
  } catch (e) {
    const preview = typeof content === 'string' ? content.slice(0, 100) : String(content);
    console.warn(`Failed to parse JSON response: ${preview}...`);
    return null;
  }
}
