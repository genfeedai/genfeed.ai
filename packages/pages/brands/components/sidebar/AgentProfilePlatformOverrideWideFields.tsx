'use client';

import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';

type PlatformOverrideFormState = {
  approvedHooks: string;
  contentTypes: string;
  defaultModel: string;
  bannedPhrases: string;
  canonicalSource: 'brand' | 'founder' | 'hybrid' | '';
  doNotSoundLike: string;
  exemplarTexts: string;
  frequency: string;
  goals: string;
  messagingPillars: string;
  persona: string;
  sampleOutput: string;
  style: string;
  tone: string;
  audience: string;
  values: string;
  writingRules: string;
};

type AgentProfilePlatformOverrideWideFieldsProps = {
  override: PlatformOverrideFormState;
  platformValue: string;
  onChange: (
    platform: string,
    key: keyof PlatformOverrideFormState,
    value: string,
  ) => void;
};

export default function AgentProfilePlatformOverrideWideFields({
  override,
  platformValue,
  onChange,
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
        <Input
          id={`${platformValue}-content-types`}
          placeholder="thread, reel, explainer"
          value={override.contentTypes}
          onChange={(event) =>
            onChange(platformValue, 'contentTypes', event.target.value)
          }
        />
      </div>

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-writing-rules`}
        >
          Writing Rules Override
        </label>
        <Input
          id={`${platformValue}-writing-rules`}
          placeholder="Lead with a claim, use proof"
          value={override.writingRules}
          onChange={(event) =>
            onChange(platformValue, 'writingRules', event.target.value)
          }
        />
      </div>

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-persona`}
        >
          Persona Override
        </label>
        <Textarea
          id={`${platformValue}-persona`}
          className="min-h-[90px]"
          value={override.persona}
          onChange={(event) =>
            onChange(platformValue, 'persona', event.target.value)
          }
        />
      </div>

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-sample-output`}
        >
          Sample Output Override
        </label>
        <Textarea
          id={`${platformValue}-sample-output`}
          className="min-h-[90px]"
          placeholder="Short example of how this platform-specific voice should sound."
          value={override.sampleOutput}
          onChange={(event) =>
            onChange(platformValue, 'sampleOutput', event.target.value)
          }
        />
      </div>

      <div className="md:col-span-2">
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-exemplar-texts`}
        >
          Exemplar Texts Override
        </label>
        <Input
          id={`${platformValue}-exemplar-texts`}
          placeholder="Short example of a winning post."
          value={override.exemplarTexts}
          onChange={(event) =>
            onChange(platformValue, 'exemplarTexts', event.target.value)
          }
        />
      </div>
    </>
  );
}
