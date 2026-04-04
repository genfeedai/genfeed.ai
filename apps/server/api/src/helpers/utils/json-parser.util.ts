/**
 * JSON Parser Utility for AI Responses
 *
 * Handles parsing JSON from AI model responses, which may include:
 * - Clean JSON
 * - JSON wrapped in markdown code blocks
 * - JSON with text before/after
 */
export class JsonParserUtil {
  /**
   * Parse JSON from AI response, handling cases where JSON is embedded in text
   *
   * @param content - Raw AI response content
   * @param fallback - Optional fallback value if parsing fails
   * @returns Parsed JSON object
   * @throws Error if parsing fails and no fallback provided
   */
  static parseAIResponse<T>(content: string, fallback?: T): T {
    if (!content || content.trim() === '') {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error('Empty AI response');
    }

    // Try direct parse first (most common case)
    try {
      return JSON.parse(content);
    } catch {
      // Continue to extraction methods
    }

    // Remove markdown code blocks if present
    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try parsing cleaned content
    try {
      return JSON.parse(cleaned);
    } catch {
      // Continue to regex extraction
    }

    // Extract JSON object or array from response
    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through to error
      }
    }

    // Return fallback if provided
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Invalid JSON in AI response: ${content.slice(0, 200)}...`);
  }

  /**
   * Safe parse that never throws - returns null on failure
   */
  static safeParse<T>(content: string): T | null {
    try {
      return JsonParserUtil.parseAIResponse<T>(content);
    } catch {
      return null;
    }
  }
}
