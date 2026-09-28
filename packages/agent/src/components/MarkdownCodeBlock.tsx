'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Check, Clipboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
export interface MarkdownCodeBlockLabels {
  copied: string;
  copy: string;
  copyAria: string;
}

interface MarkdownCodeBlockProps {
  children?: ReactNode;
  labels?: MarkdownCodeBlockLabels;
}

export default function MarkdownCodeBlock({
  children,
  labels,
}: MarkdownCodeBlockProps): ReactElement {
  return labels ? (
    <CodeBlock labels={labels}>{children}</CodeBlock>
  ) : (
    <TranslatedCodeBlock>{children}</TranslatedCodeBlock>
  );
}

function TranslatedCodeBlock({
  children,
}: MarkdownCodeBlockProps): ReactElement {
  const translate = useTranslations('agent.markdownCodeBlock');
  return (
    <CodeBlock
      labels={{
        copied: translate('copied'),
        copy: translate('copy'),
        copyAria: translate('copyAria'),
      }}
    >
      {children}
    </CodeBlock>
  );
}

function CodeBlock({
  children,
  labels,
}: MarkdownCodeBlockProps & { labels: MarkdownCodeBlockLabels }): ReactElement {
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
          tooltip={hasCopied ? labels.copied : labels.copy}
          tooltipPosition="top"
          ariaLabel={labels.copyAria}
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
