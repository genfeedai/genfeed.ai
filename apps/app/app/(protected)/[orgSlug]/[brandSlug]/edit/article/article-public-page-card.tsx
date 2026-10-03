import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ArticlePublicPageCardProps } from '@props/edit/article-public-page.props';
import { ArticlesService } from '@services/content/articles.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Clipboard, ExternalLink, Eye, Globe } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

function toDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/**
 * Where the article lives on genfeed.ai, and the card LinkedIn, Facebook and X
 * unfurl from its link. Only Genfeed's own articles are hosted there.
 */
export default function ArticlePublicPageCard({
  article,
  destination,
  isPublished,
  summary,
  title,
}: ArticlePublicPageCardProps) {
  const translate = useTranslations('common.articleDetail.publicPage');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCreatingPreview, setIsCreatingPreview] = useState(false);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  const { isHostedOnWebsite, publicUrl } = destination;
  const linkUrl = isPublished ? publicUrl : (previewUrl ?? undefined);

  const handleCreatePreview = useCallback(async () => {
    setIsCreatingPreview(true);
    try {
      const service = await getArticlesService();
      const link = await service.createPreviewLink(article.id);
      setPreviewUrl(link.url);
    } catch (err) {
      logger.error('Failed to create article preview link', err);
      notificationsService.error('Create preview link');
    } finally {
      setIsCreatingPreview(false);
    }
  }, [article.id, getArticlesService, notificationsService]);

  if (!isHostedOnWebsite || !publicUrl) {
    return (
      <Card bodyClassName="space-y-2">
        <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">
          {translate('title')}
        </h3>
        <p className="text-sm text-foreground/70">{translate('notHosted')}</p>
      </Card>
    );
  }

  return (
    <Card bodyClassName="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">
          {translate('title')}
        </h3>
        <span className="text-xs font-medium text-foreground/60">
          {isPublished ? translate('live') : translate('notLive')}
        </span>
      </div>

      <p className="break-all text-sm font-medium">
        {toDisplayUrl(linkUrl ?? publicUrl)}
      </p>
      {!isPublished && (
        <p className="text-xs text-foreground/60">
          {previewUrl ? translate('previewHint') : translate('publishHint')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {linkUrl ? (
          <>
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <NextLink href={linkUrl} target="_blank" rel="noopener">
                <ExternalLink className="size-4" />
                {translate('open')}
              </NextLink>
            </Button>
            <Button
              label={translate('copyLink')}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              icon={<Clipboard className="size-4" />}
              onClick={() => void clipboardService.copyToClipboard(linkUrl)}
            />
          </>
        ) : (
          <Button
            label={translate('previewLink')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            icon={<Eye className="size-4" />}
            isLoading={isCreatingPreview}
            isDisabled={isCreatingPreview}
            onClick={() => void handleCreatePreview()}
          />
        )}
      </div>

      {/* The unfurl a share of this link renders on LinkedIn, Facebook and X. */}
      <div className="overflow-hidden rounded-lg border border-border/50">
        {isPublished ? (
          <div className="relative aspect-[1200/630] w-full bg-muted">
            <Image
              src={`${publicUrl}/og`}
              alt={title || 'Article share card'}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-[1200/630] w-full items-center justify-center bg-muted">
            <Globe className="size-6 text-foreground/40" />
          </div>
        )}
        <div className="space-y-1 p-3">
          <p className="text-xs uppercase tracking-wider text-foreground/50">
            {translate('shareDomain')}
          </p>
          <p className="line-clamp-2 text-sm font-semibold">
            {title || translate('untitled')}
          </p>
          {summary && (
            <p className="line-clamp-2 text-xs text-foreground/60">{summary}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
