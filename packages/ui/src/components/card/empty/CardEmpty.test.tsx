import { ButtonVariant } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import CardEmpty from '@ui/card/empty/CardEmpty';

describe('CardEmpty', () => {
  it('should render without crashing', () => {
    const { container } = render(<CardEmpty />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    // TODO: Add interaction tests
  });

  it('should apply correct styles and classes', () => {
    const { rerender } = render(
      <CardEmpty label="No tasks" description="Tasks will appear here." />,
    );

    expect(screen.getByText('Tasks will appear here.')).not.toHaveClass('mb-6');

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

    expect(screen.getByText('Tasks will appear here.')).toHaveClass('mb-6');
  });
});
