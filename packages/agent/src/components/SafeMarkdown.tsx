import type { ReactElement, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Code } from '@ui/src/primitives/code';

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

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

export function SafeMarkdown({
  content,
  className,
}: SafeMarkdownProps): ReactElement {
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
                className="underline decoration-dotted underline-offset-2"
              >
                {children}
              </a>
            );
          },
          code: ({ className: codeClassName, children }): ReactElement => {
            const isBlockCode =
              typeof codeClassName === 'string' &&
              codeClassName.includes('language-');

            if (!isBlockCode) {
              return (
                <Code className="text-[0.9em]">
                  {children}
                </Code>
              );
            }

            return (
              <Code display="block" size="sm" className="bg-muted/70">
                {children}
              </Code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
