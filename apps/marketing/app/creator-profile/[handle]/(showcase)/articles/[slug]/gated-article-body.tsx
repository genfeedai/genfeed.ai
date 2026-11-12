'use client';

import { getSupportCreatorHref } from '@data/app-links';
import { ButtonVariant } from '@genfeedai/contracts';
import { creatorArticlePath } from '@genfeedai/contracts/constants';
import type {
  ArticleAccessView,
  GatedArticleBodyProps,
} from '@props/content/public-article.props';
import { Button } from '@ui/primitives/button';
import { LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import ArticleContent from './article-content';

function paywallMessage(
  handle: string,
  unlockPrice: number | null,
  subscriptionPrice: number | null,
): string {
  const subscribe =
    subscriptionPrice === null
      ? `subscribe to @${handle}`
      : `subscribe to @${handle} for ${subscriptionPrice} credits a month`;
  return unlockPrice === null
    ? `To read it, ${subscribe}.`
    : `Unlock it once for ${unlockPrice} credits, or ${subscribe} to read everything they publish.`;
}

/**
 * A paid article (#9718). Everyone gets the preview the server rendered; a
 * signed-in reader with access (a paying subscriber, an earlier unlock, the
 * creator's team) gets the full body, sanitized on the server. Everyone else
 * is sent to the app to unlock the article or subscribe.
 */
export default function GatedArticleBody({
  applyHref,
  articleId,
  generations,
  handle,
  preview,
  slug,
  unlockPriceCredits,
}: GatedArticleBodyProps): React.ReactElement {
  const [view, setView] = useState<ArticleAccessView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const { getSignedInBetterAuthToken } = await import(
        '@genfeedai/auth-client'
      );
      const token = await getSignedInBetterAuthToken({
        signal: controller.signal,
      });
      if (!token) {
        return;
      }
      const response = await fetch(
        `${creatorArticlePath(handle, slug)}/access?articleId=${encodeURIComponent(articleId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );
      if (response.ok && !controller.signal.aborted) {
        setView((await response.json()) as ArticleAccessView);
      }
    };
    // A signed-out reader, or a failed check, keeps the preview.
    load().catch(() => undefined);
    return () => controller.abort();
  }, [articleId, handle, slug]);

  const full = view?.full ?? null;
  const price = view ? view.unlockPriceCredits : unlockPriceCredits;
  const subscriptionPrice = view?.subscriptionPriceCredits ?? null;

  return (
    <>
      <ArticleContent
        applyHref={applyHref}
        generations={generations}
        sanitizedHtml={(full ?? preview).html}
        sections={(full ?? preview).sections}
        slug={slug}
        resource={null}
      />
      {full ? null : (
        <aside
          aria-label="Paid article"
          className="mt-8 flex flex-col gap-4 rounded-xl border border-foreground/10 bg-foreground/5 p-6"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LockKeyhole className="size-4" aria-hidden="true" />
            The rest of this article is for paying readers
          </div>
          <p className="text-sm text-foreground/70">
            {paywallMessage(handle, price, subscriptionPrice)}
          </p>
          <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
            <a href={getSupportCreatorHref(handle, articleId)}>Keep reading</a>
          </Button>
        </aside>
      )}
    </>
  );
}
