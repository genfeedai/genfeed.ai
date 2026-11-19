import {
  applyPageControlChanges,
  readPageControls,
  undoPageControlChanges,
} from '@genfeedai/agent/utils/page-controls.bridge';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import SettingSwitch from '@/components/ui/setting-switch';
import { createPageControlsBridge } from './page-controls-bridge';

function Preferences({
  onSave,
}: {
  onSave: (label: string, isOn: boolean) => void;
}) {
  const [recap, setRecap] = useState(true);
  const [agent, setAgent] = useState(false);
  const [billing, setBilling] = useState(true);

  return (
    <div>
      <SettingSwitch
        isChecked={recap}
        label="Weekly recap"
        onCheckedChange={(isOn) => {
          setRecap(isOn);
          onSave('Weekly recap', isOn);
        }}
      />
      <SettingSwitch
        isChecked={agent}
        label="Agent Emails"
        onCheckedChange={(isOn) => {
          setAgent(isOn);
          onSave('Agent Emails', isOn);
        }}
      />
      <div data-agent-confirm="Changes how your card is charged">
        <SettingSwitch
          isChecked={billing}
          label="Auto top-up"
          onCheckedChange={(isOn) => {
            setBilling(isOn);
            onSave('Auto top-up', isOn);
          }}
        />
      </div>
    </div>
  );
}

function SavedPreference({ save }: { save: () => Promise<boolean> }) {
  const [isChecked, setIsChecked] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function savePreference(next: boolean) {
    setIsSaving(true);
    if (await save()) {
      setIsChecked(next);
    }
    setIsSaving(false);
  }

  return (
    <SettingSwitch
      isChecked={isChecked}
      isDisabled={isSaving}
      label="Weekly recap"
      onCheckedChange={(next) => void savePreference(next)}
    />
  );
}

function isOn(label: string): boolean {
  return (
    screen.getByRole('switch', { name: label }).getAttribute('aria-checked') ===
    'true'
  );
}

describe('the page controls bridge', () => {
  it('reports the page switches by name with their value for the chat request', () => {
    render(<Preferences onSave={() => undefined} />);

    expect(
      readPageControls()?.map((control) => ({
        actions: control.actions,
        confirm: control.confirm,
        label: control.label,
        state: control.state,
      })),
    ).toEqual([
      {
        actions: ['setChecked'],
        confirm: undefined,
        label: 'Weekly recap',
        state: { checked: true },
      },
      {
        actions: ['setChecked'],
        confirm: undefined,
        label: 'Agent Emails',
        state: { checked: false },
      },
      {
        actions: ['setChecked'],
        confirm: 'Changes how your card is charged',
        label: 'Auto top-up',
        state: { checked: true },
      },
    ]);
  });

  it('applies an approved change through the control, so the page saves it as a click would', async () => {
    const saved: string[] = [];
    render(
      <Preferences
        onSave={(label, isChecked) => saved.push(`${label}=${isChecked}`)}
      />,
    );

    const outcomes = await applyPageControlChanges([
      { action: 'setChecked', label: 'Weekly recap', value: false },
      { action: 'setChecked', label: 'Agent Emails', value: true },
      { action: 'setChecked', label: 'Agent Emails', value: true },
    ]);

    expect(outcomes).toMatchObject([
      { revert: { applied: false, previous: true }, status: 'applied' },
      { revert: { applied: true, previous: false }, status: 'applied' },
      { status: 'unchanged' },
    ]);
    expect(saved).toEqual(['Weekly recap=false', 'Agent Emails=true']);
    expect([isOn('Weekly recap'), isOn('Agent Emails')]).toEqual([false, true]);
  });

  it('offers Undo after the controlled switch saves and reads back its value', async () => {
    const save = Promise.withResolvers<boolean>();
    render(<SavedPreference save={() => save.promise} />);
    const recap = screen.getByRole('switch', { name: 'Weekly recap' });

    const pending = applyPageControlChanges([
      { action: 'setChecked', label: 'Weekly recap', value: false },
    ]);
    await waitFor(() => expect(recap).toBeDisabled());
    expect(recap).toBeChecked();
    await act(async () => save.resolve(true));

    const [outcome] = await pending;
    expect(outcome).toMatchObject({
      revert: { applied: false, previous: true },
      status: 'applied',
    });
    expect(recap).not.toBeChecked();
    if (outcome.status !== 'applied' || !outcome.revert) {
      throw new Error('Expected an undo step for Weekly recap');
    }
    await expect(undoPageControlChanges([outcome.revert])).resolves.toEqual([
      { status: 'restored' },
    ]);
    expect(recap).toBeChecked();
  });

  it('reports a failed save when the controlled switch keeps its value', async () => {
    const save = Promise.withResolvers<boolean>();
    render(<SavedPreference save={() => save.promise} />);
    const recap = screen.getByRole('switch', { name: 'Weekly recap' });

    const pending = applyPageControlChanges([
      { action: 'setChecked', label: 'Weekly recap', value: false },
    ]);
    await waitFor(() => expect(recap).toBeDisabled());
    await act(async () => save.resolve(false));

    await expect(pending).resolves.toMatchObject([
      { reason: 'failed', status: 'refused' },
    ]);
    expect(recap).toBeChecked();
  });

  it('leaves a control that needs the person, and one that is not on the page, alone', async () => {
    const saved: string[] = [];
    render(
      <Preferences
        onSave={(label, isChecked) => saved.push(`${label}=${isChecked}`)}
      />,
    );

    const outcomes = await applyPageControlChanges([
      { action: 'setChecked', label: 'Auto top-up', value: false },
      { action: 'setChecked', label: 'Newsletter', value: true },
    ]);

    expect(outcomes).toEqual([
      {
        detail: 'Changes how your card is charged',
        reason: 'needs-person',
        status: 'refused',
      },
      { reason: 'missing', status: 'refused' },
    ]);
    expect(saved).toEqual([]);
    expect(isOn('Auto top-up')).toBe(true);
  });

  it('refuses anything but a value change, even if a step asks for it', async () => {
    render(<Preferences onSave={() => undefined} />);
    const bridge = createPageControlsBridge();

    const result = await bridge.act({
      steps: [{ action: 'press', ref: 'Weekly recap' }],
    });

    expect(result.ok).toBe(false);
    expect(isOn('Weekly recap')).toBe(true);
  });
});
