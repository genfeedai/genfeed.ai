import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Code } from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import { Check, Clipboard } from 'lucide-react';
import {
  isValidElement,
  memo,
  type ReactElement,
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
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

// Horizontal whitespace only, and no trailing `(.*)$`. `\s` overlaps with `.`
// on spaces but not on `\r`, so `\s+(.*)$` against a marker followed by a run
// of spaces and a stray CR made the engine retry every split of that run —
// quadratic in the line length, on model-authored input. Nothing reads the
// item body here (only the indent and the marker), so the tail is dropped and
// each remaining quantifier is followed by a disjoint class.
const ORDERED_LIST_ITEM = /^([^\S\r\n]*)(\d+)\.[^\S\r\n]/;
const UNORDERED_LIST_ITEM = /^([^\S\r\n]*)([-*+])[^\S\r\n]/;

/**
 * Models often emit:
 *   1. **Title**
 *    body without proper indent
 *
 *   2. **Next**
 * which CommonMark treats as separate `<ol start=1>` blocks (every item shows
 * as "1.") and as loose paragraphs with huge gaps. Indent continuation lines
 * under the open list item so one ordered list stays continuous.
 */
export function normalizeAssistantListMarkdown(content: string): string {
  if (!content.trim()) {
    return content;
  }

  const lines = content.split('\n');
  const out: string[] = [];
  let continuationIndent: number | null = null;

  for (const line of lines) {
    const ordered = line.match(ORDERED_LIST_ITEM);
    const unordered = line.match(UNORDERED_LIST_ITEM);

    if (ordered || unordered) {
      const match = ordered ?? unordered;
      if (!match) {
        out.push(line);
        continue;
      }
      const baseIndent = match[1].length;
      // GFM: content of a list item continues at indent >= marker column + 1.
      // `1. ` is 3 chars at indent 0 → continuation at ≥ 3 spaces.
      const marker = ordered ? `${ordered[2]}. ` : `${unordered?.[2]} `;
      continuationIndent = baseIndent + marker.length;
      out.push(line);
      continue;
    }

    if (continuationIndent === null) {
      out.push(line);
      continue;
    }

    // Blank lines stay — they make loose items but keep the list open so the
    // next `2.` continues the same <ol> instead of restarting at 1.
    if (line.trim() === '') {
      out.push('');
      continue;
    }

    // Fence / heading / horizontal rule ends the list context.
    if (
      /^```/.test(line.trim()) ||
      /^#{1,6}\s/.test(line.trim()) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())
    ) {
      continuationIndent = null;
      out.push(line);
      continue;
    }

    const leading = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (leading >= continuationIndent) {
      out.push(line);
      continue;
    }

    // Unindented body under a list item — pull into the item.
    out.push(`${' '.repeat(continuationIndent)}${line.trimStart()}`);
  }

  // Collapse 3+ blank lines to a single paragraph break.
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Soft-structure capability-style answers like:
 *   Batch content generation: Create 5–50 posts…
 * into markdown list items with bold labels when the model did not emit
 * real list/heading markup. Leaves real markdown alone.
 */
export function enhanceAssistantMarkdown(content: string): string {
  const normalized = normalizeAssistantListMarkdown(content);
  const trimmed = normalized.trim();
  if (!trimmed) {
    return content;
  }

  // Already structured — do not rewrite labels (lists already normalized).
  if (
    /^\s*[-*+]\s/m.test(trimmed) ||
    /^\s*\d+\.\s/m.test(trimmed) ||
    /^#{1,3}\s/m.test(trimmed) ||
    /```/.test(trimmed) ||
    /^\s*\|.+\|/m.test(trimmed)
  ) {
    return normalized;
  }

  const lines = normalized.split('\n');
  let labelLineCount = 0;
  for (const line of lines) {
    if (isCapabilityLabelLine(line)) {
      labelLineCount += 1;
    }
  }

  // Only rewrite when there is a real list of labeled capabilities.
  if (labelLineCount < 2) {
    return normalized;
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

// Hoisted to module scope rather than `useMemo`d inside the component: every
// renderer below only closes over its own render-prop arguments (`href`,
// `children`, `codeClassName`) — none reference `content`, `className`, or
// `enhanceStructure` — so this object can be built once for the whole
// module instead of once per `SafeMarkdown` render. Passing the same
// `components` reference on every render also lets `ReactMarkdown` skip
// re-registering its renderer map.
const SAFE_MARKDOWN_COMPONENTS: Components = {
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
    <p className="my-1.5 first:mt-0 last:mb-0 leading-6 text-foreground">
      {children}
    </p>
  ),
  ul: ({ children }): ReactElement => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }): ReactElement => (
    <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }): ReactElement => (
    <li className="leading-6 text-foreground pl-0.5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
      {children}
    </li>
  ),
  strong: ({ children }): ReactElement => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  h1: ({ children }): ReactElement => (
    <h3 className="mb-1.5 mt-4 text-base font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }): ReactElement => (
    <h3 className="mb-1.5 mt-4 text-base font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }): ReactElement => (
    <h4 className="mb-1 mt-3 text-sm font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h4>
  ),
  code: ({ className: codeClassName, children }): ReactElement => {
    const isBlockCode =
      typeof codeClassName === 'string' && codeClassName.includes('language-');

    if (!isBlockCode) {
      // Inline code must wrap — mono tokens are the #1 horizontal overflow
      // source in agent failure dumps.
      return (
        <Code className="break-all text-[0.9em] [overflow-wrap:anywhere]">
          {children}
        </Code>
      );
    }

    return (
      <Code
        display="block"
        size="sm"
        className="max-w-full min-w-0 overflow-x-auto break-words bg-muted/70 whitespace-pre-wrap"
      >
        {children}
      </Code>
    );
  },
  pre: ({ children }): ReactElement => (
    <MarkdownCodeBlock>{children}</MarkdownCodeBlock>
  ),
  br: (): ReactElement => <br className="leading-none" />,
};

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

function MarkdownCodeBlock({
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

// Same rationale as `SAFE_MARKDOWN_COMPONENTS` — a fresh `[remarkGfm]` array
// literal on every render defeats `react-markdown`'s own memoization of its
// processor pipeline.
const SAFE_MARKDOWN_REMARK_PLUGINS = [remarkGfm];

function SafeMarkdownInner({
  content,
  className,
  enhanceStructure = false,
}: SafeMarkdownProps): ReactElement {
  // `enhanceAssistantMarkdown` walks the full string (list normalization +
  // capability-line detection) on every call — cache it per `content` so a
  // parent re-render with unchanged `content` doesn't re-run the transform.
  const renderedContent = useMemo(
    () => (enhanceStructure ? enhanceAssistantMarkdown(content) : content),
    [content, enhanceStructure],
  );

  return (
    <div
      className={cn(
        'min-w-0 max-w-full break-words [overflow-wrap:anywhere]',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={SAFE_MARKDOWN_REMARK_PLUGINS}
        skipHtml
        components={SAFE_MARKDOWN_COMPONENTS}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  );
}

export const SafeMarkdown = memo(SafeMarkdownInner);
