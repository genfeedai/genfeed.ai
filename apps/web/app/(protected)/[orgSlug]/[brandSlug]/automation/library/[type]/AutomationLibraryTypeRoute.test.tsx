/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationLibraryTypeRoute from './AutomationLibraryTypeRoute';
import '@testing-library/jest-dom/vitest';

const route = vi.hoisted(() => ({ type: undefined as string | undefined }));

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => ({ type: route.type }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock(
  '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton',
  () => ({
    default: () => <p>Loading agents</p>,
  }),
);
vi.mock('@/features/workflows/components/bots/TwitterReplyBot', () => ({
  default: () => <h1>Twitter reply agent</h1>,
}));
vi.mock('./TwitchChatBot', () => ({ default: () => <h1>Twitch agent</h1> }));
vi.mock('./YoutubeChatBot', () => ({ default: () => <h1>YouTube agent</h1> }));

describe('AutomationLibraryTypeRoute', () => {
  beforeEach(() => {
    route.type = undefined;
  });

  it('shows the page placeholder in the prerendered shell, before the type is known', () => {
    render(<AutomationLibraryTypeRoute />);

    expect(screen.getByText('Loading agents')).toBeInTheDocument();
  });

  it.each([
    ['twitch-chat', 'Twitch agent'],
    ['twitter-reply', 'Twitter reply agent'],
    ['youtube-chat', 'YouTube agent'],
  ])('opens the %s agent', (type, heading) => {
    route.type = type;
    render(<AutomationLibraryTypeRoute />);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each(['nope', 'toString'])('is not found for the type %s', (type) => {
    route.type = type;

    expect(() => render(<AutomationLibraryTypeRoute />)).toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
