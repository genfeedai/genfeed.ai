'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import { ArrowUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';

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
  const { href } = useOrgUrl();

  return (
    <ModalActions>
      {/* One-off generation is Agent-first — Studio has no image prompt bar. */}
      <Button variant={ButtonVariant.SECONDARY} asChild>
        <Link href={href(APP_ROUTES.AGENT.NEW)}>
          <ExternalLink className="size-4" />
          Agent
        </Link>
      </Button>

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
            variant={ButtonVariant.DEFAULT}
            icon={<ArrowUp />}
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
