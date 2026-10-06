import DeskTableView from '@pages/trends/desk/desk-table-view';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));
vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function video(id: string, url: string): DiscoveryDeskItem {
  return {
    contentType: 'video',
    engagement: 10,
    id,
    key: `viral_video:${id}`,
    kind: 'viral_video',
    matchedTrends: [],
    metrics: {},
    platform: 'youtube',
    raw: { kind: 'viral_video', video: { id, videoUrl: url } },
    remixSelector: null,
    source: 'trends',
    mediaUrl: url,
    title: id,
    velocity: 0,
    virality: 10,
  } as DiscoveryDeskItem;
}

describe('Discovery table previews', () => {
  it('expands one video and replaces it when another is hovered', async () => {
    render(
      <DeskTableView
        cursorKey={null}
        href={(path) => path}
        items={[
          video('First video', 'https://youtube.com/watch?v=dQw4w9WgXcQ'),
          video('Second video', 'https://youtube.com/watch?v=jNQXAC9IVRw'),
        ]}
        onCursor={vi.fn()}
        onToggleSelect={vi.fn()}
        selection={new Set()}
      />,
    );
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    fireEvent.pointerEnter(screen.getByRole('button', { name: /First video/ }));
    await screen.findByTitle('First video');
    fireEvent.pointerEnter(
      screen.getByRole('button', { name: /Second video/ }),
    );
    await screen.findByTitle('Second video');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(screen.queryByTitle('First video')).not.toBeInTheDocument();
    fireEvent.pointerLeave(
      screen.getByRole('button', { name: /Second video/ }),
    );
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});
