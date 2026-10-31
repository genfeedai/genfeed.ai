'use client';

import { ComponentSize } from '@genfeedai/contracts';
import Spinner from '@ui/primitives/spinner';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { useTranslations } from 'next-intl';
import type { IllustrationPromptSectionProps } from '@/props/modals/illustration-prompt-section.props';

export default function IllustrationPromptSection({
  prompt,
  isGenerating,
  formatLabel,
  hasGeneratedImage,
  onPromptChange,
  onGenerate,
}: IllustrationPromptSectionProps) {
  const translate = useTranslations('ui.illustrationPrompt');
  const canGenerate =
    Boolean(prompt.trim()) && !isGenerating && !hasGeneratedImage;

  return (
    <>
      <PromptBarComposer
        data-testid="illustration-prompt-composer"
        density="compact"
        beforeBody={
          <p className="flex items-center gap-1.5 px-3.5 pt-2.5 text-2xs font-medium text-foreground/60">
            {translate('title')}
            <span className="rounded bg-tertiary px-1.5 py-0.5 text-foreground/80">
              {formatLabel}
            </span>
          </p>
        }
      >
        <PromptEditor
          ariaLabel={translate('title')}
          isAutoFocused
          value={prompt}
          isDisabled={isGenerating}
          placeholder={translate('placeholder')}
          onValueChange={onPromptChange}
          onSubmit={() => {
            if (canGenerate) onGenerate();
          }}
          className="min-h-16"
        />
        <PromptBarToolbar
          leading={null}
          trailing={
            <PromptBarSendButton
              ariaLabel={translate('generate')}
              isDisabled={!canGenerate}
              isLoading={isGenerating}
              onClick={onGenerate}
              tooltip={translate('generate')}
            />
          }
        />
      </PromptBarComposer>

      {isGenerating && (
        <div className="flex items-center gap-2 bg-background p-3 text-sm">
          <Spinner size={ComponentSize.SM} />
          <span>{translate('generating')}</span>
        </div>
      )}
    </>
  );
}
