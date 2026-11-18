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

function LabeledSwitch({ calls }: { calls: boolean[] }) {
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

describe('Switch', () => {
  it('is named by its aria-label and starts off', () => {
    render(<Switch aria-label="Public profile" />);

    const root = screen.getByRole('switch', { name: /public profile/i });

    expect(root).toHaveAttribute('aria-checked', 'false');
    expect(root).not.toHaveAttribute('data-checked');
  });

  it('is named by its label and described by its description', () => {
    render(
      <Switch description="Make your profile visible" label="Public Profile" />,
    );

    expect(
      screen.getByRole('switch', { name: 'Public Profile' }),
    ).toHaveAccessibleDescription('Make your profile visible');
  });

  it('keeps its own aria-label as the name when a label shows the state', () => {
    render(<Switch aria-label="Playground" isChecked label="Shown" />);

    expect(screen.getByRole('switch', { name: 'Playground' })).toBeChecked();
    expect(screen.getByText('Shown')).toBeInTheDocument();
  });

  it('sizes the md track from the size prop', () => {
    render(<Switch aria-label="Bot status" size="md" />);

    expect(
      screen.getByRole('switch', { name: /bot status/i }).className,
    ).toContain('h-8 w-14');
  });

  it('toggles aria-checked when clicked', async () => {
    const user = userEvent.setup();
    render(<ControlledSwitch />);

    const root = screen.getByRole('switch', { name: /recurring schedule/i });
    expect(root).toHaveAttribute('aria-checked', 'false');

    await user.click(root);

    expect(root).toHaveAttribute('aria-checked', 'true');
    expect(root).toHaveAttribute('data-checked');
  });

  it('toggles once when its label is clicked', async () => {
    const user = userEvent.setup();
    const calls: boolean[] = [];

    render(<LabeledSwitch calls={calls} />);
    await user.click(screen.getByText('Public Profile'));

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
  it('shows a skeleton in place of the toggle while its value loads, keeping the label', () => {
    render(
      <Switch
        aria-label="Workflow Emails"
        description="Send an email when a workflow fails."
        isLoading
        label="Workflow Emails"
      />,
    );

    expect(
      screen.getByRole('status', { name: 'Workflow Emails' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.getByText('Send an email when a workflow fails.'),
    ).toBeInTheDocument();
  });
});
