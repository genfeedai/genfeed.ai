'use client';

import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import PromptBarCrunControls from '@/components/prompt-bars/components/crun-controls/PromptBarCrunControls';
import PromptBarCrunVideoControls from '@/components/prompt-bars/components/crun-controls/PromptBarCrunVideoControls';
import type { StudioComposerOutputControlsProps } from '@/features/studio/props/studio-playground-composer.props';

/** Model-specific Crun controls, rendered inside the setup popover's Output section. */
export default function StudioComposerOutputControls({
  crunEndFrameId,
  crunReferenceCount,
  crunStartFrameId,
  inputControls,
  isUploading,
  onSettingsChange,
  prompt,
  settings,
}: StudioComposerOutputControlsProps): ReactElement | null {
  const translate = useTranslations('pages.studioPlayground');
  if (inputControls?.mediaKind === 'image') {
    return (
      <PromptBarCrunControls
        controls={inputControls}
        value={settings.crunControls?.outputFormat}
        onChange={(outputFormat) =>
          onSettingsChange({
            crunControls: {
              modelKey: settings.modelKey,
              contractVersion: inputControls.version,
              outputFormat,
            },
          })
        }
      />
    );
  }
  if (inputControls?.mediaKind !== 'video' || !settings.crunControls) {
    return null;
  }
  return (
    <>
      {(crunReferenceCount ?? 0) >
        (inputControls.videoRules?.referenceMode === 'start-end' ? 1 : 0) && (
        <Label role="alert">
          {translate('crun.videoReferencesUnsupported')}
        </Label>
      )}
      <PromptBarCrunVideoControls
        controls={inputControls}
        value={{
          modelKey: settings.crunControls.modelKey,
          contractVersion: settings.crunControls.contractVersion,
          prompt,
          duration: settings.duration,
          aspectRatio: settings.aspectRatio || undefined,
          resolution: settings.resolution || undefined,
          negativePrompt: settings.crunControls.negativePrompt,
          guidanceScale: settings.crunControls.guidanceScale,
          translatePrompt: settings.crunControls.translatePrompt,
          startFrameId: crunStartFrameId,
          endFrameId: crunEndFrameId,
        }}
        isDisabled={isUploading}
        labels={{
          duration: translate('crun.duration'),
          aspectRatio: translate('crun.aspectRatio'),
          resolution: translate('crun.resolution'),
          negativePrompt: translate('crun.negativePrompt'),
          guidanceScale: translate('crun.guidanceScale'),
          translatePrompt: translate('crun.translatePrompt'),
          pricingReviewRequired: translate('crun.pricingReviewRequired'),
          aspectFromFrames: translate('crun.aspectFromFrames'),
          invalidContract: translate('crun.invalidContract'),
          errorMessages: {
            required: translate('crun.fieldRequired'),
            unknown: translate('crun.fieldUnknown'),
            type: translate('crun.fieldType'),
            enum: translate('crun.fieldEnum'),
            bounds: translate('crun.fieldBounds'),
            uri: translate('crun.fieldUri'),
            reference_required: translate('crun.fieldReferenceRequired'),
            pricing_unavailable: translate('crun.pricingReviewRequired'),
            contract_mismatch: translate('crun.invalidContract'),
          },
        }}
        onChange={(patch) =>
          onSettingsChange({
            ...(Object.hasOwn(patch, 'duration')
              ? { duration: patch.duration }
              : {}),
            ...(Object.hasOwn(patch, 'aspectRatio')
              ? { aspectRatio: patch.aspectRatio ?? '' }
              : {}),
            ...(Object.hasOwn(patch, 'resolution')
              ? { resolution: patch.resolution ?? '' }
              : {}),
            crunControls: {
              ...settings.crunControls,
              modelKey: settings.modelKey,
              contractVersion: inputControls.version,
              ...(Object.hasOwn(patch, 'negativePrompt')
                ? { negativePrompt: patch.negativePrompt }
                : {}),
              ...(Object.hasOwn(patch, 'guidanceScale')
                ? { guidanceScale: patch.guidanceScale }
                : {}),
              ...(Object.hasOwn(patch, 'translatePrompt')
                ? { translatePrompt: patch.translatePrompt }
                : {}),
            },
          })
        }
      />
    </>
  );
}
