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
/**
 * Walk a candidate JSON string and fix two common model mistakes inside
 * string literals: invalid backslash escapes (e.g. `\'`) and raw newlines.
 * Outside strings the input is passed through unchanged. We do NOT try to
 * "interpret" the escape — for an illegal `\x`, we simply drop the backslash
 * so the literal character survives, matching the model's apparent intent.
 */
const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
function repairInvalidEscapes(s: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    // Inside a string literal.
    if (ch === '\\') {
      const next = s[i + 1];
      if (next !== undefined && VALID_ESCAPES.has(next)) {
        out += ch + next;
        i++;
      } else if (next !== undefined) {
        // Illegal escape — drop the backslash, keep the next char verbatim.
        out += next;
        i++;
      } else {
        // Trailing backslash with nothing after — drop it.
      }
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      out += '\\r';
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Strip non-JSON garbage tokens that appear *outside* string literals between
 * structural punctuation. Models occasionally hallucinate random words inside
 * the JSON skeleton — observed cases include Turkish/CJK fragments after a
 * closing brace, e.g.:
 *
 *   "arguments": { "command": "npm start" } işlemler }
 *
 * After a `}` or `]` token the next meaningful char must be `,`, `}`, `]`, or
 * end-of-input. Anything else (letters, identifiers, punctuation other than
 * separators) is garbage; we drop chars until the grammar lines up again.
 * Whitespace is preserved so error messages stay readable.
 */
function stripGarbageBetweenValues(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  let lastWasClose = false; // last non-ws char outside a string was } or ]
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      lastWasClose = false;
      continue;
    }
    // Outside string. If we're sitting right after a } or ] and the next
    // non-whitespace char isn't , } ] (or another closer), it's garbage —
    // skip it without emitting.
    if (lastWasClose && /\S/.test(ch) && ch !== ',' && ch !== '}' && ch !== ']') {
      continue;
    }
    if (/\S/.test(ch)) {
      lastWasClose = (ch === '}' || ch === ']');
    }
    out += ch;
  }
  return out;
}

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
      // Repair pass 1: fix invalid escape sequences inside string literals.
      // Some models (gemma3, llama variants) leak JS-style escapes like `\'`
      // or stray `\<char>` into JSON content fields. JSON's grammar only
      // accepts \" \\ \/ \b \f \n \r \t \uXXXX — anything else makes
      // JSON.parse throw at the very first occurrence. We walk the string
      // (tracking string-literal state) and drop the backslash from any
      // illegal escape so the surviving character is kept verbatim.
      // Also covers raw newlines inside strings (replace with \n).
      try {
        parsed = JSON.parse(repairInvalidEscapes(jsonStr));
      } catch (innerE) {
        // Repair pass 2: strip garbage tokens that appear between `}`/`]` and
        // the next separator (handles hallucinated foreign-word tokens in the
        // JSON skeleton). Compose with the escape-repair so we cover both.
        try {
          parsed = JSON.parse(stripGarbageBetweenValues(repairInvalidEscapes(jsonStr)));
        } catch (innerE2) {
          // Repair pass 3: close an unterminated trailing object by appending `}`s.
          let repaired = jsonStr.trim();
          while (repaired.length > 0 && !repaired.endsWith('}')) {
            repaired += '}';
            try {
              parsed = JSON.parse(stripGarbageBetweenValues(repairInvalidEscapes(repaired)));
              break;
            } catch (retryE) {
              if (repaired.length > jsonStr.length + 10) throw retryE;
            }
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
