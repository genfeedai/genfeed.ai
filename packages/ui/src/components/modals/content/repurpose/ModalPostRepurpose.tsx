'use client';

import {
  ButtonSize,
  ButtonVariant,
  ModalEnum,
  Platform,
  PostRepurposeMode,
} from '@genfeedai/contracts';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { getPlatformIconComponent } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalPostRepurposeProps } from '@genfeedai/props/modals/modal-post-repurpose.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { Repeat2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Channels the scheduler catalog lists as `supported`
 * (PRODUCTIZED_SCHEDULER_PLATFORMS in the channel-capabilities contract).
 * A per-feature options array, matching how other pickers enumerate
 * platforms; the API re-validates against the live catalog either way.
 */
const PLATFORM_OPTIONS = [
  { label: 'YouTube', platform: Platform.YOUTUBE },
  { label: 'TikTok', platform: Platform.TIKTOK },
  { label: 'Instagram', platform: Platform.INSTAGRAM },
  { label: 'X (Twitter)', platform: Platform.TWITTER },
  { label: 'LinkedIn', platform: Platform.LINKEDIN },
] as const;

/**
 * The content engine only writes for these channels today; other targets fall
 * back to deterministic mode (mirrors the server-side gate in
 * PostRepurposeService).
 */
const AGENT_MODE_PLATFORMS = new Set<string>([
  Platform.INSTAGRAM,
  Platform.LINKEDIN,
  Platform.TIKTOK,
  Platform.TWITTER,
]);

const MODE_OPTIONS = [
  {
    description: 'Instant, rule-based caption fit for the channel. No AI.',
    label: 'Adapt as-is',
    mode: PostRepurposeMode.DETERMINISTIC,
  },
  {
    description: 'AI rewrite in your brand voice. Lands in the review queue.',
    label: 'Rewrite with AI',
    mode: PostRepurposeMode.AGENT,
  },
] as const;

/**
 * Assembled as one sentence rather than JSX fragments split around the label,
 * so the copy stays a single translatable unit with a placeholder once shared
 * packages gain a message catalog.
 */
function buildRepurposeHint(sourceLabel?: string | null): string {
  return `Create a draft of “${sourceLabel || 'this post'}” for another channel. Nothing is published or scheduled automatically.`;
}

export default function ModalPostRepurpose({
  source,
  isOpen,
  openKey,
  onSubmit,
  onClose,
}: ModalPostRepurposeProps) {
  useModalAutoOpen(ModalEnum.POST_REPURPOSE, { isOpen, openKey });

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const platformOptions = useMemo(
    () =>
      PLATFORM_OPTIONS.filter((option) => option.platform !== source.platform),
    [source.platform],
  );

  const [platform, setPlatform] = useState<Platform | null>(null);
  const [mode, setMode] = useState<PostRepurposeMode>(
    PostRepurposeMode.DETERMINISTIC,
  );
  const [isLoading, setIsLoading] = useState(false);

  const isAgentAvailable = platform ? AGENT_MODE_PLATFORMS.has(platform) : true;
  const effectiveMode = isAgentAvailable
    ? mode
    : PostRepurposeMode.DETERMINISTIC;

  const handleCancel = useCallback(() => {
    closeModal(ModalEnum.POST_REPURPOSE);
    onCloseRef.current?.();
  }, []);

  const handleModalClosed = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!platform) {
      return;
    }

    try {
      setIsLoading(true);
      await onSubmitRef.current(platform, effectiveMode);
      handleCancel();
    } finally {
      setIsLoading(false);
    }
  }, [platform, effectiveMode, handleCancel]);

  return (
    <Modal
      id={ModalEnum.POST_REPURPOSE}
      title="Repurpose Post"
      onClose={handleModalClosed}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-foreground/70 bg-background/50 p-3">
          <Repeat2 className="size-5 text-primary" />
          <span>{buildRepurposeHint(source.label)}</span>
        </div>

        <FormControl label="Target channel" isRequired>
          <RadioGroup
            className="flex flex-wrap gap-4"
            value={platform ?? ''}
            onValueChange={(value) => setPlatform(value as Platform)}
          >
            {platformOptions.map((option) => {
              const Icon = getPlatformIconComponent(option.platform);
              return (
                <label
                  key={option.platform}
                  className={`flex items-center gap-2 cursor-pointer p-2 border ${
                    platform === option.platform
                      ? 'border-primary bg-primary/10'
                      : 'border-white/[0.08]'
                  }`}
                >
                  <RadioGroupItem
                    value={option.platform}
                    disabled={isLoading}
                  />
                  {Icon && <Icon className="size-4" />}
                  <span className="text-sm">{option.label}</span>
                </label>
              );
            })}
          </RadioGroup>
        </FormControl>

        <FormControl label="How to adapt the content">
          <RadioGroup
            className="flex flex-col gap-2"
            value={effectiveMode}
            onValueChange={(value) => setMode(value as PostRepurposeMode)}
          >
            {MODE_OPTIONS.map((option) => {
              const isDisabled =
                isLoading ||
                (option.mode === PostRepurposeMode.AGENT && !isAgentAvailable);
              return (
                <label
                  key={option.mode}
                  className={`flex items-start gap-3 p-3 border ${
                    isDisabled ? 'opacity-50' : 'cursor-pointer'
                  } ${
                    effectiveMode === option.mode
                      ? 'border-primary bg-primary/10'
                      : 'border-white/[0.08]'
                  }`}
                >
                  <RadioGroupItem
                    className="mt-0.5"
                    value={option.mode}
                    disabled={isDisabled}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-foreground/60">
                      {option.mode === PostRepurposeMode.AGENT &&
                      !isAgentAvailable
                        ? 'Not available for this channel yet.'
                        : option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </FormControl>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={handleCancel}
            isDisabled={isLoading}
          />

          <Button
            label="Create draft"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={handleSubmit}
            isLoading={isLoading}
            isDisabled={!platform}
          />
        </ModalActions>
      </div>
    </Modal>
  );
}
