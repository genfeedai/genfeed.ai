'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import { createMarkup } from '@utils/sanitize-html';
import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const COPIED_RESET_MS = 2000;

interface CodeBlockAction {
  code: string;
  key: string;
  mount: HTMLElement;
}

function CopyCodeButton({ code }: { code: string }): React.ReactElement {
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async (): Promise<void> => {
    await clipboardService.copyToClipboard(code);
    setIsCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
  };

  return (
    <Button
      variant={ButtonVariant.SECONDARY}
      size={ButtonSize.XS}
      ariaLabel="Copy this prompt"
      className="border border-edge/[0.08] bg-fill/10 text-surface backdrop-blur-sm transition-all hover:border-edge/20 hover:bg-fill/20"
      onClick={handleCopy}
    >
      {isCopied ? (
        <Check className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {isCopied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/**
 * Article bodies are sanitized HTML, so the copy affordance cannot be authored
 * as JSX inside the content. Each `pre` is wrapped after render and given a
 * portal mount instead: React owns the button, the browser owns the markup, and
 * neither has to know about the other.
 */
export default function ArticleContent({
  html,
}: {
  html: string;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [actions, setActions] = useState<CodeBlockAction[]>([]);

  const contentProps = useMemo(
    () => ({ dangerouslySetInnerHTML: createMarkup(html) }),
    [html],
  );

  useEffect(() => {
    const container = containerRef.current;

    // `html` is read here rather than only in render: the wrappers below are
    // attached to DOM that React replaces wholesale when the body changes, so
    // this effect genuinely depends on it.
    if (!container || !html) {
      return;
    }

    const mounted = [...container.querySelectorAll('pre')].map(
      (pre, index): CodeBlockAction => {
        // Read the code before mounting anything: once the portal renders, the
        // button's own label would be part of the block's text content.
        const code = pre.textContent ?? '';

        const wrapper = document.createElement('div');
        wrapper.className = 'gen-code-block';
        pre.replaceWith(wrapper);
        wrapper.append(pre);

        const mount = document.createElement('div');
        mount.className = 'gen-code-block-action';
        wrapper.append(mount);

        return { code, key: `code-block-${index}`, mount };
      },
    );

    setActions(mounted);

    return () => {
      for (const action of mounted) {
        const wrapper = action.mount.parentElement;
        action.mount.remove();
        // Unwrap so a re-render starts from the original markup rather than
        // nesting a second wrapper around every block.
        const pre = wrapper?.firstElementChild;
        if (wrapper && pre) {
          wrapper.replaceWith(pre);
        }
      }
    };
  }, [html]);

  return (
    <div className="gen-article-prose prose prose-invert prose-lg max-w-none">
      <div ref={containerRef} {...contentProps} />
      {actions.map((action) =>
        createPortal(
          <CopyCodeButton code={action.code} />,
          action.mount,
          action.key,
        ),
      )}
    </div>
  );
}
