import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

it('shows an indeterminate shared indicator without claiming a numeric value', () => {
  const { rerender } = render(
    <Progress isIndeterminate aria-label="Generating" />,
  );
  const progress = screen.getByRole('progressbar');
  expect(progress).not.toHaveAttribute('aria-valuenow');
  expect(progress.firstElementChild).toHaveClass('w-1/3', 'animate-pulse');
  expect(progress.firstElementChild).not.toHaveStyle({
    transform: 'translateX(-100%)',
  });
  rerender(<Progress value={40} aria-label="Generating" />);
  expect(progress).toHaveAttribute('aria-valuenow', '40');
  expect(progress.firstElementChild).not.toHaveClass('animate-pulse');
  expect(progress.firstElementChild).toHaveStyle({
    transform: 'translateX(-60%)',
  });
});
