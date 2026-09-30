import { AgentToolCallDisplay } from '@genfeedai/agent/components/AgentToolCallDisplay';
import type { AgentToolCall } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TOOL_LABELS } from './agent-tool-call-display.helpers';

type ToolCallProps = AgentToolCall & {
  creditsUsed?: number;
  durationMs?: number;
};

function makeToolCall(overrides: Partial<ToolCallProps> = {}): ToolCallProps {
  return {
    arguments: {},
    id: 'call-1',
    name: 'unknown_tool',
    status: 'running',
    ...overrides,
  } as ToolCallProps;
}

describe('AgentToolCallDisplay', () => {
  it('shows the running state for an in-flight call', () => {
    render(<AgentToolCallDisplay toolCall={makeToolCall()} />);

    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows the completed state', () => {
    render(
      <AgentToolCallDisplay toolCall={makeToolCall({ status: 'completed' })} />,
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows the failed state', () => {
    render(
      <AgentToolCallDisplay toolCall={makeToolCall({ status: 'failed' })} />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('humanizes an unlabelled tool name', () => {
    render(
      <AgentToolCallDisplay
        toolCall={makeToolCall({ name: 'mystery_tool' })}
      />,
    );

    expect(screen.getByText('Mystery Tool')).toBeInTheDocument();
  });

  it('prefers the friendly label when one exists', () => {
    const [name, label] = Object.entries(TOOL_LABELS)[0] ?? [];

    if (!name || !label) {
      throw new Error('TOOL_LABELS is empty');
    }

    render(<AgentToolCallDisplay toolCall={makeToolCall({ name })} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows credits only when a positive amount was spent', () => {
    const { rerender } = render(
      <AgentToolCallDisplay toolCall={makeToolCall({ creditsUsed: 0 })} />,
    );

    expect(screen.queryByText(/cr$/)).not.toBeInTheDocument();

    rerender(
      <AgentToolCallDisplay toolCall={makeToolCall({ creditsUsed: 12 })} />,
    );

    expect(screen.getByText('12 cr')).toBeInTheDocument();
  });

  it('shows a formatted duration when present', () => {
    render(
      <AgentToolCallDisplay toolCall={makeToolCall({ durationMs: 1500 })} />,
    );

    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('toggles the detail panel and passes arguments through', () => {
    render(
      <AgentToolCallDisplay
        toolCall={makeToolCall({
          arguments: { brandId: 'b-1' },
          resultSummary: 'Found 3 posts',
          status: 'completed',
        })}
      />,
    );

    const toggle = screen.getAllByRole('button')[0] as HTMLElement;

    expect(screen.queryByText('Found 3 posts')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Found 3 posts')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText('Found 3 posts')).not.toBeInTheDocument();
  });

  it('surfaces the error in the detail panel for a failed call', () => {
    render(
      <AgentToolCallDisplay
        toolCall={makeToolCall({ error: 'rate limited', status: 'failed' })}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText(/rate limited/)).toBeInTheDocument();
  });
});
