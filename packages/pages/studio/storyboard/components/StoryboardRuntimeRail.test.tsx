import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardRuntimeRail from './StoryboardRuntimeRail';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const shots = [
  { id: 'a', ordinal: 1, durationSeconds: 5 },
  { id: 'b', ordinal: 2, durationSeconds: null },
];

describe('storyboard runtime meter', () => {
  it('reads used and budget seconds with the shot count and format', () => {
    render(
      <StoryboardRuntimeRail
        budgetSeconds={10}
        formatLabel="9:16"
        onSelectShot={vi.fn()}
        shots={shots}
      />,
    );
    expect(screen.getByText('5s / 10s')).toBeInTheDocument();
    expect(screen.getByText('2 shots · 9:16')).toBeInTheDocument();
  });
  it('asks for a runtime when none is chosen', () => {
    render(
      <StoryboardRuntimeRail
        budgetSeconds={null}
        onSelectShot={vi.fn()}
        shots={shots}
      />,
    );
    expect(screen.getByText('5s / Choose runtime')).toBeInTheDocument();
  });
  it('selects a shot from its segment and describes an unset duration', () => {
    const onSelectShot = vi.fn();
    render(
      <StoryboardRuntimeRail
        budgetSeconds={10}
        onSelectShot={onSelectShot}
        selectedShotId="a"
        shots={shots}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Shot 2, duration not set' }),
    );
    expect(onSelectShot).toHaveBeenCalledWith('b');
    expect(
      screen.getByRole('button', { name: 'Shot 1, 5 seconds' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
  it('announces when the shots run past the budget', () => {
    render(
      <StoryboardRuntimeRail
        budgetSeconds={4}
        onSelectShot={vi.fn()}
        shots={shots}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Shorten another shot');
  });
});
