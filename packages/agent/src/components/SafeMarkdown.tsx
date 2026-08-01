import { Code } from '@genfeedai/ui';
import type { ReactElement, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function isSafeHref(href?: string): boolean {
  if (!href) {
    return false;
  }

  const normalized = href.trim().toLowerCase();
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('mailto:')
  );
}

/**
 * Soft-structure capability-style answers like:
 *   Batch content generation: Create 5–50 posts…
 * into markdown list items with bold labels when the model did not emit
 * real list/heading markup. Leaves real markdown alone.
 */
export function enhanceAssistantMarkdown(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return content;
  }

  // Already structured — do not rewrite.
  if (
    /^\s*[-*+]\s/m.test(trimmed) ||
    /^\s*\d+\.\s/m.test(trimmed) ||
    /^#{1,3}\s/m.test(trimmed) ||
    /```/.test(trimmed) ||
    /^\s*\|.+\|/m.test(trimmed)
  ) {
    return content;
  }

  const lines = content.split('\n');
  let labelLineCount = 0;
  for (const line of lines) {
    if (isCapabilityLabelLine(line)) {
      labelLineCount += 1;
    }
  }

  // Only rewrite when there is a real list of labeled capabilities.
  if (labelLineCount < 2) {
    return content;
  }

  const rewritten = lines.map((line) => {
    const match = line.match(/^([A-Za-z][^:\n]{0,72}):\s+(.+)$/);
    if (!match) {
      return line;
    }
    const [, label, rest] = match;
    return `- **${label.trim()}:** ${rest.trim()}`;
  });

  // Keep list items contiguous so GFM does not split on blank lines.
  return rewritten.join('\n').replace(/(^- .+\n)\n+(?=- )/gm, '$1');
}

function isCapabilityLabelLine(line: string): boolean {
  return /^[A-Za-z][^:\n]{0,72}:\s+\S/.test(line.trim());
}

interface SafeMarkdownProps {
  content: string;
  className?: string;
  /** When true, lightly structure plain "Label: text" lines into lists. */
  enhanceStructure?: boolean;
}

export function SafeMarkdown({
  content,
  className,
  enhanceStructure = false,
}: SafeMarkdownProps): ReactElement {
  const renderedContent = enhanceStructure
    ? enhanceAssistantMarkdown(content)
    : content;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }): ReactElement => {
            if (!isSafeHref(href)) {
              return <span>{children as ReactNode}</span>;
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
              >
                {children}
              </a>
            );
          },
          p: ({ children }): ReactElement => (
            <p className="my-2.5 first:mt-0 last:mb-0 leading-7 text-foreground/92">
              {children}
            </p>
          ),
          ul: ({ children }): ReactElement => (
            <ul className="my-3 list-disc space-y-2 pl-5 marker:text-foreground/35">
              {children}
            </ul>
          ),
          ol: ({ children }): ReactElement => (
            <ol className="my-3 list-decimal space-y-2 pl-5 marker:text-foreground/45">
              {children}
            </ol>
          ),
          li: ({ children }): ReactElement => (
            <li className="leading-7 text-foreground/90 pl-0.5">{children}</li>
          ),
          strong: ({ children }): ReactElement => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          h1: ({ children }): ReactElement => (
            <h3 className="mb-2 mt-5 text-base font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }): ReactElement => (
            <h3 className="mb-2 mt-5 text-base font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }): ReactElement => (
            <h4 className="mb-1.5 mt-4 text-sm font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h4>
          ),
          code: ({ className: codeClassName, children }): ReactElement => {
            const isBlockCode =
              typeof codeClassName === 'string' &&
              codeClassName.includes('language-');

            if (!isBlockCode) {
              return <Code className="text-[0.9em]">{children}</Code>;
            }

            return (
              <Code display="block" size="sm" className="bg-muted/70">
                {children}
              </Code>
            );
          },
        }}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  );
}
