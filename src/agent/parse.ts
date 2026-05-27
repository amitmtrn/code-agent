export interface ParsedAgentResponse {
  thought?: string;
  tool_call?: { name?: string; arguments?: any } | null;
  message?: string;
  satisfied?: boolean;
  [key: string]: any;
}

/**
 * Pull the first JSON-object candidate out of arbitrary model output.
 *
 * Some models (e.g. gemma3) batch the entire plan into one reply as multiple
 * markdown-fenced blocks:
 *   ```json
 *   { ...step 1... }
 *   ```
 *   ```json
 *   { ...step 2... }
 *   ```
 * The previous implementation stripped only the outer fence and then used a
 * greedy `\{[\s\S]*\}` regex, which captured everything from the first `{`
 * to the last `}` (fences included) and failed to parse. We now:
 *
 *   1. If the input opens with a fenced block, return the body of just that
 *      first block — anything after is treated as extra steps for next turn.
 *   2. Otherwise, find the first `{` and brace-walk (tracking string state)
 *      to its matching `}`. Strings get the partial slice so the existing
 *      repair logic can still close an unterminated object.
 */
function extractFirstJsonCandidate(text: string): string | null {
  const t = text.trimStart();
  if (!t) return null;

  // Fenced block (```json or ``` ).
  if (t.startsWith('```')) {
    const fenced = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```/);
    if (fenced) return fenced[1].trim();
    // Unterminated opening fence — strip it and continue with the remainder.
    return t.replace(/^```[a-zA-Z]*\s*\n?/, '').trim() || null;
  }

  const start = t.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  // Unbalanced — return the rest so the repair branch can try to close it.
  return t.slice(start);
}

export function parseJsonResponse(content: unknown): ParsedAgentResponse | null {
  if (!content || typeof content !== 'string') return null;

  const jsonStr = extractFirstJsonCandidate(content);
  if (!jsonStr) return null;

  // XML-tag guard: reject when an XML/HTML-style tag appears *outside* the
  // extracted JSON candidate (the surrounding text). Tags inside the JSON
  // string itself are fine. We only see what's outside by comparing the full
  // content against the slice we extracted.
  const trimmedFull = content.trim();
  const candidatePos = trimmedFull.indexOf(jsonStr);
  if (candidatePos !== -1) {
    const prefix = trimmedFull.slice(0, candidatePos);
    const suffix = trimmedFull.slice(candidatePos + jsonStr.length);
    // Strip any trailing fence close (```) — that's not XML.
    const cleanSuffix = suffix.replace(/^\s*```[\s\S]*$/, '').trim();
    const tagRe = /<[a-zA-Z]+[0-9]*\b[^>]*>/;
    if (tagRe.test(prefix) || tagRe.test(cleanSuffix)) {
      console.warn(`Rejected content containing XML tags outside JSON: ${trimmedFull.slice(0, 100)}...`);
      return null;
    }
  }

  try {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // Repair pass 1: escape raw newlines inside string literals.
      try {
        const escapedStr = jsonStr.replace(/"([^"]*)"/g, (_match, p1) => {
          return '"' + p1.replace(/\n/g, '\\n') + '"';
        });
        parsed = JSON.parse(escapedStr);
      } catch (innerE) {
        // Repair pass 2: close an unterminated trailing object by appending `}`s.
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
