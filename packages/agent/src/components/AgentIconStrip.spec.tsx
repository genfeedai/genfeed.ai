import { AgentIconStrip } from '@genfeedai/agent/components/AgentIconStrip';
import { AGENT_PANEL_ICON_STRIP_WIDTH } from '@genfeedai/agent/constants/agent-panel.constant';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('AgentIconStrip', () => {
  it('renders the expand affordance at the strip width', () => {
    const { container } = render(<AgentIconStrip onExpand={vi.fn()} />);

    const strip = container.firstElementChild as HTMLElement;

    expect(strip).toHaveStyle({ width: `${AGENT_PANEL_ICON_STRIP_WIDTH}px` });
    expect(
      screen.getByRole('button', { name: 'Expand agent sidebar' }),
    ).toBeInTheDocument();
  });

  it('calls onExpand when the affordance is clicked', () => {
    const onExpand = vi.fn();
    render(<AgentIconStrip onExpand={onExpand} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand agent sidebar' }),
    );

    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
