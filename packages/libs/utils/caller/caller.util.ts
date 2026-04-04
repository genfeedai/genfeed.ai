/**
 * CallerUtil - Utility for extracting function names from call stack
 *
 * Provides utilities for reflection and debugging purposes,
 * such as getting the name of the calling function.
 *
 * @example
 * // Get the name of the function that called this utility
 * const functionName = CallerUtil.getCallerName();
 * // Returns: "findMeBrands" (or the actual calling function name)
 */
export class CallerUtil {
  /**
   * Get the name of the calling function from the call stack
   *
   * Extracts the function name from the Error stack trace.
   * Useful for logging and debugging purposes.
   *
   * @param skipFrames - Number of additional stack frames to skip beyond the utility itself (default: 0)
   * @returns The name of the function that called this method, or 'unknown' if unable to determine
   *
   * @example
   * // In a controller method:
   * const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
   * // Logs: "UsersController findMe"
   */
  static getCallerName(skipFrames: number = 0): string {
    try {
      const error = new Error();
      const stack = error.stack;
      if (!stack) {
        return 'unknown';
      }

      const stackLines = stack.split('\n');
      // Stack format examples:
      // Line 0: "Error"
      // Line 1: "at getCallerName (file:line:column)" <- utility itself, skip
      // Line 2: "at findMe (file:line:column)" <- caller we want (skipFrames=0)
      // Line 3: "at RouterExecutionContext.execute (...)" <- if skipFrames=1
      // We always skip Error (line 0) and getCallerName (line 1), then add skipFrames
      const targetIndex = 2 + skipFrames;

      if (stackLines.length > targetIndex) {
        const callerLine = stackLines[targetIndex]?.trim();
        if (!callerLine) {
          return 'unknown';
        }

        // Try to match: "at ClassName.methodName" or "ClassName.methodName"
        // Handles both regular and webpack stack formats
        const match = callerLine.match(/(?:at\s+)?(\w+)\.(\w+)/);
        if (match?.[2]) {
          return match[2];
        }

        // Fallback: try to match just method name if format is different
        // Matches patterns like ".methodName (" or ".methodName (webpack://"
        const methodMatch = callerLine.match(/\.(\w+)\s*\(/);
        if (methodMatch?.[1]) {
          return methodMatch[1];
        }

        // Additional fallback: match method name before parentheses
        const methodBeforeParen = callerLine.match(/(\w+)\s*\(/);
        if (methodBeforeParen?.[1]) {
          return methodBeforeParen[1];
        }
      }
    } catch (_error) {
      // If stack parsing fails, return unknown
      // Silently handle errors to prevent breaking the application
    }
    return 'unknown';
  }
}
