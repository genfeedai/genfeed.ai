'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  BrandPromptIntent,
  IBrandConversationStarter,
  IBrandPromptSeed,
} from '@genfeedai/contracts/interfaces';
import type { AgentProfilePromptingFieldsProps } from '@props/pages/brand-detail.props';
import { Button } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** Mirrors `UpdateBrandConversationStarterDto` / `UpdateBrandPromptSeedDto`. */
const STARTER_LABEL_MAX = 32;
const STARTER_PROMPT_MAX = 220;
const TEXT_FIELD_MAX = 200;
const PROMPT_INTENTS: BrandPromptIntent[] = ['create', 'plan', 'analyze'];

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createStarterId(): string {
  return `starter-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Editor for `agentConfig.prompting`: prompt seeds and the conversation
 * starters the agent prompt bar offers. Every change saves the whole list, the
 * same full-payload contract the rest of the brand voice card uses.
 */
export default function AgentProfilePromptingFields({
  conversationStarters,
  isDisabled,
  onSave,
  seeds,
}: AgentProfilePromptingFieldsProps) {
  const translate = useTranslations('pages.brandAgentProfile.prompting');

  const saveSeeds = (nextSeeds: IBrandPromptSeed[]) =>
    onSave({ conversationStarters, seeds: nextSeeds });
  const saveStarters = (nextStarters: IBrandConversationStarter[]) =>
    onSave({ conversationStarters: nextStarters, seeds });

  const updateSeed = (index: number, patch: Partial<IBrandPromptSeed>) =>
    saveSeeds(
      seeds.map((seed, seedIndex) =>
        seedIndex === index ? { ...seed, ...patch } : seed,
      ),
    );
  const updateStarter = (
    index: number,
    patch: Partial<IBrandConversationStarter>,
  ) =>
    saveStarters(
      conversationStarters.map((starter, starterIndex) =>
        starterIndex === index ? { ...starter, ...patch } : starter,
      ),
    );

  const removeButton = (onClick: () => void) => (
    <Button
      ariaLabel={translate('remove')}
      icon={<Trash2 className="size-3.5" />}
      isDisabled={isDisabled}
      onClick={onClick}
      size={ButtonSize.XS}
      tooltip={translate('remove')}
      variant={ButtonVariant.GHOST}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {seeds.length === 0 && conversationStarters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translate('empty')}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{translate('seedsTitle')}</p>
          <Button
            icon={<Plus className="size-3.5" />}
            isDisabled={isDisabled}
            label={translate('addSeed')}
            onClick={() =>
              void saveSeeds([
                ...seeds,
                { angle: '', audience: '', preferredFormats: [], topic: '' },
              ]).catch(() => undefined)
            }
            size={ButtonSize.XS}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
        {seeds.map((seed, index) => (
          <div
            className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-start"
            // Seeds carry no id; their position is their identity.
            key={index}
          >
            <Field label={translate('topic')}>
              <EditableText
                ariaLabel={`${translate('seedsTitle')} ${index + 1} ${translate('topic')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                maxLength={TEXT_FIELD_MAX}
                onSave={(value) => updateSeed(index, { topic: value.trim() })}
                value={seed.topic}
              />
            </Field>
            <Field label={translate('angle')}>
              <EditableText
                ariaLabel={`${translate('seedsTitle')} ${index + 1} ${translate('angle')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                maxLength={TEXT_FIELD_MAX}
                onSave={(value) => updateSeed(index, { angle: value.trim() })}
                value={seed.angle}
              />
            </Field>
            <Field label={translate('audience')}>
              <EditableText
                ariaLabel={`${translate('seedsTitle')} ${index + 1} ${translate('audience')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                maxLength={TEXT_FIELD_MAX}
                onSave={(value) =>
                  updateSeed(index, { audience: value.trim() })
                }
                value={seed.audience}
              />
            </Field>
            <Field label={translate('formats')}>
              <EditableText
                ariaLabel={`${translate('seedsTitle')} ${index + 1} ${translate('formats')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                onSave={(value) =>
                  updateSeed(index, { preferredFormats: parseList(value) })
                }
                value={seed.preferredFormats.join(', ')}
              />
            </Field>
            {removeButton(() => {
              void saveSeeds(
                seeds.filter((_, seedIndex) => seedIndex !== index),
              ).catch(() => undefined);
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{translate('startersTitle')}</p>
          <Button
            icon={<Plus className="size-3.5" />}
            isDisabled={isDisabled}
            label={translate('addStarter')}
            onClick={() =>
              void saveStarters([
                ...conversationStarters,
                {
                  id: createStarterId(),
                  intent: 'create',
                  label: '',
                  prompt: '',
                  topic: '',
                },
              ]).catch(() => undefined)
            }
            size={ButtonSize.XS}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
        {conversationStarters.map((starter, index) => (
          <div
            className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_8rem_auto] md:items-start"
            key={starter.id}
          >
            <Field label={translate('label')}>
              <EditableText
                ariaLabel={`${translate('startersTitle')} ${index + 1} ${translate('label')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                maxLength={STARTER_LABEL_MAX}
                onSave={(value) =>
                  updateStarter(index, { label: value.trim() })
                }
                value={starter.label}
              />
            </Field>
            <Field label={translate('prompt')}>
              <EditableText
                ariaLabel={`${translate('startersTitle')} ${index + 1} ${translate('prompt')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                isMultiline
                maxLength={STARTER_PROMPT_MAX}
                onSave={(value) =>
                  updateStarter(index, { prompt: value.trim() })
                }
                value={starter.prompt}
              />
            </Field>
            <Field label={translate('topic')}>
              <EditableText
                ariaLabel={`${translate('startersTitle')} ${index + 1} ${translate('topic')}`}
                displayClassName="text-sm"
                isDisabled={isDisabled}
                maxLength={TEXT_FIELD_MAX}
                onSave={(value) =>
                  updateStarter(index, { topic: value.trim() })
                }
                value={starter.topic}
              />
            </Field>
            <Field label={translate('intent')}>
              <Select
                disabled={isDisabled}
                onValueChange={(value: BrandPromptIntent) => {
                  void updateStarter(index, { intent: value }).catch(
                    () => undefined,
                  );
                }}
                value={starter.intent}
              >
                <SelectTrigger
                  aria-label={`${translate('startersTitle')} ${index + 1} ${translate('intent')}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_INTENTS.map((intent) => (
                    <SelectItem key={intent} value={intent}>
                      {translate(`intents.${intent}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {removeButton(() => {
              void saveStarters(
                conversationStarters.filter(
                  (_, starterIndex) => starterIndex !== index,
                ),
              ).catch(() => undefined);
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
