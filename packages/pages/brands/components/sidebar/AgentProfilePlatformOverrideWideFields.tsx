'use client';

import type { AgentProfilePlatformOverrideWideFieldsProps } from '@props/pages/brand-detail.props';
import { EditableText } from '@ui/primitives/editable-text';

export default function AgentProfilePlatformOverrideWideFields({
  isDisabled,
  onSave,
  override,
  platformValue,
}: AgentProfilePlatformOverrideWideFieldsProps) {
  return (
    <>
      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-content-types`}
        >
          Content Types Override
        </label>
        <EditableText
          ariaLabel={`${platformValue} Content Types Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'contentTypes', value)}
          placeholder="thread, reel, explainer"
          value={override.contentTypes}
        />
      </div>

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-writing-rules`}
        >
          Writing Rules Override
        </label>
        <EditableText
          ariaLabel={`${platformValue} Writing Rules Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'writingRules', value)}
          placeholder="Lead with a claim, use proof"
          value={override.writingRules}
        />
      </div>

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-persona`}
        >
          Persona Override
        </label>
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

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-sample-output`}
        >
          Sample Output Override
        </label>
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

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-exemplar-texts`}
        >
          Exemplar Texts Override
        </label>
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
