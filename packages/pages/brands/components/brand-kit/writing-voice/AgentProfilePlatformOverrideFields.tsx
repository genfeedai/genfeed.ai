'use client';

import type { AgentProfilePlatformOverrideFieldsProps } from '@props/pages/brand-detail.props';
import { EditableText } from '@ui/primitives/editable-text';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const AUTO_MODEL_SELECT_VALUE = '__auto__';

export default function AgentProfilePlatformOverrideFields({
  enabledModelIds,
  isDisabled,
  onSave,
  onSelectChange,
  override,
  platformValue,
}: AgentProfilePlatformOverrideFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label
          className="text-xs"
          htmlFor={`${platformValue}-canonical-source`}
        >
          Voice Source Override
        </Label>
        <Select
          disabled={isDisabled}
          value={override.canonicalSource || AUTO_MODEL_SELECT_VALUE}
          onValueChange={(value) =>
            onSelectChange(
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

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-default-model`}>
          Model Override
        </Label>
        <Select
          disabled={isDisabled}
          value={override.defaultModel || AUTO_MODEL_SELECT_VALUE}
          onValueChange={(value) =>
            onSelectChange(
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
            {enabledModelIds.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-tone`}>
          Tone Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Tone Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'tone', value)}
          value={override.tone}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-style`}>
          Style Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Style Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'style', value)}
          value={override.style}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-frequency`}>
          Frequency Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Frequency Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'frequency', value)}
          value={override.frequency}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-audience`}>
          Audience Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Audience Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'audience', value)}
          placeholder="developers, operators"
          value={override.audience}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-goals`}>
          Goals Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Goals Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'goals', value)}
          placeholder="engagement, leads"
          value={override.goals}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          className="text-xs"
          htmlFor={`${platformValue}-messaging-pillars`}
        >
          Messaging Pillars Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Messaging Pillars Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'messagingPillars', value)}
          placeholder="clarity, proof"
          value={override.messagingPillars}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-approved-hooks`}>
          Approved Hooks Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Approved Hooks Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'approvedHooks', value)}
          placeholder="clarity, proof"
          value={override.approvedHooks}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${platformValue}-banned-phrases`}>
          Banned Phrases Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Banned Phrases Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'bannedPhrases', value)}
          placeholder="clickbait, jargon"
          value={override.bannedPhrases}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          className="text-xs"
          htmlFor={`${platformValue}-do-not-sound-like`}
        >
          Avoid Override
        </Label>
        <EditableText
          ariaLabel={`${platformValue} Avoid Override`}
          displayClassName="text-sm"
          isDisabled={isDisabled}
          onSave={(value) => onSave(platformValue, 'doNotSoundLike', value)}
          placeholder="clickbait, jargon"
          value={override.doNotSoundLike}
        />
      </div>
    </>
  );
}
