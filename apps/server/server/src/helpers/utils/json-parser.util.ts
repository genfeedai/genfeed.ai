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
      // Continue to regex extraction
    }

    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
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
