'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ArticleContentProps } from '@props/content/public-article.props';
import { Button } from '@ui/primitives/button';
import { copyText } from '@web-components/creator/copy-text';
import {
  ArrowUpRight,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  ListTree,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WEBSITE_ANALYTICS_EVENTS } from '../../../../../../src/analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '../../../../../../src/analytics/posthog-client';
import ArticleCompareSlider from './article-compare-slider';
import { hasArticleExperience } from './article-experience-slugs';
import ArticleGenerationBlock from './article-generation-block';
import { splitArticleBody } from './article-generations';

/** Only one article has a lab; the rest never download it. */
const ArticleExperience = dynamic(() => import('./article-experience'));

const COPIED_RESET_MS = 2000;
/** A block this short has nothing to fold away, so it only gets Copy. */
const MIN_COLLAPSIBLE_LINES = 5;

interface CodeBlockAction {
  code: string;
  isCollapsible: boolean;
  key: string;
  mount: HTMLElement;
  /** The `pre` the collapse button folds, for `aria-controls`. */
  preId: string;
  wrapper: HTMLElement;
}

function CodeBlockActions({
  action,
}: {
  action: CodeBlockAction;
}): React.ReactElement {
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async (): Promise<void> => {
    setIsCopied(await copyText(action.code));
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
  };

  const handleToggle = (): void => {
    const nextIsCollapsed = !isCollapsed;
    // The block is author markup that React does not own, so the folded state
    // is written to the wrapper the stylesheet reads.
    action.wrapper.dataset.collapsed = String(nextIsCollapsed);
    setIsCollapsed(nextIsCollapsed);
  };

  return (
    <div className="flex gap-1">
      <Button
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.MICRO}
        ariaLabel="Copy this prompt"
        tooltip={isCopied ? 'Copied' : 'Copy'}
        onClick={handleCopy}
      >
        {isCopied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </Button>
      {action.isCollapsible ? (
        <Button
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.MICRO}
          ariaLabel={
            isCollapsed ? 'Expand this prompt' : 'Collapse this prompt'
          }
          aria-controls={action.preId}
          aria-expanded={!isCollapsed}
          tooltip={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={handleToggle}
        >
          {isCollapsed ? (
            <ChevronsUpDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronsDownUp className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      ) : null}
      <span className="sr-only" role="status">
        {isCopied ? 'Copied' : ''}
      </span>
    </div>
  );
}

/**
 * Article bodies are sanitized HTML, so the copy and collapse buttons cannot be
 * authored as JSX inside the content. Each `pre` is wrapped after render and
 * given a portal mount instead: React owns the buttons, the browser owns the
 * markup, and neither has to know about the other.
 */
export default function ArticleContent({
  applyHref,
  generations = {},
  sanitizedHtml,
  sections = [],
  slug,
  resource,
}: ArticleContentProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [actions, setActions] = useState<CodeBlockAction[]>([]);
  const headings = sections.filter((section) => section.level === 2);

  // Prose between generation blocks stays author HTML; each block becomes a
  // component, so its buttons are real React controls.
  const segments = useMemo(
    () => splitArticleBody(sanitizedHtml),
    [sanitizedHtml],
  );

  useEffect(() => {
    const container = containerRef.current;

    // `sanitizedHtml` is read here rather than only in render: the wrappers below are
    // attached to DOM that React replaces wholesale when the body changes, so
    // this effect genuinely depends on it.
    if (!container || !sanitizedHtml) {
      return;
    }

    const mounted = [...container.querySelectorAll('pre')].map(
      (pre, index): CodeBlockAction => {
        // Read the code before mounting anything: once the portal renders, the
        // button's own label would be part of the block's text content.
        const code = pre.textContent ?? '';
        const preId = `code-block-${index}-content`;
        pre.id ||= preId;

        const wrapper = document.createElement('div');
        wrapper.className = 'gen-code-block';
        pre.replaceWith(wrapper);
        wrapper.append(pre);

        const mount = document.createElement('div');
        mount.className = 'gen-code-block-action';
        wrapper.append(mount);

        return {
          code,
          isCollapsible:
            code.trimEnd().split('\n').length >= MIN_COLLAPSIBLE_LINES,
          key: `code-block-${index}`,
          mount,
          preId: pre.id,
          wrapper,
        };
      },
    );

    setActions(mounted);

    return () => {
      for (const action of mounted) {
        const wrapper = action.mount.parentElement;
        action.mount.remove();
        action.wrapper.removeAttribute('data-collapsed');
        // Unwrap so a re-render starts from the original markup rather than
        // nesting a second wrapper around every block.
        const pre = wrapper?.firstElementChild;
        if (wrapper && pre) {
          wrapper.replaceWith(pre);
        }
      }
    };
  }, [sanitizedHtml]);

  return (
    <div>
      <div className="mb-8 border-y border-foreground/10 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-foreground/50">
              <ListTree className="size-3.5" aria-hidden="true" />
              Explore this article
            </div>
            {headings.length > 0 ? (
              <nav
                aria-label="Article sections"
                className="flex flex-wrap gap-x-3 gap-y-1 lg:hidden"
              >
                {headings.map((heading) => (
                  <Link
                    className="text-left text-sm text-foreground/60 hover:text-foreground"
                    href={`#${heading.id}`}
                    key={heading.id}
                  >
                    {heading.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            <p
              className={
                headings.length > 0
                  ? 'hidden text-sm text-foreground/60 lg:block'
                  : 'text-sm text-foreground/60'
              }
            >
              Read the guide, then turn it into a concrete plan for your brand.
            </p>
          </div>

          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <a
              className="shrink-0"
              href={
                resource
                  ? `https://github.com/genfeedai/skills/tree/master/${resource.module}/${resource.skill}`
                  : applyHref
              }
              onClick={() => {
                if (resource && slug)
                  captureWebsiteAnalyticsEvent(
                    WEBSITE_ANALYTICS_EVENTS.ARTICLE_CTA_CLICKED,
                    {
                      articleSlug: slug,
                      skillSlug: resource.skill,
                      action: 'skill',
                    },
                  );
              }}
              rel="noopener noreferrer"
              target="_blank"
            >
              {resource ? 'Get the free skill' : 'Apply this guide'}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>

      {hasArticleExperience(slug) ? <ArticleExperience slug={slug} /> : null}

      <div className="gen-article-prose prose prose-invert prose-lg max-w-none">
        <div ref={containerRef}>
          {segments.map((segment) => {
            if (segment.kind === 'html') {
              return (
                <div
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: each segment is a slice of the sanitized article body
                  dangerouslySetInnerHTML={{ __html: segment.html }}
                  key={segment.key}
                />
              );
            }
            if (segment.kind === 'compare') {
              return (
                <ArticleCompareSlider
                  compare={segment.compare}
                  key={segment.key}
                />
              );
            }
            const generation = generations[segment.ingredientId];
            return generation ? (
              <ArticleGenerationBlock
                generation={generation}
                key={segment.key}
              />
            ) : null;
          })}
        </div>
        {actions.map((action) =>
          createPortal(
            <CodeBlockActions action={action} />,
            action.mount,
            action.key,
          ),
        )}
      </div>
    </div>
  );
}
