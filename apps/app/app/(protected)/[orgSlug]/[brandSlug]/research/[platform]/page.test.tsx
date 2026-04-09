/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import ResearchPlatformPage from './page';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('./trends-platform-detail', () => ({
  default: ({ platform }: { platform: string }) => (
    <div>Mocked platform detail: {platform}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

describe('ResearchPlatformPage', () => {
  it('renders a valid platform route', async () => {
    const element = await ResearchPlatformPage({
      params: Promise.resolve({ platform: 'twitter' }),
    });

    render(element);

    expect(
      screen.getByText('Mocked platform detail: twitter'),
    ).toBeInTheDocument();
  });

  it('renders another valid platform route', async () => {
    const element = await ResearchPlatformPage({
      params: Promise.resolve({ platform: 'linkedin' }),
    });

    render(element);

    expect(
      screen.getByText('Mocked platform detail: linkedin'),
    ).toBeInTheDocument();
  });

  it('calls notFound for invalid platforms', async () => {
    await expect(
      ResearchPlatformPage({
        params: Promise.resolve({ platform: 'mastodon' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });
});
