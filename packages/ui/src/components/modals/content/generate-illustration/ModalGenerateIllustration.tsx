'use client';

import { ModalEnum } from '@genfeedai/enums';
import type { ModalGenerateIllustrationProps } from '@genfeedai/props/modals/modal.props';
import Modal from '@ui/modals/modal/Modal';
import IllustrationActions from './IllustrationActions';
import IllustrationPreview from './IllustrationPreview';
import IllustrationPromptSection from './IllustrationPromptSection';
import { useModalGenerateIllustration } from './useModalGenerateIllustration';

export default function ModalGenerateIllustration({
  isOpen,
  openKey,
  initialPrompt = '',
  platform,
  onConfirm,
  onClose,
}: ModalGenerateIllustrationProps) {
  const {
    prompt,
    setPrompt,
    isGenerating,
    error,
    generatedImageId,
    generatedImageUrl,
    textareaRef,
    formatLabel,
    dimensions,
    handleGenerate,
    handleKeyDown,
    handleClose,
    handleConfirmImage,
    handleTryAgain,
  } = useModalGenerateIllustration({
    isOpen,
    openKey,
    initialPrompt,
    platform,
    onConfirm,
    onClose,
  });

  return (
    <Modal
      id={ModalEnum.GENERATE_ILLUSTRATION}
      title="Generate Illustration"
      error={error}
      modalBoxClassName="max-w-lg"
    >
      <div className="space-y-4">
        <IllustrationPromptSection
          prompt={prompt}
          isGenerating={isGenerating}
          formatLabel={formatLabel}
          textareaRef={textareaRef}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {generatedImageId && !isGenerating && (
          <IllustrationPreview
            generatedImageUrl={generatedImageUrl}
            dimensions={dimensions}
          />
        )}
      </div>

      <IllustrationActions
        generatedImageId={generatedImageId}
        generatedImageUrl={generatedImageUrl}
        isGenerating={isGenerating}
        prompt={prompt}
        onTryAgain={handleTryAgain}
        onConfirmImage={handleConfirmImage}
        onClose={handleClose}
        onGenerate={handleGenerate}
      />
    </Modal>
  );
}
