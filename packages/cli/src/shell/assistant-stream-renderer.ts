export interface AssistantStreamRenderer {
  finish(): void;
  hasRenderedContent(): boolean;
  onDelta(token: string): void;
  onFinal(content: string): void;
}

interface AssistantStreamRendererOptions {
  prefix?: string;
  write?: (text: string) => void;
}

/**
 * Incrementally writes assistant chunks while retaining enough state to
 * coalesce the final payload. A final payload that extends the rendered prefix
 * writes only the missing suffix; a divergent payload is printed as a complete
 * corrected message so reconnect gaps never leave the terminal with a partial
 * answer.
 */
export function createAssistantStreamRenderer(
  options: AssistantStreamRendererOptions = {}
): AssistantStreamRenderer {
  const prefix = options.prefix ?? '';
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  let activeLine = false;
  let displayedContent = '';
  let finalized = false;

  const begin = () => {
    if (!activeLine) {
      write(prefix);
      activeLine = true;
    }
  };

  return {
    finish() {
      if (activeLine) {
        write('\n');
        activeLine = false;
      }
    },
    hasRenderedContent() {
      return displayedContent.length > 0;
    },
    onDelta(token: string) {
      if (finalized || token.length === 0) {
        return;
      }

      begin();
      write(token);
      displayedContent += token;
    },
    onFinal(content: string) {
      if (finalized) {
        return;
      }
      finalized = true;

      if (!activeLine) {
        if (content) {
          begin();
          write(content);
        }
      } else if (content.startsWith(displayedContent)) {
        write(content.slice(displayedContent.length));
      } else if (content !== displayedContent) {
        write(`\n${prefix}${content}`);
      }

      displayedContent = content;
      if (activeLine) {
        write('\n');
        activeLine = false;
      }
    },
  };
}
