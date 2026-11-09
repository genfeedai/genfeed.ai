import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfileMediaCredit from './ProfileMediaCredit';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfileMediaCredit', () => {
  it('names the creator, the model, the length and the views', () => {
    render(
      <ProfileMediaCredit
        creatorHandle="ana"
        durationSeconds={8}
        kind="video"
        mediaId="ing-1"
        modelKey="veo-3"
        modelLabel="Veo 3"
        viewCount={1284}
      />,
    );

    expect(screen.getByRole('link', { name: '@ana' })).toHaveAttribute(
      'href',
      '/@ana',
    );
    expect(screen.getByRole('link', { name: 'Veo 3' })).toHaveAttribute(
      'href',
      '/models#model-veo-3',
    );
    expect(screen.getByText('0:08')).toBeInTheDocument();
    expect(screen.getByText('1.3K views')).toBeInTheDocument();
  });

  it('opens the agent with a prompt to make one like it', () => {
    render(
      <ProfileMediaCredit
        creatorHandle="ana"
        kind="video"
        mediaId="ing-1"
        modelKey="veo-3"
        modelLabel="Veo 3"
      />,
    );

    const href = screen
      .getByRole('link', { name: 'Recreate in Genfeed' })
      .getAttribute('href');
    expect(new URL(href ?? '').searchParams.get('prompt')).toBe(
      "Make a video like @ana's on genfeed.ai with Veo 3",
    );
  });

  it('counts a click on Recreate in Genfeed', () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileMediaCredit kind="image" mediaId="ing-1" />);

    screen.getByRole('link', { name: 'Recreate in Genfeed' }).click();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/public\/media\/ing-1\/recreations$/);
    expect(init).toMatchObject({ keepalive: true, method: 'POST' });
  });

  it('leaves out what it does not know', () => {
    render(
      <ProfileMediaCredit kind="image" mediaId="ing-1" modelKey="retired" />,
    );

    expect(screen.queryByText(/Made with/)).not.toBeInTheDocument();
    expect(screen.queryByText(/views?$/)).not.toBeInTheDocument();
  });

  it('reports the asset to support by email', () => {
    render(<ProfileMediaCredit kind="image" mediaId="ing-1" />);

    const href = screen
      .getByRole('link', { name: 'Report' })
      .getAttribute('href');
    expect(href).toBe(
      'mailto:support@genfeed.ai?body=I%20want%20to%20report%20this%20asset%20on%20genfeed.ai%20%28id%20ing-1%29.%20Reason%3A&subject=Report%20content%20on%20genfeed.ai',
    );
  });
});
