function extractFirstJsonValue(content: string): string | undefined {
  const objectStart = content.indexOf('{');
  const arrayStart = content.indexOf('[');
  if (objectStart < 0 && arrayStart < 0) {
    return undefined;
  }

  const start =
    objectStart < 0
      ? arrayStart
      : arrayStart < 0
        ? objectStart
        : Math.min(objectStart, arrayStart);

  const closers: string[] = [];
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      closers.push('}');
      continue;
    }
    if (char === '[') {
      closers.push(']');
      continue;
    }
    if (char === '}' || char === ']') {
      if (closers.pop() !== char) {
        return undefined;
      }
      if (closers.length === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

// biome-ignore lint/complexity/noStaticOnlyClass: existing call sites import JsonParserUtil as a static helper.
export class JsonParserUtil {
  static parseAIResponse<T>(content: string, fallback?: T): T {
    if (!content || content.trim() === '') {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error('Empty AI response');
    }

    try {
      return JSON.parse(content);
    } catch {
      // Continue to extraction methods
    }

    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      // Continue to brace-matching extraction
    }

    const extracted = extractFirstJsonValue(content);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        // Fall through to error
      }
    }

    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Invalid JSON in AI response: ${content.slice(0, 200)}...`);
  }

  static safeParse<T>(content: string): T | null {
    try {
      return JsonParserUtil.parseAIResponse<T>(content);
    } catch {
      return null;
    }
  }
}
