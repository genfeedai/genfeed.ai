// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from '@ui/primitives/switch';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

function ControlledSwitch() {
  const [isOn, setIsOn] = useState(false);
  return (
    <Switch
      aria-label="Recurring schedule"
      isChecked={isOn}
      onCheckedChange={setIsOn}
    />
  );
}

describe('Switch', () => {
  it('forces high-contrast track/thumb and explicit on/off travel', () => {
    render(<Switch aria-label="Public profile" />);

    const root = screen.getByRole('switch', { name: /public profile/i });

    expect(root.className).toContain('ship-ui');
    expect(root.className).toContain('justify-start');
    expect(root.className).toContain(
      'data-[state=unchecked]:[&>span]:!translate-x-0.5',
    );
    expect(root.className).toContain(
      'data-[state=checked]:[&>span]:!translate-x-4',
    );
    expect(root.className).toContain('data-[state=checked]:!bg-white');
    expect(root.className).toContain('data-[state=checked]:[&>span]:!bg-black');
  });

  it('toggles aria-checked when clicked', async () => {
    const user = userEvent.setup();
    render(<ControlledSwitch />);

    const root = screen.getByRole('switch', { name: /recurring schedule/i });
    expect(root).toHaveAttribute('aria-checked', 'false');
    expect(root).toHaveAttribute('data-state', 'unchecked');

    await user.click(root);

    expect(root).toHaveAttribute('aria-checked', 'true');
    expect(root).toHaveAttribute('data-state', 'checked');
  });

  it('does not double-toggle when a label is present (no nested label)', async () => {
    const user = userEvent.setup();
    const calls: boolean[] = [];

    function LabeledSwitch() {
      const [isOn, setIsOn] = useState(false);
      return (
        <Switch
          label="Public Profile"
          description="Make your profile visible"
          isChecked={isOn}
          onCheckedChange={(next) => {
            calls.push(next);
            setIsOn(next);
          }}
        />
      );
    }

    render(<LabeledSwitch />);
    await user.click(screen.getByRole('switch'));

    expect(calls).toEqual([true]);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('places the control after the label and centers the row', () => {
    const { container } = render(
      <Switch
        label="Public Profile"
        description="Make your profile visible"
        aria-label="Public Profile"
      />,
    );

    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('items-center');
    expect(row.className).toContain('justify-between');

    const switchEl = screen.getByRole('switch');
    const label = screen.getByText('Public Profile');
    // Label text precedes the switch in DOM (toggle sits on the right).
    expect(
      Boolean(
        label.compareDocumentPosition(switchEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });
});
