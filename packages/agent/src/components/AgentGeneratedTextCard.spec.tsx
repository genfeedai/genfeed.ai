import { AgentGeneratedTextCard } from '@genfeedai/agent/components/AgentGeneratedTextCard';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('AgentGeneratedTextCard', () => {
  it('renders multiline content preserving line breaks', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    render(<AgentGeneratedTextCard title="Generated Post" content={text} />);

    expect(screen.getByText('Generated Post')).toBeTruthy();
    expect(
      screen.getByText((content, node) => {
        return (
          node?.tagName.toLowerCase() === 'p' && content.includes('Line 2')
        );
      }),
    ).toBeTruthy();
  });

  it('calls onCopy with exact content', async () => {
    const onCopy = vi.fn();
    const text = 'Copy this exact text';

    render(<AgentGeneratedTextCard content={text} onCopy={onCopy} />);

    await screen.getByLabelText('Copy generated content').click();
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(text);
  });

  it('renders regenerate action only when provided and triggers callback', async () => {
    const onRegenerate = vi.fn();
    const text = 'Regenerate me';

    const { rerender } = render(
      <AgentGeneratedTextCard content={text} onRegenerate={onRegenerate} />,
    );

    await screen.getByLabelText('Regenerate content').click();
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(<AgentGeneratedTextCard content={text} />);
    expect(screen.queryByLabelText('Regenerate content')).toBeNull();
  });
});
