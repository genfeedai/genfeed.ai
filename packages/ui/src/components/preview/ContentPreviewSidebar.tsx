'use client';

import { ButtonVariant, CredentialPlatform } from '@genfeedai/enums';
import type { ContentPreviewSidebarProps } from '@genfeedai/props/components/content-preview-sidebar.props';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';

/**
 * Content Preview Sidebar component
 * Displays platform-specific preview of content as you type
 */
export default function ContentPreviewSidebar({
  title,
  content,
  platform,
  subtitle,
  subreddit,
  titleMaxLength = 300,
  contentMaxLength = 280,
  className = '',
  onItemClick,
  activeIndex,
  items,
  readyCount,
  showCharacterCount = true,
  emptyMessage,
}: ContentPreviewSidebarProps) {
  const getPlatformLabel = () => {
    if (!platform) {
      return 'Preview';
    }
    if (platform === CredentialPlatform.TWITTER || platform === 'twitter') {
      return 'Twitter/X';
    }
    if (platform === CredentialPlatform.LINKEDIN || platform === 'linkedin') {
      return 'LinkedIn';
    }
    if (platform === 'reddit') {
      return 'Reddit';
    }
    if (platform === 'article') {
      return 'Article';
    }
    return platform;
  };

  const getPreviewTitle = () => {
    if (platform === CredentialPlatform.TWITTER || platform === 'twitter') {
      return 'Viral thread preview';
    }

    if (platform === CredentialPlatform.LINKEDIN || platform === 'linkedin') {
      return 'LinkedIn feed preview';
    }

    if (platform === 'reddit') {
      return 'Reddit post preview';
    }
    if (platform === 'article') {
      return 'Article preview';
    }
    return 'Content preview';
  };

  const renderTwitterPreview = () => {
    if (items && items.length > 0) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-foreground/60">
            <span>
              {onItemClick
                ? 'Tap a tweet to focus the editor'
                : 'Thread preview'}
            </span>
            {readyCount !== undefined && <span>{readyCount} ready</span>}
          </div>

          <div className="mt-3 max-h-[calc(100vh-200px)] space-y-3 overflow-y-auto pr-1">
            {items.map((item) => {
              const isActive = activeIndex === item.index;
              return (
                <Button
                  key={`preview-item-${item.index}`}
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => onItemClick?.(item.index)}
                  className={`w-full border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                    isActive
                      ? 'border-primary bg-card shadow-lg shadow-primary/10'
                      : 'border-transparent bg-card/80 hover:border-white/[0.08] hover:bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground/60'
                      }`}
                    >
                      {item.index + 1}
                    </div>
                    <div className="space-y-2">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {item.content.trim() ||
                          'Draft tweet — start typing to see it here.'}
                      </p>
                      {showCharacterCount && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                          <span>
                            {item.content.length}/{contentMaxLength}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className=" bg-card p-4 shadow-inner">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {content.trim() ||
            emptyMessage ||
            'Your tweet preview will appear here as you write.'}
        </p>
        {showCharacterCount && (
          <div className="mt-2 text-xs text-foreground/60 text-right">
            {content.length}/{contentMaxLength}
          </div>
        )}
      </div>
    );
  };

  const renderLinkedInPreview = () => {
    return (
      <div className=" bg-card p-4 shadow-inner">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
          Thought leadership
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {content.trim() ||
            emptyMessage ||
            'Your LinkedIn post preview will appear here as you write.'}
        </p>
        {showCharacterCount && (
          <div className="mt-2 text-xs text-foreground/60 text-right">
            {content.length} characters
          </div>
        )}
      </div>
    );
  };

  const renderRedditPreview = () => {
    return (
      <div className="space-y-3 bg-card p-4 shadow-inner">
        <div className="flex items-center justify-between text-xs text-foreground/60">
          <span>
            {subreddit?.trim() ? `r/${subreddit.trim()}` : 'r/subreddit'}
          </span>
          {title && (
            <span>
              {title.length}/{titleMaxLength}
            </span>
          )}
        </div>
        {title && (
          <h4 className="text-base font-semibold leading-tight text-foreground">
            {title.trim() ||
              'Your compelling Reddit headline will appear here.'}
          </h4>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {content.trim() ||
            emptyMessage ||
            'Share context or storytelling to preview your Reddit post.'}
        </p>
      </div>
    );
  };

  const renderArticlePreview = () => {
    return (
      <div className="space-y-4 bg-card p-4 shadow-inner">
        {title && (
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        )}
        {subtitle && <p className="text-sm text-foreground/70">{subtitle}</p>}
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {content ||
              emptyMessage ||
              'Your article preview will appear here as you write.'}
          </div>
        </div>
      </div>
    );
  };

  const renderGenericPreview = () => {
    return (
      <div className=" bg-card p-4 shadow-inner">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
          {content.trim() ||
            emptyMessage ||
            'Content preview will appear here.'}
        </p>
      </div>
    );
  };

  const renderPreviewContent = () => {
    if (platform === CredentialPlatform.TWITTER) {
      return renderTwitterPreview();
    }

    if (platform === CredentialPlatform.LINKEDIN) {
      return renderLinkedInPreview();
    }

    if (platform === CredentialPlatform.REDDIT) {
      return renderRedditPreview();
    }

    if (platform === 'article') {
      return renderArticlePreview();
    }

    return renderGenericPreview();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{getPreviewTitle()}</h3>
        <Badge variant="outline">{getPlatformLabel()}</Badge>
      </div>
      <div className=" border border-white/[0.08] bg-background/60 p-4">
        {renderPreviewContent()}
      </div>
    </div>
  );
}
