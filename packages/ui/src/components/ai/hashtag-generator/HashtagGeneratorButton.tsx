'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { HashtagGeneratorButtonProps } from '@genfeedai/props/ai/generator-button.props';
import type { IHashtagOptimization } from '@genfeedai/services/ai/optimizers.service';
import { OptimizersService } from '@genfeedai/services/ai/optimizers.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { useCallback, useState } from 'react';
import { HiHashtag } from 'react-icons/hi2';

export default function HashtagGeneratorButton({
  content,
  platform,
  onInsert,
  count = 10,
  isDisabled = false,
  className = '',
}: HashtagGeneratorButtonProps) {
  const notificationsService = NotificationsService.getInstance();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<IHashtagOptimization | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const getOptimizerService = useAuthedService(
    useCallback((token: string) => OptimizersService.getInstance(token), []),
  );

  const handleGenerate = useCallback(async () => {
    if (!content.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const service = await getOptimizerService();
      const data = await service.optimizeHashtags(content, platform, count);
      setResult(data);
    } catch (err) {
      logger.error('Failed to generate hashtags', err);
      notificationsService.error('Failed to generate hashtags');
    } finally {
      setIsLoading(false);
    }
  }, [
    content,
    platform,
    count,
    isLoading,
    getOptimizerService,
    notificationsService,
  ]);

  const handleOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open && !result && !isLoading) {
        handleGenerate();
      }
    },
    [result, isLoading, handleGenerate],
  );

  const handleHashtagClick = useCallback(
    (hashtag: string) => {
      const formatted = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
      onInsert(formatted);
      notificationsService.success(`Inserted ${formatted}`);
    },
    [onInsert, notificationsService],
  );

  const allHashtags = result
    ? [...new Set([...result.optimal, ...result.suggested, ...result.trending])]
    : [];

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={handleOpen}
      minWidth="280px"
      maxWidth="360px"
      trigger={
        <Button
          icon={<HiHashtag className="w-4 h-4" />}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.ICON}
          className={`h-9 w-9 min-h-0 p-0 ${className}`}
          tooltip="Generate hashtags"
          tooltipPosition="top"
          isDisabled={isDisabled || !content.trim()}
        />
      }
    >
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">AI Hashtags</p>
          {result && (
            <Button
              label="Refresh"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="h-7 px-2 text-xs"
              isDisabled={isLoading}
              onClick={handleGenerate}
            />
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Spinner size={ComponentSize.SM} />
            <span className="ml-2 text-sm text-foreground/60">
              Generating hashtags...
            </span>
          </div>
        )}

        {!isLoading && result && allHashtags.length > 0 && (
          <>
            {result.optimal.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-foreground/50 font-medium">
                  Optimal
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.optimal.map((tag) => (
                    <Button
                      key={`optimal-${tag}`}
                      label={`#${tag}`}
                      variant={ButtonVariant.UNSTYLED}
                      className="h-auto px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      onClick={() => handleHashtagClick(tag)}
                      withWrapper={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {result.trending.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-foreground/50 font-medium">
                  Trending
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.trending.map((tag) => (
                    <Button
                      key={`trending-${tag}`}
                      label={`#${tag}`}
                      variant={ButtonVariant.UNSTYLED}
                      className="h-auto px-2 py-1 text-xs bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                      onClick={() => handleHashtagClick(tag)}
                      withWrapper={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {result.suggested.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-foreground/50 font-medium">
                  Suggested
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.suggested.map((tag) => (
                    <Button
                      key={`suggested-${tag}`}
                      label={`#${tag}`}
                      variant={ButtonVariant.UNSTYLED}
                      className="h-auto px-2 py-1 text-xs bg-secondary/50 text-secondary-foreground hover:bg-secondary/70 transition-colors"
                      onClick={() => handleHashtagClick(tag)}
                      withWrapper={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {result.reasoning.length > 0 && (
              <div className="border-t border-white/[0.08] pt-2">
                <p className="text-xs text-foreground/40 leading-relaxed">
                  {result.reasoning[0]}
                </p>
              </div>
            )}
          </>
        )}

        {!isLoading && result && allHashtags.length === 0 && (
          <p className="text-sm text-foreground/50 text-center py-4">
            No hashtags generated. Try with different content.
          </p>
        )}
      </div>
    </Dropdown>
  );
}
