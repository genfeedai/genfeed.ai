'use client';

import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const AUTO_MODEL_SELECT_VALUE = '__auto__';

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

type AgentProfilePlatformOverrideFieldsProps = {
  enabledModels: string[];
  override: PlatformOverrideFormState;
  platformValue: string;
  onChange: (
    platform: string,
    key: keyof PlatformOverrideFormState,
    value: string,
  ) => void;
};

export default function AgentProfilePlatformOverrideFields({
  enabledModels,
  override,
  platformValue,
  onChange,
}: AgentProfilePlatformOverrideFieldsProps) {
  return (
    <>
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-canonical-source`}
        >
          Voice Source Override
        </label>
        <Select
          value={override.canonicalSource || AUTO_MODEL_SELECT_VALUE}
          onValueChange={(value) =>
            onChange(
              platformValue,
              'canonicalSource',
              value === AUTO_MODEL_SELECT_VALUE ? '' : value,
            )
          }
        >
          <SelectTrigger
            id={`${platformValue}-canonical-source`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
              Inherit brand voice source
            </SelectItem>
            <SelectItem value="brand">Brand</SelectItem>
            <SelectItem value="founder">Founder</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-default-model`}
        >
          Model Override
        </label>
        <Select
          value={override.defaultModel || AUTO_MODEL_SELECT_VALUE}
          onValueChange={(value) =>
            onChange(
              platformValue,
              'defaultModel',
              value === AUTO_MODEL_SELECT_VALUE ? '' : value,
            )
          }
        >
          <SelectTrigger
            id={`${platformValue}-default-model`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO_MODEL_SELECT_VALUE}>Auto</SelectItem>
            {enabledModels.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-tone`}
        >
          Tone Override
        </label>
        <Input
          id={`${platformValue}-tone`}
          value={override.tone}
          onChange={(event) =>
            onChange(platformValue, 'tone', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-style`}
        >
          Style Override
        </label>
        <Input
          id={`${platformValue}-style`}
          value={override.style}
          onChange={(event) =>
            onChange(platformValue, 'style', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-frequency`}
        >
          Frequency Override
        </label>
        <Input
          id={`${platformValue}-frequency`}
          value={override.frequency}
          onChange={(event) =>
            onChange(platformValue, 'frequency', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-audience`}
        >
          Audience Override
        </label>
        <Input
          id={`${platformValue}-audience`}
          placeholder="developers, operators"
          value={override.audience}
          onChange={(event) =>
            onChange(platformValue, 'audience', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-goals`}
        >
          Goals Override
        </label>
        <Input
          id={`${platformValue}-goals`}
          placeholder="engagement, leads"
          value={override.goals}
          onChange={(event) =>
            onChange(platformValue, 'goals', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-messaging-pillars`}
        >
          Messaging Pillars Override
        </label>
        <Input
          id={`${platformValue}-messaging-pillars`}
          placeholder="clarity, proof"
          value={override.messagingPillars}
          onChange={(event) =>
            onChange(platformValue, 'messagingPillars', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-approved-hooks`}
        >
          Approved Hooks Override
        </label>
        <Input
          id={`${platformValue}-approved-hooks`}
          placeholder="clarity, proof"
          value={override.approvedHooks}
          onChange={(event) =>
            onChange(platformValue, 'approvedHooks', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-banned-phrases`}
        >
          Banned Phrases Override
        </label>
        <Input
          id={`${platformValue}-banned-phrases`}
          placeholder="clickbait, jargon"
          value={override.bannedPhrases}
          onChange={(event) =>
            onChange(platformValue, 'bannedPhrases', event.target.value)
          }
        />
      </div>

      <div>
        <label
          className="mb-1 block text-xs font-medium"
          htmlFor={`${platformValue}-do-not-sound-like`}
        >
          Avoid Override
        </label>
        <Input
          id={`${platformValue}-do-not-sound-like`}
          placeholder="clickbait, jargon"
          value={override.doNotSoundLike}
          onChange={(event) =>
            onChange(platformValue, 'doNotSoundLike', event.target.value)
          }
        />
      </div>
    </>
  );
}
