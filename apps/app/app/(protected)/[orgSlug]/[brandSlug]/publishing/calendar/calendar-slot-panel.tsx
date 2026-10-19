'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import {
  ButtonSize,
  ButtonVariant,
  CalendarSlotState,
} from '@genfeedai/contracts';
import type {
  CalendarSlotBodyProps,
  CalendarSlotPanelProps,
} from '@props/publishing/calendar-slot-panel.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

function CalendarSlotBody({
  isPending,
  onCancel,
  onEditCadence,
  onGenerate,
  onSkip,
  onWrite,
  slot,
}: CalendarSlotBodyProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.calendar');
  const [brief, setBrief] = useState('');
  const isGenerating = slot.state === CalendarSlotState.GENERATING;

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="calendar-slot-panel">
      <p className="text-sm text-muted-foreground">
        {slot.state === CalendarSlotState.GENERATE_FAILED
          ? slot.lastFailureReason || translate('generateFailed')
          : slot.cadenceId
            ? translate('generateCadenceHint')
            : translate('generateOneOffHint')}
      </p>
      <Input
        label={translate('briefOverride')}
        name="slot-brief"
        onChange={(event) => setBrief(event.target.value)}
        placeholder={slot.resolvedBrief || translate('optionalPrompt')}
        value={brief}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          isDisabled={isPending || isGenerating}
          onClick={() => onGenerate(brief || undefined)}
          size={ButtonSize.SM}
        >
          {translate('generate')}
        </Button>
        <Button
          isDisabled={isPending || isGenerating}
          onClick={onWrite}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        >
          {translate('write')}
        </Button>
        {isGenerating ? (
          <Button
            isDisabled={isPending}
            onClick={onCancel}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          >
            {translate('cancel')}
          </Button>
        ) : (
          <Button
            isDisabled={isPending}
            onClick={onSkip}
            size={ButtonSize.SM}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {translate('skip')}
          </Button>
        )}
        {slot.cadenceId && onEditCadence ? (
          <Button
            isDisabled={isPending}
            onClick={onEditCadence}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          >
            {translate('editCadence')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The calendar slot inspector, shown in the shell's right context sidebar. */
export default function CalendarSlotPanel({
  onClose,
  slot,
  ...actions
}: CalendarSlotPanelProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.calendar');

  if (!slot) {
    return (
      <ContextSidebarPanel onClose={onClose} selection={null}>
        {null}
      </ContextSidebarPanel>
    );
  }

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={{
        id: slot.identityKey,
        kind: 'slot',
        origin: 'user',
        subtitle: `${slot.format} · ${new Date(slot.instant).toLocaleString('en-US')}`,
        title: translate('missingSlot'),
      }}
    >
      {/* Keyed so a brief typed for one slot never carries to the next. */}
      <CalendarSlotBody {...actions} key={slot.identityKey} slot={slot} />
    </ContextSidebarPanel>
  );
}
