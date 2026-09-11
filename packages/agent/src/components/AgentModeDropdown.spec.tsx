import { AgentModeDropdown } from '@genfeedai/agent/components/AgentModeDropdown';
import { AgentThreadMode } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('AgentModeDropdown', () => {
  it('reflects the active mode on the trigger', () => {
    render(
      <AgentModeDropdown mode={AgentThreadMode.AUTO} onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Agent mode: Auto' }),
    ).toBeTruthy();
  });

  it('renders exactly Auto, Manual and Plan as options', async () => {
    render(
      <AgentModeDropdown mode={AgentThreadMode.MANUAL} onChange={vi.fn()} />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    );

    expect(
      await screen.findByRole('menuitemradio', { name: /^Auto/ }),
    ).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /^Manual/ })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /^Plan/ })).toBeTruthy();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
  });

  it('marks the active mode as checked', async () => {
    render(
      <AgentModeDropdown mode={AgentThreadMode.PLAN} onChange={vi.fn()} />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Agent mode: Plan' }),
    );

    const planItem = await screen.findByRole('menuitemradio', {
      name: /^Plan/,
    });
    expect(planItem).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', { name: /^Auto/ }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the selected mode', async () => {
    const onChange = vi.fn();
    render(
      <AgentModeDropdown mode={AgentThreadMode.MANUAL} onChange={onChange} />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    );

    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: /^Plan/ }),
    );

    expect(onChange).toHaveBeenCalledWith(AgentThreadMode.PLAN);
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AgentModeDropdown mode={AgentThreadMode.MANUAL} onChange={onChange} />,
    );

    const trigger = screen.getByRole('button', { name: 'Agent mode: Manual' });
    trigger.focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('menuitemradio', { name: /^Auto/ });
    // Radix type-ahead: typing the leading character of an item's text jumps
    // focus to it, so this exercises real keyboard navigation rather than
    // assuming which item starts focused.
    await user.keyboard('Plan');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(AgentThreadMode.PLAN);
    });
  });

  it('disables the trigger when isDisabled is set', () => {
    render(
      <AgentModeDropdown
        isDisabled
        mode={AgentThreadMode.MANUAL}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Agent mode: Manual' }),
    ).toBeDisabled();
  });
});
