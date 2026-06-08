'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiArrowTopRightOnSquare, HiArrowUp } from 'react-icons/hi2';

type Props = {
  generatedImageId: string | null;
  generatedImageUrl: string | null;
  isGenerating: boolean;
  prompt: string;
  onTryAgain: () => void;
  onConfirmImage: () => void;
  onClose: () => void;
  onGenerate: () => void;
};

export default function IllustrationActions({
  generatedImageId,
  generatedImageUrl,
  isGenerating,
  prompt,
  onTryAgain,
  onConfirmImage,
  onClose,
  onGenerate,
}: Props) {
  return (
    <ModalActions>
      <Link
        href={`${EnvironmentService.apps.app}/studio/image`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground h-9 px-3"
      >
        <HiArrowTopRightOnSquare className="size-4" />
        Studio
      </Link>

      <div className="flex-1" />

      {generatedImageId && !isGenerating ? (
        <>
          <Button
            label="Try Again"
            variant={ButtonVariant.SECONDARY}
            onClick={onTryAgain}
            isDisabled={!generatedImageUrl}
            isLoading={isGenerating}
          />

          <Button
            label={
              generatedImageUrl ? 'Use This Image' : 'Use Image (Processing)'
            }
            variant={ButtonVariant.DEFAULT}
            onClick={onConfirmImage}
            isDisabled={!generatedImageUrl}
            isLoading={isGenerating}
          />
        </>
      ) : (
        <>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={onClose}
            isDisabled={isGenerating}
          />

          <Button
            variant={ButtonVariant.GENERATE}
            icon={<HiArrowUp />}
            onClick={onGenerate}
            isLoading={isGenerating}
            isDisabled={!prompt.trim() || isGenerating}
            label="Generate"
          />
        </>
      )}
    </ModalActions>
  );
}
