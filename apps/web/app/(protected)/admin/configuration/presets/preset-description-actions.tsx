'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { Copy, Sparkles, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { PresetDescriptionActionsProps } from '@/features/admin/props/presets.props';
import { usePromptEnhance } from '@/hooks/ui/use-prompt-enhance/use-prompt-enhance';

/** How long "Undo enhancement" stays available after an enhance. */
const UNDO_WINDOW_MS = 30_000;

/**
 * Actions for a preset's description in the context sidebar: AI enhance (the
 * rewrite is saved right away), copy, and undo for 30 seconds after an
 * enhance. The text itself is edited in place as a regular field.
 */
export default function PresetDescriptionActions({
  onSave,
  preset,
}: PresetDescriptionActionsProps) {
  const t = useTranslations('ui.presetFields');
  const { enhance, isEnhancing } = usePromptEnhance();
  const [previousDescription, setPreviousDescription] = useState<string | null>(
    null,
  );
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const description = preset.description ?? '';

  const clearUndoTimeout = () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  };

  useEffect(() => clearUndoTimeout, []);

  const handleEnhance = async () => {
    clearUndoTimeout();
    const original = description;

    try {
      const enhanced = await enhance(original, preset.category);
      await onSave(enhanced);
      setPreviousDescription(original);
      undoTimeoutRef.current = setTimeout(
        () => setPreviousDescription(null),
        UNDO_WINDOW_MS,
      );
    } catch {
      NotificationsService.getInstance().error(t('enhanceFailed'));
    }
  };

  const handleUndo = async () => {
    if (previousDescription === null) {
      return;
    }

    clearUndoTimeout();
    const restored = previousDescription;
    setPreviousDescription(null);
    await onSave(restored);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        icon={
          isEnhancing ? (
            <Spinner size={ComponentSize.XS} />
          ) : (
            <Sparkles className="size-3.5" />
          )
        }
        isDisabled={!description || isEnhancing}
        label={t('enhanceDescription')}
        onClick={handleEnhance}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      />
      <Button
        ariaLabel={t('copyDescription')}
        icon={<Copy className="size-3.5" />}
        isDisabled={!description}
        onClick={() =>
          ClipboardService.getInstance().copyToClipboard(description)
        }
        size={ButtonSize.SM}
        tooltip={t('copyDescription')}
        variant={ButtonVariant.GHOST}
      />
      {previousDescription !== null ? (
        <Button
          ariaLabel={t('undoEnhancement')}
          icon={<Undo2 className="size-3.5" />}
          onClick={handleUndo}
          size={ButtonSize.SM}
          tooltip={t('undoEnhancement')}
          variant={ButtonVariant.GHOST}
        />
      ) : null}
    </div>
  );
}
