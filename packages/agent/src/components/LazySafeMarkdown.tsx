'use client';

import type { SafeMarkdown } from '@genfeedai/agent/components/SafeMarkdown';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { type ComponentProps, lazy, Suspense } from 'react';

type LazySafeMarkdownProps = ComponentProps<typeof SafeMarkdown>;

function loadSafeMarkdown() {
  return import('@genfeedai/agent/components/SafeMarkdown').then(
    (markdown) => ({ default: markdown.SafeMarkdown }),
  );
}

// The markdown parser (react-markdown, micromark and GFM) is the largest part
// of the Agent's first-load JavaScript, and nothing on an empty conversation
// needs it. It loads as its own chunk instead, started as soon as this module
// runs in the browser, so it is normally ready before the first message.
if (typeof window !== 'undefined') {
  void loadSafeMarkdown();
}

const SafeMarkdownRenderer = lazy(loadSafeMarkdown);

/**
 * `SafeMarkdown` for the Agent's client surfaces. Until the parser arrives the
 * text shows as plain wrapped lines in the same box, never a blank gap. Server
 * surfaces (the changelog) keep importing `SafeMarkdown` directly so they
 * still render to HTML without shipping a parser.
 */
export function LazySafeMarkdown(props: LazySafeMarkdownProps) {
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            'min-w-0 max-w-full whitespace-pre-wrap break-words leading-6 text-foreground [overflow-wrap:anywhere]',
            props.className,
          )}
        >
          {props.content}
        </div>
      }
    >
      <SafeMarkdownRenderer {...props} />
    </Suspense>
  );
}
