'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientCategory, ModalEnum } from '@genfeedai/enums';
import type { ModalImageToVideoProps } from '@genfeedai/props/modals/modal.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Modal from '@ui/modals/modal/Modal';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import Image from 'next/image';

export default function ModalImageToVideo({
  image,
  models,
  presets,
  moods,
  styles,
  cameras,
  sounds,
  tags,
  fontFamilies,
  blacklists,
  promptData,
  isGenerating,
  onPromptChange,
  onSubmit,
  onClose,
}: ModalImageToVideoProps) {
  const handleSubmit = () => {
    if (!promptData?.isValid || !image) {
      return;
    }

    onSubmit(promptData as PromptTextareaSchema & { isValid: boolean });
  };

  const imageUrl = image
    ? image.ingredientUrl ||
      `${EnvironmentService.ingredientsEndpoint}/images/${image.id}`
    : '';

  return (
    <Modal
      id={ModalEnum.IMAGE_TO_VIDEO}
      title="Convert image to video"
      onClose={onClose}
      modalBoxClassName="max-w-5xl"
    >
      {image ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6">
            <div className="space-y-4">
              <div className="relative aspect-[3/4] overflow-hidden bg-background">
                <Image
                  src={imageUrl}
                  alt={image.promptText || 'Selected image'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                  priority
                />
              </div>

              <div className=" border border-white/[0.08] bg-background/70 p-4 text-sm leading-relaxed text-foreground/70">
                <p>
                  The selected image will be locked as a reference for the video
                  prompt. Adjust the prompt or style options, then generate to
                  start an image-to-video conversion while staying on the image
                  workspace.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <PromptBar
                categoryType={IngredientCategory.VIDEO}
                models={models}
                presets={presets}
                moods={moods}
                styles={styles}
                cameras={cameras}
                sounds={sounds}
                tags={tags}
                fontFamilies={fontFamilies}
                blacklists={blacklists}
                promptData={promptData}
                onDatasetChange={onPromptChange}
                onSubmit={handleSubmit}
                isGenerating={isGenerating}
                isGenerateDisabled={!promptData?.isValid || isGenerating}
                generateLabel="Generate Video"
              />
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
