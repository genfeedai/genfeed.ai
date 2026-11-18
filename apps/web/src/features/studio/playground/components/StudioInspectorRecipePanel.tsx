'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import GenerationHarnessReceipt from '@ui/ingredients/tabs/prompts/GenerationHarnessReceipt';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StudioInspectorRecipePanelProps } from '@/features/studio/props/studio-playground-inspector.props';

/** The prompt as written, its slots, the text sent to the renderer and the harness receipt. */
export default function StudioInspectorRecipePanel({
  currentReceipt,
  onEditSlots,
  promptText,
  receiptError,
  recipe,
  storedPrompt,
}: StudioInspectorRecipePanelProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs font-medium">
        {translate('continuation.originalPrompt')}
      </p>
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
        {recipe?.originalText ?? translate('continuation.originalUnavailable')}
      </p>
      {storedPrompt && storedPrompt.slots.length > 0 ? (
        <section
          aria-label={translate('inspector.promptSlots.title')}
          className="flex flex-col gap-2"
          data-testid="studio-inspector-prompt-slots"
        >
          <p className="text-xs font-medium">
            {translate('inspector.promptSlots.title')}
          </p>
          <DefinitionList variant="properties">
            {storedPrompt.slots.map((slot) => (
              <DefinitionRow key={slot.key}>
                <DefinitionTerm variant="muted">
                  {translate(`inspector.promptSlots.labels.${slot.key}`)}
                </DefinitionTerm>
                <DefinitionDetail
                  className="whitespace-pre-wrap break-words"
                  variant="compact"
                >
                  {slot.value}
                </DefinitionDetail>
              </DefinitionRow>
            ))}
          </DefinitionList>
          <Button
            className="self-start"
            icon={<Pencil className="size-3.5" />}
            label={translate('inspector.promptSlots.edit')}
            onClick={onEditSlots}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </section>
      ) : null}
      {storedPrompt?.renderedPrompt ? (
        <section
          aria-label={translate('inspector.sentText.title')}
          className="flex flex-col gap-1.5"
          data-testid="studio-inspector-sent-text"
        >
          <p className="text-xs font-medium">
            {translate('inspector.sentText.title')}
          </p>
          {storedPrompt.renderTarget ? (
            <p className="text-2xs text-muted-foreground">
              {translate('inspector.sentText.renderedFor', {
                target: storedPrompt.renderTarget,
              })}
            </p>
          ) : null}
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/80">
            {storedPrompt.renderedPrompt}
          </pre>
        </section>
      ) : null}
      <p className="text-xs font-medium">
        {translate('continuation.effectiveRecipe')}
      </p>
      {currentReceipt?.generationHarness ? (
        <GenerationHarnessReceipt receipt={currentReceipt.generationHarness} />
      ) : null}
      {receiptError ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('inspector.receiptLoadError')}
        </p>
      ) : null}
      {promptText ? (
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/80">
          {promptText}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate('inspector.emptyRecipe')}
        </p>
      )}
    </div>
  );
}
