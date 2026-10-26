'use client';

import type { AgentProfilePlatformOverrideWideFieldsProps } from '@props/pages/brand-detail.props';
import { EditableText } from '@ui/primitives/editable-text';
import { Label } from '@ui/primitives/label';

export default function AgentProfilePlatformOverrideWideFields({
  isDisabled,
  onSave,
  override,
  platformValue,
}: AgentProfilePlatformOverrideWideFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label className="text-xs" htmlFor={`${platformValue}-content-types`}>
          Content Types Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Content Types Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'contentTypes', value)}
          placeholder="thread, reel, explainer"
          value={override.contentTypes}
        />
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label className="text-xs" htmlFor={`${platformValue}-writing-rules`}>
          Writing Rules Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Writing Rules Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'writingRules', value)}
          placeholder="Lead with a claim, use proof"
          value={override.writingRules}
        />
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label className="text-xs" htmlFor={`${platformValue}-persona`}>
          Persona Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Persona Override`}
          className="w-full"
          displayClassName="text-sm leading-6"
          isDisabled={isDisabled}
          isMultiline
          onSave={(value) => onSave(platformValue, 'persona', value)}
          value={override.persona}
        />
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label className="text-xs" htmlFor={`${platformValue}-sample-output`}>
          Sample Output Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Sample Output Override`}
          className="w-full"
          displayClassName="text-sm leading-6"
          isDisabled={isDisabled}
          isMultiline
          onSave={(value) => onSave(platformValue, 'sampleOutput', value)}
          placeholder="Short example of how this platform-specific voice should sound."
          value={override.sampleOutput}
        />
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label className="text-xs" htmlFor={`${platformValue}-exemplar-texts`}>
          Exemplar Texts Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Exemplar Texts Override`}
          displayClassName="text-sm leading-6"
          isDisabled={isDisabled}
          isMultiline
          onSave={(value) => onSave(platformValue, 'exemplarTexts', value)}
          placeholder="Short example of a winning post."
          value={override.exemplarTexts}
        />
      </div>
    </>
  );
}
