'use client';

import { modelCatalogHref } from '@data/model-credits';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { buildUntrustedAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import type { ArticleGenerationBlockProps } from '@props/content/public-article.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { copyText } from '@web-components/creator/copy-text';
import { Check, Copy, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { buildRecreatePrompt } from './article-generations';

const COPIED_RESET_MS = 2000;

/**
 * A generation inside an article: what it is, the model that made it, its
 * prompt (collapsed until the reader asks for all of it), and two ways to use
 * it: copy the prompt, or recreate it in Genfeed with the prompt filled in.
 */
export default function ArticleGenerationBlock({
  generation,
}: ArticleGenerationBlockProps): React.ReactElement {
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recreatePrompt = buildRecreatePrompt(generation);

  useEffect(() => {
    return () => clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async (): Promise<void> => {
    if (!generation.prompt) {
      return;
    }
    setIsCopied(await copyText(generation.prompt));
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
  };

  return (
    <figure className="not-prose my-10 border border-foreground/10 bg-foreground/5">
      <div className="space-y-3 p-4 md:p-5">
        <p className="text-sm font-semibold text-foreground">
          <span>{generation.label}</span>
          {generation.modelKey && generation.modelLabel ? (
            <>
              {' · '}
              <Link
                className="font-medium text-foreground/70 hover:text-primary"
                href={modelCatalogHref(generation.modelKey)}
              >
                {generation.modelLabel}
              </Link>
            </>
          ) : null}
        </p>
        {generation.description ? (
          <p className="text-sm text-foreground/70">
            <span className="font-medium text-foreground">What it does: </span>
            {generation.description}
          </p>
        ) : null}
        {generation.prompt ? (
          <div className="space-y-2">
            <p
              className={
                isPromptOpen
                  ? 'whitespace-pre-line font-mono text-xs leading-5 text-foreground/80'
                  : 'line-clamp-3 whitespace-pre-line font-mono text-xs leading-5 text-foreground/80'
              }
            >
              {generation.prompt}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.XS}
                onClick={() => setIsPromptOpen((isOpen) => !isOpen)}
              >
                {isPromptOpen ? 'Show less' : 'See all'}
              </Button>
              <Button
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.XS}
                onClick={handleCopy}
              >
                {isCopied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
                {isCopied ? 'Copied' : 'Copy prompt'}
              </Button>
              {recreatePrompt ? (
                <Button
                  asChild
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.XS}
                  withWrapper={false}
                >
                  <a
                    href={`${EnvironmentService.apps.app}${buildUntrustedAgentPromptHref(recreatePrompt)}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Recreate in Genfeed
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {generation.kind === 'video' ? (
        <video
          className="w-full"
          controls
          height={generation.height}
          playsInline
          preload="metadata"
          src={generation.url}
          width={generation.width}
        >
          <track kind="captions" />
        </video>
      ) : (
        // biome-ignore lint/performance/noImgElement: generated media is served from signed URLs that next/image cannot optimize.
        <img
          alt={generation.description ?? generation.label}
          className="h-auto w-full"
          height={generation.height}
          loading="lazy"
          src={generation.url}
          width={generation.width}
        />
      )}
    </figure>
  );
}
