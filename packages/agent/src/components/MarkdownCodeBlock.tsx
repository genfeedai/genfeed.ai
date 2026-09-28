'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Check, Clipboard } from 'lucide-react';
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  useState,
} from 'react';

/** Recursively flatten a rendered code block back to its raw text. */
function extractNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => extractNodeText(child)).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractNodeText(node.props.children);
  }
  return '';
}

/**
 * A fenced code block with a copy button. The only stateful piece of
 * `SafeMarkdown`, split out so the rest of it renders on the server: the
 * changelog ships its release notes as HTML instead of a markdown parser.
 */
export default function MarkdownCodeBlock({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  const [hasCopied, setHasCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(extractNodeText(children));
      setHasCopied(true);
      window.setTimeout(() => setHasCopied(false), 2000);
    } catch {
      setHasCopied(false);
    }
  }

  return (
    <div className="group/code relative my-2 max-w-full">
      <pre className="max-w-full overflow-x-auto rounded-lg">{children}</pre>
      <div className="absolute right-1.5 top-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/code:opacity-100 sm:group-focus-within/code:opacity-100">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          tooltip={hasCopied ? 'Copied' : 'Copy code'}
          tooltipPosition="top"
          ariaLabel="Copy code block"
          onClick={() => void handleCopy()}
        >
          {hasCopied ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <Clipboard className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
