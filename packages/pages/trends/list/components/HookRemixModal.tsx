'use client';

import type { IIngredient } from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { ModalHookRemixProps } from '@props/trends/hook-remix.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { HookRemixService } from '@services/hook-remix/hook-remix.service';
import Button from '@ui/buttons/base/Button';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Slider } from '@ui/primitives/slider';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineFilm, HiOutlineSparkles } from 'react-icons/hi2';

const HOOK_REMIX_MODAL_ID = 'modal-hook-remix';

const DEFAULT_HOOK_DURATION = 3;
const MIN_HOOK_DURATION = 1;
const MAX_HOOK_DURATION = 10;

function getIngredientOptionLabel(ingredient: IIngredient): string {
  if (
    ingredient.metadata &&
    typeof ingredient.metadata === 'object' &&
    'label' in ingredient.metadata &&
    typeof ingredient.metadata.label === 'string'
  ) {
    return ingredient.metadata.label;
  }

  return ingredient.id;
}

export default function HookRemixModal({
  video,
  isOpen,
  openKey,
  onSubmit,
  onClose,
}: ModalHookRemixProps) {
  const { brands, brandId: contextBrandId } = useBrand();

  const [selectedBrandId, setSelectedBrandId] = useState(contextBrandId);
  const [selectedClipId, setSelectedClipId] = useState('');
  const [hookDuration, setHookDuration] = useState(DEFAULT_HOOK_DURATION);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const getVideoIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(IngredientCategory.VIDEO, token),
  );

  const getHookRemixService = useAuthedService((token: string) =>
    HookRemixService.getInstance(token),
  );

  // Fetch video ingredients (CTA clips) for selected brand
  const { data: videoIngredients, isLoading: isLoadingClips } = useResource<
    IIngredient[]
  >(
    async () => {
      if (!selectedBrandId) {
        return [];
      }
      const service = await getVideoIngredientsService();
      return service.findAll({ brand: selectedBrandId });
    },
    {
      defaultValue: [],
      dependencies: [selectedBrandId],
      enabled: Boolean(selectedBrandId),
    },
  );

  // Open modal when isOpen/openKey changes
  useEffect(() => {
    if (isOpen) {
      openModal(HOOK_REMIX_MODAL_ID);
    }
  }, [isOpen, openKey]);

  // Reset form when video changes
  useEffect(() => {
    setSelectedBrandId(contextBrandId);
    setSelectedClipId('');
    setHookDuration(DEFAULT_HOOK_DURATION);
    setSubmitError(null);
  }, [video, contextBrandId]);

  const handleCancel = useCallback(() => {
    closeModal(HOOK_REMIX_MODAL_ID);
    onCloseRef.current?.();
  }, []);

  const handleModalClosed = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!video || !selectedBrandId || !selectedClipId) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const service = await getHookRemixService();
      const result = await service.createHookRemix({
        brandId: selectedBrandId,
        ctaIngredientId: selectedClipId,
        hookDurationSeconds: hookDuration,
        videoId: video.id,
      });

      onSubmitRef.current?.(result.jobId);
      handleCancel();
    } catch (error) {
      logger.error('Failed to create hook remix', { error });
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to create hook remix',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    video,
    selectedBrandId,
    selectedClipId,
    hookDuration,
    getHookRemixService,
    handleCancel,
  ]);

  const isFormValid =
    Boolean(selectedBrandId) && Boolean(selectedClipId) && Boolean(video);

  return (
    <Modal
      id={HOOK_REMIX_MODAL_ID}
      title="Hook Remix"
      onClose={handleModalClosed}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-foreground/70 bg-background/50 p-3">
          <HiOutlineFilm className="w-5 h-5 text-primary shrink-0" />
          <span>
            Extract the viral hook from this video and combine it with your CTA
            clip to create a new remix.
          </span>
        </div>

        {video && (
          <div className="text-xs text-foreground/50 bg-white/[0.04] px-3 py-2">
            <span className="font-medium text-foreground/70">Source:</span>{' '}
            {video.title || video.hook || 'Untitled'} by @{video.creatorHandle}
            {video.views ? ` - ${video.views.toLocaleString()} views` : ''}
          </div>
        )}

        <FormControl label="Brand">
          <FormSelect
            name="brandId"
            value={selectedBrandId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              setSelectedBrandId(e.target.value);
              setSelectedClipId('');
            }}
            isRequired
            isDisabled={isSubmitting}
          >
            <option value="">Select a brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.label}
              </option>
            ))}
          </FormSelect>
        </FormControl>

        <FormControl label="CTA Clip">
          <FormSelect
            name="ctaClipId"
            value={selectedClipId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setSelectedClipId(e.target.value)
            }
            isRequired
            isDisabled={isSubmitting || isLoadingClips || !selectedBrandId}
            placeholder={
              isLoadingClips
                ? 'Loading clips...'
                : !selectedBrandId
                  ? 'Select a brand first'
                  : 'Select a CTA clip'
            }
          >
            <option value="">
              {isLoadingClips
                ? 'Loading clips...'
                : !selectedBrandId
                  ? 'Select a brand first'
                  : 'Select a CTA clip'}
            </option>
            {videoIngredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {getIngredientOptionLabel(ingredient)}
              </option>
            ))}
          </FormSelect>
        </FormControl>

        <FormControl label={`Hook Duration: ${hookDuration}s`}>
          <Slider
            min={MIN_HOOK_DURATION}
            max={MAX_HOOK_DURATION}
            step={1}
            value={[hookDuration]}
            onValueChange={([value]) =>
              setHookDuration(value ?? DEFAULT_HOOK_DURATION)
            }
            disabled={isSubmitting}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-foreground/40 mt-1">
            <span>{MIN_HOOK_DURATION}s</span>
            <span>{MAX_HOOK_DURATION}s</span>
          </div>
        </FormControl>

        {submitError && (
          <div className="text-xs text-destructive bg-destructive/10 px-3 py-2">
            {submitError}
          </div>
        )}

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={handleCancel}
            isDisabled={isSubmitting}
          />

          <Button
            label="Create Remix"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            isDisabled={!isFormValid || isSubmitting}
            icon={<HiOutlineSparkles className="w-3.5 h-3.5" />}
          />
        </ModalActions>
      </div>
    </Modal>
  );
}
