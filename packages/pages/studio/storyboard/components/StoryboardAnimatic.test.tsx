import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoryboardAnimatic from './StoryboardAnimatic';

const shots = [
  {
    id: 'a',
    ordinal: 1,
    durationSeconds: 2,
    stillUrl: 'https://cdn.test/a.png',
    dialogue: 'First line',
  },
  {
    id: 'b',
    ordinal: 2,
    durationSeconds: 3,
    stillUrl: 'https://cdn.test/b.png',
    dialogue: 'Second line',
  },
];
describe('zero-generation timed animatic', () => {
  afterEach(() => vi.useRealTimers());
  it('plays persisted stills and dialogue for each shot duration, pauses and restarts', async () => {
    vi.useFakeTimers();
    render(<StoryboardAnimatic scope="run:1" shots={shots} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play storyboard' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(screen.getByText('Second line')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Shot 2' })).toHaveAttribute(
      'src',
      shots[1].stillUrl,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText('Second line')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByText('First line')).toBeVisible();
  });
  it('can preview one shot and holds its last frame', async () => {
    vi.useFakeTimers();
    render(<StoryboardAnimatic scope="run:1" shots={shots} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play shot 1' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText('First line')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Play storyboard' }),
    ).toBeEnabled();
  });
  it('blocks incomplete full playback and clears playback on scope change', () => {
    const { rerender } = render(
      <StoryboardAnimatic
        scope="run:1"
        shots={[{ ...shots[0], stillUrl: undefined }, shots[1]]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Play storyboard' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play shot 2' })).toBeEnabled();
    rerender(<StoryboardAnimatic scope="run:2" shots={shots} />);
    expect(screen.getByText('00:00 / 00:05')).toBeVisible();
  });
});
