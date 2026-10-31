import { translateFromCatalog } from '@app-tests/next-intl.stub';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardAnimatic from './StoryboardAnimatic';

vi.mock('next-intl', async () => {
  const { translateFromCatalog: catalog } = await import(
    '@app-tests/next-intl.stub'
  );
  return { useTranslations: catalog };
});

const translate = translateFromCatalog('pages.studioStoryboard.animatic');

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
const images: {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  decode: ReturnType<typeof vi.fn>;
  src: string;
  complete: boolean;
}[] = [];
async function load(index?: number) {
  await act(async () => {
    for (const image of index === undefined ? images : [images[index]])
      image.onload?.();
  });
}
describe('zero-generation timed animatic', () => {
  beforeEach(() => {
    images.length = 0;
    vi.stubGlobal(
      'Image',
      class {
        onload = null;
        onerror = null;
        naturalWidth = 120;
        naturalHeight = 80;
        complete = false;
        src = '';
        decode = vi.fn(async () => undefined);
        constructor() {
          images.push(this);
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('requires real loaded dimensions then plays stills and dialogue, pauses and restarts', async () => {
    vi.useFakeTimers();
    render(<StoryboardAnimatic scope="run:1" shots={shots} />);
    expect(
      screen.getByRole('button', { name: translate('playStoryboard') }),
    ).toBeDisabled();
    expect(screen.getByText(translate('loadingStill'))).toBeVisible();
    await load();
    fireEvent.click(
      screen.getByRole('button', { name: translate('playStoryboard') }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(screen.getByText('Second line')).toBeVisible();
    expect(
      screen.getByRole('img', { name: translate('shotAlt', { ordinal: 2 }) }),
    ).toHaveAttribute('src', shots[1].stillUrl);
    fireEvent.click(screen.getByRole('button', { name: translate('pause') }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText('Second line')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: translate('restart') }));
    expect(screen.getByText('First line')).toBeVisible();
  });
  it('allows one loaded shot when another failed and holds its final frame', async () => {
    vi.useFakeTimers();
    render(<StoryboardAnimatic scope="run:1" shots={shots} />);
    await load(0);
    act(() => images[1].onerror?.());
    expect(
      screen.getByRole('button', { name: translate('playStoryboard') }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', {
        name: translate('playShot', { ordinal: 1 }),
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText('First line')).toBeVisible();
  });
  it('plays a loaded finite shot even when an earlier shot has a nonfinite duration', async () => {
    vi.useFakeTimers();
    render(
      <StoryboardAnimatic
        scope="run:1"
        shots={[{ ...shots[0], durationSeconds: Number.NaN }, shots[1]]}
      />,
    );
    await load();
    expect(
      screen.getByRole('button', {
        name: translate('playStoryboard'),
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', {
        name: translate('playShot', { ordinal: 2 }),
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByText('Second line')).toBeVisible();
    expect(screen.getByText('00:01 / 00:03')).toBeVisible();
  });
  it('offers a direct retry for a failed noncurrent shot without advancing or autoplaying', async () => {
    render(<StoryboardAnimatic scope="run:1" shots={shots} />);
    await load(0);
    act(() => images[1].onerror?.());
    expect(
      screen.getByRole('button', {
        name: translate('playShot', { ordinal: 2 }),
      }),
    ).toBeDisabled();
    expect(screen.getByText('First line')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: translate('retryShotStill', { ordinal: 2 }),
      }),
    );
    expect(images.at(-1)?.src).toBe(shots[1].stillUrl);
    await load(2);
    expect(
      screen.getByRole('button', {
        name: translate('playStoryboard'),
      }),
    ).toBeEnabled();
    expect(screen.getByText('First line')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: translate('pause') }),
    ).not.toBeInTheDocument();
  });
  it('pauses the clock when an active preview fails and retries the exact URL', async () => {
    vi.useFakeTimers();
    render(<StoryboardAnimatic scope="run:1" shots={shots} />);
    await load();
    fireEvent.click(
      screen.getByRole('button', { name: translate('playStoryboard') }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    fireEvent.error(
      screen.getByRole('img', { name: translate('shotAlt', { ordinal: 1 }) }),
    );
    expect(screen.getByText(translate('stillUnavailable'))).toBeVisible();
    const time = screen.getByText('00:01 / 00:05').textContent;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText(time ?? '')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: translate('retryStill') }),
    );
    expect(images.at(-1)?.src).toBe(shots[0].stillUrl);
    await load(2);
    expect(
      screen.getByRole('button', { name: translate('playStoryboard') }),
    ).toBeEnabled();
  });
  it('rejects decode failure and zero dimensions and ignores detached old attempts', async () => {
    const { rerender } = render(
      <StoryboardAnimatic scope="run:1" shots={shots} />,
    );
    images[0].decode.mockRejectedValue(new Error('Decode failed'));
    await load(0);
    expect(screen.getByText(translate('stillUnavailable'))).toBeVisible();
    const oldLoad = images[1].onload;
    rerender(
      <StoryboardAnimatic
        scope="run:2"
        shots={[{ ...shots[0], stillUrl: 'https://cdn.test/replaced.png' }]}
      />,
    );
    images[2].naturalWidth = 0;
    await load(2);
    await act(async () => oldLoad?.());
    expect(
      screen.getByRole('button', { name: translate('playStoryboard') }),
    ).toBeDisabled();
    expect(screen.getByText(translate('stillUnavailable'))).toBeVisible();
  });
});
