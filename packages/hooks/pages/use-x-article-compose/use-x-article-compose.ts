'use client';

import type { IXArticleMetadata } from '@genfeedai/interfaces';
import type { Article } from '@genfeedai/models/content/article.model';
import type { GenerateArticlesRequest } from '@genfeedai/services/content/articles.service';
import { ArticlesService } from '@genfeedai/services/content/articles.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { downloadUrl } from '@helpers/media/download/download.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useState } from 'react';

export type XArticlePhase = 'idle' | 'generating' | 'generated' | 'error';

export interface UseXArticleComposeReturn {
  phase: XArticlePhase;
  article: Article | null;
  metadata: IXArticleMetadata | null;
  error: string | null;
  isGeneratingImage: boolean;
  handleGenerate: (data: GenerateArticlesRequest) => Promise<void>;
  handleCopySection: (sectionId: string) => void;
  handleCopyFullArticle: () => void;
  handleDownloadImage: (url: string, filename: string) => void;
  handleGenerateHeaderImage: () => Promise<void>;
}

export function useXArticleCompose(): UseXArticleComposeReturn {
  const notificationsService = NotificationsService.getInstance();
  const clipboardService = ClipboardService.getInstance();

  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  const [phase, setPhase] = useState<XArticlePhase>('idle');
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const metadata = article?.xArticleMetadata ?? null;

  const handleGenerate = useCallback(
    async (data: GenerateArticlesRequest) => {
      setPhase('generating');
      setError(null);

      try {
        const service = await getArticlesService();
        const generated = await service.generateArticles({
          ...data,
          type: 'x-article',
        });
        const result = generated[0];
        if (!result) {
          throw new Error('No article returned from generation');
        }
        setArticle(result);
        setPhase('generated');
        notificationsService.success('X Article generated');
      } catch (err) {
        logger.error('Failed to generate X Article', err);
        notificationsService.error('Generate X Article');
        setError('Failed to generate X Article. Please try again.');
        setPhase('error');
      }
    },
    [getArticlesService, notificationsService],
  );

  const stripHtmlTags = useCallback((html: string): string => {
    return html.replace(/<[^>]*>/g, '').trim();
  }, []);

  const handleCopySection = useCallback(
    (sectionId: string) => {
      const section = metadata?.sections.find((s) => s.id === sectionId);
      if (!section) {
        return;
      }

      const text = `${section.heading}\n\n${stripHtmlTags(section.content)}${
        section.pullQuote ? `\n\n"${section.pullQuote}"` : ''
      }`;
      clipboardService.copyToClipboard(text);
    },
    [metadata, clipboardService, stripHtmlTags],
  );

  const handleCopyFullArticle = useCallback(() => {
    if (!article || !metadata) {
      return;
    }

    const parts = [article.label, ''];

    for (const section of metadata.sections) {
      parts.push(section.heading);
      parts.push(stripHtmlTags(section.content));
      if (section.pullQuote) {
        parts.push(`"${section.pullQuote}"`);
      }
      parts.push('');
    }

    clipboardService.copyToClipboard(parts.join('\n'));
  }, [article, metadata, clipboardService, stripHtmlTags]);

  const handleDownloadImage = useCallback(
    (url: string, filename: string) => {
      downloadUrl(url, filename).catch((err) => {
        logger.error('Failed to download image', err);
        notificationsService.error('Download image');
      });
    },
    [notificationsService],
  );

  const handleGenerateHeaderImage = useCallback(async () => {
    if (!article || isGeneratingImage) {
      return;
    }

    setIsGeneratingImage(true);

    try {
      const service = await getArticlesService();
      await service.generateImage(article.id, {
        height: 900,
        width: 1600,
      });
      // Re-fetch article to get the updated headerImageUrl
      const updated = await service.findOne(article.id);
      setArticle(updated);
      notificationsService.success('Header image generated');
    } catch (err) {
      logger.error('Failed to generate header image', err);
      notificationsService.error('Generate header image');
    } finally {
      setIsGeneratingImage(false);
    }
  }, [article, isGeneratingImage, getArticlesService, notificationsService]);

  return {
    article,
    error,
    handleCopyFullArticle,
    handleCopySection,
    handleDownloadImage,
    handleGenerate,
    handleGenerateHeaderImage,
    isGeneratingImage,
    metadata,
    phase,
  };
}
