import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

it('shows an indeterminate shared indicator without claiming a numeric value', () => {
  const { rerender } = render(
    <Progress isIndeterminate aria-label="Generating" />,
  );
  const progress = screen.getByRole('progressbar');
  expect(progress).not.toHaveAttribute('aria-valuenow');
  expect(progress.firstElementChild).toHaveClass(
    'w-1/3',
    'motion-safe:animate-pulse',
  );
  expect(progress.firstElementChild).not.toHaveStyle({
    transform: 'translateX(-100%)',
  });
  rerender(<Progress value={40} aria-label="Generating" />);
  expect(progress).toHaveAttribute('aria-valuenow', '40');
  expect(progress.firstElementChild).not.toHaveClass(
    'motion-safe:animate-pulse',
  );
  expect(progress.firstElementChild).toHaveStyle({
    transform: 'translateX(-60%)',
  });
});

it.each([
  ['destructive', 'bg-destructive'],
  ['neutral', 'bg-foreground/60'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
])(
  'paints the %s tone on the indicator instead of the primary fill',
  (tone, fill) => {
    render(
      <Progress
        aria-label="Usage"
        tone={tone as 'destructive' | 'neutral' | 'success' | 'warning'}
        value={25}
      />,
    );
    const indicator = screen.getByRole('progressbar').firstElementChild;
    expect(indicator).toHaveClass(fill);
    expect(indicator).not.toHaveClass('bg-primary');
  },
);

it.each([
  ['xs', 'h-1'],
  ['sm', 'h-1.5'],
  ['md', 'h-2'],
  ['lg', 'h-2.5'],
])('sizes the %s bar to %s', (size, height) => {
  render(
    <Progress
      aria-label="Usage"
      size={size as 'xs' | 'sm' | 'md' | 'lg'}
      value={25}
    />,
  );
  expect(screen.getByRole('progressbar')).toHaveClass(height);
});

it('defaults to the medium primary bar', () => {
  render(<Progress aria-label="Usage" value={25} />);
  expect(screen.getByRole('progressbar')).toHaveClass('h-2', 'bg-primary/20');
});
