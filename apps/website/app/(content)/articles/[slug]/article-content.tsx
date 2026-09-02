'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { createMarkup } from '@genfeedai/helpers';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { ArrowUpRight, Check, Copy, ListTree } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ArticleExperience from './article-experience';

const COPIED_RESET_MS = 2000;

interface CodeBlockAction {
  code: string;
  key: string;
  mount: HTMLElement;
}

interface ArticleHeading {
  id: string;
  label: string;
}

function headingId(label: string, index: number): string {
  const normalized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `article-${normalized || 'section'}-${index + 1}`;
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
  articleLabel,
  html,
  slug,
}: {
  articleLabel: string;
  html: string;
  slug?: string;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [actions, setActions] = useState<CodeBlockAction[]>([]);
  const [headings, setHeadings] = useState<ArticleHeading[]>([]);

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

    const nextHeadings = [...container.querySelectorAll('h2')].reduce<
      ArticleHeading[]
    >((result, heading, index) => {
      const label = heading.textContent?.trim();
      if (!label) {
        return result;
      }

      const id = heading.id || headingId(label, index);
      heading.id = id;
      heading.classList.add('scroll-mt-24');
      result.push({ id, label });
      return result;
    }, []);

    setActions(mounted);
    setHeadings(nextHeadings);

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

  const applyHref = useMemo(() => {
    const prompt = `Help me apply the guide "${articleLabel}" to my brand. Ask for any context you need, then turn the article into a concrete content plan and create the first asset.`;
    return `${EnvironmentService.apps.app}${buildAgentPromptHref(prompt)}`;
  }, [articleLabel]);

  return (
    <div>
      <div className="mb-8 border-y border-edge/[0.08] py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-surface/50">
              <ListTree className="size-3.5" aria-hidden="true" />
              Explore this article
            </div>
            {headings.length > 0 ? (
              <nav
                aria-label="Article sections"
                className="flex flex-wrap gap-x-3 gap-y-1"
              >
                {headings.map((heading) => (
                  <Link
                    className="text-left text-sm text-surface/60 hover:text-surface"
                    href={`#${heading.id}`}
                    key={heading.id}
                  >
                    {heading.label}
                  </Link>
                ))}
              </nav>
            ) : (
              <p className="text-sm text-surface/60">
                Read the guide, then turn it into a concrete plan for your
                brand.
              </p>
            )}
          </div>

          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <a
              className="shrink-0"
              href={applyHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              Apply this guide
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>

      <ArticleExperience slug={slug} />

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
    </div>
  );
}
