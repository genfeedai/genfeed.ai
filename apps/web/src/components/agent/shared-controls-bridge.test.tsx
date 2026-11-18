import {
  applyPageControlChanges,
  readPageControls,
} from '@genfeedai/agent/utils/page-controls.bridge';
import { render, screen } from '@testing-library/react';
import { Checkbox } from '@ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { Switch } from '@ui/primitives/switch';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import './page-controls-bridge';

function SharedControls({ saved }: { saved: string[] }) {
  const [isPublic, setIsPublic] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [speed, setSpeed] = useState('standard');

  return (
    <div>
      <Switch
        isChecked={isPublic}
        label="Public profile"
        onCheckedChange={(next) => {
          setIsPublic(next);
          saved.push(`Public profile=${next}`);
        }}
      />
      <Checkbox
        isChecked={isSubscribed}
        label="Product updates"
        onCheckedChange={(next) => {
          setIsSubscribed(next === true);
          saved.push(`Product updates=${next === true}`);
        }}
      />
      <RadioGroup
        aria-label="Shipping speed"
        onValueChange={(next) => {
          setSpeed(next);
          saved.push(`Shipping speed=${next}`);
        }}
        value={speed}
      >
        <label>
          <RadioGroupItem value="standard" />
          Standard
        </label>
        <label>
          <RadioGroupItem value="express" />
          Express
        </label>
      </RadioGroup>
    </div>
  );
}

describe('the shared form controls and the page controls bridge', () => {
  it('lists the shared switch, checkbox and radio group by name with their value', () => {
    render(<SharedControls saved={[]} />);

    expect(
      readPageControls()?.map((control) => ({
        kind: control.kind,
        label: control.label,
        state: control.state,
      })),
    ).toEqual([
      { kind: 'switch', label: 'Public profile', state: { checked: false } },
      { kind: 'checkbox', label: 'Product updates', state: { checked: false } },
      {
        kind: 'radio',
        label: 'Shipping speed',
        state: { value: 'standard' },
      },
    ]);
  });

  it('applies approved changes through each control so the page saves them as a click would', async () => {
    const saved: string[] = [];
    render(<SharedControls saved={saved} />);

    const outcomes = await applyPageControlChanges([
      { action: 'setChecked', label: 'Public profile', value: true },
      { action: 'setChecked', label: 'Product updates', value: true },
      { action: 'setValue', label: 'Shipping speed', value: 'express' },
    ]);

    expect(outcomes).toEqual([
      { status: 'applied' },
      { status: 'applied' },
      { status: 'applied' },
    ]);
    expect(saved).toEqual([
      'Public profile=true',
      'Product updates=true',
      'Shipping speed=express',
    ]);
    expect(
      screen.getByRole('switch', { name: 'Public profile' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Product updates' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Express' })).toBeChecked();
  });
});
