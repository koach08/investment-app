/**
 * Robust JSON parsing for AI-generated responses.
 * Handles common issues: code fences, trailing commas, BOM, comments.
 */

function cleanJsonString(text: string): string {
  let s = text;
  // Remove BOM
  s = s.replace(/^\uFEFF/, "");
  // Strip markdown code fences (single and multi-line)
  s = s.replace(/^```(?:json)?\s*\n?/i, "");
  s = s.replace(/\n?```\s*$/i, "");
  s = s.trim();
  // Remove single-line comments (// ...) but NOT inside quoted strings.
  // Walk character by character to avoid breaking URLs like "https://..."
  s = removeJsonComments(s);
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([\]}])/g, "$1");
  return s;
}

/** Remove // comments that are NOT inside JSON string values. */
function removeJsonComments(s: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"') {
      // Walk through the entire string literal (including escaped chars)
      out.push(s[i++]);
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) {
          out.push(s[i++]); // backslash
        }
        out.push(s[i++]);
      }
      if (i < s.length) out.push(s[i++]); // closing quote
    } else if (s[i] === '/' && i + 1 < s.length && s[i + 1] === '/') {
      // Skip until end of line
      while (i < s.length && s[i] !== '\n') i++;
    } else {
      out.push(s[i++]);
    }
  }
  return out.join('');
}

/**
 * Extract the outermost JSON object from a string and parse it.
 * Tries multiple strategies to handle AI output quirks.
 */
export function robustJsonParse<T = unknown>(text: string): T | null {
  const cleaned = cleanJsonString(text);

  // Strategy 1: Parse the cleaned string directly
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* continue */ }

  // Strategy 2: Extract outermost { ... }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch { /* continue */ }

    // Strategy 3: Clean the extracted portion (may have inner issues)
    const reCleaned = cleanJsonString(candidate);
    try {
      return JSON.parse(reCleaned) as T;
    } catch { /* continue */ }
  }

  // Strategy 4: Extract outermost [ ... ]
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    const candidate = cleaned.slice(arrStart, arrEnd + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Parse JSON from AI text response, with validation.
 * Returns parsed object if valid, or null.
 */
export function parseAiJson<T>(
  text: string,
  validator?: (obj: T) => boolean
): T | null {
  const parsed = robustJsonParse<T>(text);
  if (parsed === null) return null;
  if (validator && !validator(parsed)) return null;
  return parsed;
}
