'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { Article } from '@models/content/article.model';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { createMarkup } from '@utils/sanitize-html';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaTwitter,
  FaYoutube,
} from 'react-icons/fa';
import {
  HiArrowRight,
  HiCalendar,
  HiClock,
  HiOutlineExclamationTriangle,
  HiShare,
  HiUser,
} from 'react-icons/hi2';

interface SocialLinkItemProps {
  url: string;
  icon: IconType;
  label: string;
}

function SocialLinkItem({
  url,
  icon: Icon,
  label,
}: SocialLinkItemProps): React.ReactElement {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 py-1 text-xs text-surface transition-colors active:scale-95 hover:text-surface/80 md:text-sm"
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}

export default function ArticleDetail({
  article,
  isPreview,
}: {
  article: Article | null;
  isPreview: boolean;
}) {
  const router = useRouter();

  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const [copied, setCopied] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleShare = async () => {
    try {
      await clipboardService.copyToClipboard(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy to clipboard:', error);
    }
  };

  if (!article || article?.id === 'undefined') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <CardEmpty
          label="Article not found"
          description="The article you are looking for does not exist."
          action={{
            label: 'Read articles',
            onClick: () => router.push('/articles'),
          }}
        />
      </div>
    );
  }

  const brand = article.brand;

  return (
    <div
      className="flex min-h-screen flex-col px-4 pb-8 pt-32"
      style={{ backgroundColor: brand?.backgroundColor || '#000' }}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex items-center justify-between md:mb-8">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-surface md:text-4xl">
              {article.label}
            </h1>

            {article.summary && (
              <p className="text-base text-surface/70 md:text-lg">
                {article.summary}
              </p>
            )}
          </div>

          <Button
            variant={ButtonVariant.SOFT}
            className="border border-edge/[0.08] bg-fill/10 text-surface backdrop-blur-sm transition-all hover:border-edge/20 hover:bg-fill/20"
            onClick={handleShare}
          >
            <HiShare className="h-4 w-4" />
            {copied ? 'Copied!' : 'Share'}
          </Button>
        </div>

        {article.bannerUrl && (
          <div className="relative mb-6 h-48 overflow-hidden bg-muted md:mb-8 md:h-64 lg:h-80">
            <Image
              src={article.bannerUrl}
              alt={`${article.label} banner`}
              className="h-full w-full object-cover object-center"
              fill
              priority
            />
          </div>
        )}

        {isPreview && (
          <div className="mb-6 flex items-start gap-3 border border-yellow-500/30 bg-yellow-500/20 p-4 backdrop-blur-sm md:mb-8">
            <HiOutlineExclamationTriangle className="h-4 w-4 flex-shrink-0 text-yellow-300" />
            <span className="text-sm text-surface md:text-base">
              You are viewing a preview of this article. This article may not be
              published or publicly visible yet.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <header className="mb-6 md:mb-8">
              {article.category && (
                <Badge
                  variant="primary"
                  className="mb-3 bg-fill/20 text-xs text-surface border-edge/30 md:mb-4 md:text-sm"
                >
                  {article.category}
                </Badge>
              )}

              <div className="flex flex-wrap items-center gap-3 border-b border-edge/20 pb-4 text-xs text-surface/60 md:gap-4 md:pb-6 md:text-sm">
                {article.author && (
                  <div className="flex items-center gap-2.5">
                    <HiUser className="h-3.5 w-3.5 flex-shrink-0 md:h-4 md:w-4" />
                    <span className="truncate">{article.author}</span>
                  </div>
                )}

                {article.publishedAt && (
                  <div className="flex items-center gap-2.5">
                    <HiCalendar className="h-3.5 w-3.5 flex-shrink-0 md:h-4 md:w-4" />
                    <span className="whitespace-nowrap">
                      {formatDate(article.publishedAt)}
                    </span>
                  </div>
                )}

                {article.readingTime && (
                  <div className="flex items-center gap-2.5">
                    <HiClock className="h-3.5 w-3.5 flex-shrink-0 md:h-4 md:w-4" />
                    <span className="whitespace-nowrap">
                      {article.readingTime} min read
                    </span>
                  </div>
                )}
              </div>
            </header>

            <div className="prose prose-invert prose-lg max-w-none">
              <div
                dangerouslySetInnerHTML={createMarkup(article.content || '')}
              />
            </div>
          </div>

          <aside className="order-first lg:order-last lg:col-span-1">
            <div className="lg:sticky lg:top-4 lg:self-start">
              <div className="border border-edge/[0.08] bg-fill/10 p-4 backdrop-blur-sm md:p-6">
                <h3 className="mb-3 text-base font-bold text-surface md:mb-4 md:text-lg">
                  About Us
                </h3>

                {brand ? (
                  <div className="space-y-3 md:space-y-4">
                    {brand.logoUrl && (
                      <div className="flex justify-center">
                        <Image
                          src={brand.logoUrl}
                          alt={brand.label || 'Brand logo'}
                          className="h-20 w-20 rounded-full object-cover ring-4 ring-edge/20 md:h-24 md:w-24"
                          width={96}
                          height={96}
                          priority
                        />
                      </div>
                    )}

                    {brand.label && (
                      <div>
                        <h4 className="text-center text-base font-bold text-surface lg:text-left md:text-lg">
                          {brand.label}
                        </h4>
                      </div>
                    )}

                    {brand.description && (
                      <p className="text-center text-xs text-surface/70 lg:text-left md:text-sm">
                        {brand.description}
                      </p>
                    )}

                    {brand.slug && (
                      <div className="pt-2">
                        <Link
                          href={`/u/${brand.slug}`}
                          className="flex items-center justify-center gap-2 border border-edge/[0.08] bg-fill/10 px-3 py-2 text-xs text-surface transition-colors hover:border-edge/20 hover:bg-fill/20 hover:text-surface/80 lg:justify-start md:text-sm"
                        >
                          <span>View more content</span>
                          <HiArrowRight className="h-4 w-4 flex-shrink-0" />
                        </Link>
                      </div>
                    )}

                    <div className="my-2 border-t border-edge/20 pt-3"></div>
                    <div className="space-y-2 md:space-y-2.5">
                      {brand.twitterUrl && (
                        <SocialLinkItem
                          url={brand.twitterUrl}
                          icon={FaTwitter}
                          label="Twitter/X"
                        />
                      )}
                      {brand.linkedinUrl && (
                        <SocialLinkItem
                          url={brand.linkedinUrl}
                          icon={FaLinkedin}
                          label="LinkedIn"
                        />
                      )}
                      {brand.youtubeUrl && (
                        <SocialLinkItem
                          url={brand.youtubeUrl}
                          icon={FaYoutube}
                          label="YouTube"
                        />
                      )}
                      {brand.instagramUrl && (
                        <SocialLinkItem
                          url={brand.instagramUrl}
                          icon={FaInstagram}
                          label="Instagram"
                        />
                      )}
                      {brand.tiktokUrl && (
                        <SocialLinkItem
                          url={brand.tiktokUrl}
                          icon={FaTiktok}
                          label="TikTok"
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
