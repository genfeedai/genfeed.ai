'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { CaptionGeneratorButtonProps } from '@props/ai/generator-button.props';
import { OptimizersService } from '@services/ai/optimizers.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import DropdownBase from '@ui/dropdowns/base/DropdownBase';
import Spinner from '@ui/feedback/spinner/Spinner';
import { useCallback, useState } from 'react';
import { HiArrowPath, HiCheck, HiSparkles } from 'react-icons/hi2';

interface OptimizeResult {
  original: string;
  optimized: string;
  changes: string[];
}

export default function CaptionGeneratorButton({
  content,
  platform,
  contentType = 'caption',
  onAccept,
  isDisabled = false,
  className = '',
}: CaptionGeneratorButtonProps) {
  const notificationsService = NotificationsService.getInstance();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
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
      const data = await service.optimizeContent({
        content,
        platform,
        type: (contentType === 'caption' ? 'post' : contentType) as
          | 'caption'
          | 'video-script'
          | 'article'
          | 'post',
      });
      setResult({
        changes: data.changes,
        optimized: data.optimized,
        original: data.original,
      });
    } catch (err) {
      logger.error('Failed to optimize caption', err);
      notificationsService.error('Failed to optimize caption');
    } finally {
      setIsLoading(false);
    }
  }, [
    content,
    platform,
    contentType,
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

  const handleAccept = useCallback(() => {
    if (!result) {
      return;
    }
    onAccept(result.optimized);
    setIsOpen(false);
    setResult(null);
    notificationsService.success('Caption applied');
  }, [result, onAccept, notificationsService]);

  return (
    <DropdownBase
      isOpen={isOpen}
      onOpenChange={handleOpen}
      minWidth="320px"
      maxWidth="420px"
      trigger={
        <Button
          icon={<HiSparkles className="w-4 h-4" />}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.ICON}
          className={`h-9 w-9 min-h-0 p-0 ${className}`}
          tooltip="Optimize caption"
          tooltipPosition="top"
          isDisabled={isDisabled || !content.trim()}
        />
      }
    >
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">AI Caption Optimizer</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner size={ComponentSize.SM} />
            <span className="ml-2 text-sm text-foreground/60">
              Optimizing caption...
            </span>
          </div>
        )}

        {!isLoading && result && (
          <>
            {/* Optimized caption */}
            <div className="space-y-2">
              <p className="text-xs text-foreground/50 font-medium">
                Optimized
              </p>
              <div className=" bg-card/80 border border-white/[0.08] p-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {result.optimized}
                </p>
              </div>
            </div>

            {/* Changes summary */}
            {result.changes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-foreground/50 font-medium">
                  Changes
                </p>
                <ul className="space-y-1">
                  {result.changes.map((change, idx) => (
                    <li
                      key={`change-${idx}`}
                      className="text-xs text-foreground/60 flex items-start gap-1.5"
                    >
                      <span className="text-primary mt-0.5 flex-shrink-0">
                        &bull;
                      </span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 border-t border-white/[0.08] pt-3">
              <Button
                label="Accept"
                icon={<HiCheck className="w-3.5 h-3.5" />}
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                className="flex-1"
                onClick={handleAccept}
              />
              <Button
                label="Regenerate"
                icon={<HiArrowPath className="w-3.5 h-3.5" />}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                className="flex-1"
                isDisabled={isLoading}
                onClick={handleGenerate}
              />
            </div>
          </>
        )}

        {!isLoading && !result && (
          <p className="text-sm text-foreground/50 text-center py-6">
            Click to optimize your caption with AI
          </p>
        )}
      </div>
    </DropdownBase>
  );
}
