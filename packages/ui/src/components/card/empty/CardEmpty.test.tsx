import { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import CardEmpty, { CardEmptyContent } from '@ui/card/empty/CardEmpty';

describe('CardEmpty', () => {
  it('should render without crashing', () => {
    const { container } = render(<CardEmpty />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('fires the action callback when the empty-state button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <CardEmpty
        label="No tasks"
        description="Tasks will appear here."
        action={{
          label: 'Create task',
          onClick,
          variant: ButtonVariant.DEFAULT,
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a custom actions slot instead of the single action button', () => {
    render(
      <CardEmpty
        label="No tasks"
        action={{
          label: 'Create task',
          onClick: () => undefined,
        }}
        actions={<span data-testid="custom-actions">Retry</span>}
      />,
    );

    expect(screen.getByTestId('custom-actions')).toHaveTextContent('Retry');
    expect(
      screen.queryByRole('button', { name: 'Create task' }),
    ).not.toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { rerender } = render(
      <CardEmpty label="No tasks" description="Tasks will appear here." />,
    );

    expect(screen.getByTestId('card-empty')).toHaveClass(
      'rounded-card',
      'bg-card',
      'shadow-border',
    );
    expect(screen.getByText('Tasks will appear here.')).not.toHaveClass('mb-3');

    rerender(
      <CardEmpty
        label="No tasks"
        description="Tasks will appear here."
        action={{
          label: 'Create task',
          onClick: () => undefined,
          variant: ButtonVariant.DEFAULT,
        }}
      />,
    );

    expect(screen.getByText('Tasks will appear here.')).toHaveClass('mb-3');
  });

  it('applies the large size title class on CardEmptyContent', () => {
    render(<CardEmptyContent label="Nothing here" size={CardEmptySize.LG} />);

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toHaveClass(
      'text-base',
    );
  });
});
