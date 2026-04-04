import type { Caption } from '@models/content/caption.model';
import CaptionsList from '@pages/captions/list/captions-list';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const findAllMock = vi.fn<() => Promise<Caption[]>>();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({
      findAll: findAllMock,
    })),
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/library/captions'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => '1'),
    getAll: vi.fn(() => []),
    toString: vi.fn(() => ''),
  })),
}));

vi.mock('@services/content/captions.service', () => ({
  CaptionsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('CaptionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllMock.mockResolvedValue([]);
  });

  it('should render without crashing', () => {
    const { container } = render(<CaptionsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display empty state when no captions', async () => {
    render(<CaptionsList />);
    expect(await screen.findByText('No captions found')).toBeInTheDocument();
  });

  it('should render table with correct columns', async () => {
    findAllMock.mockResolvedValue([
      {
        createdAt: '2026-03-10T00:00:00.000Z',
        format: 'srt',
        id: 'caption-1',
        label: 'Caption 1',
      } as Caption,
    ]);

    render(<CaptionsList />);
    expect(await screen.findByText('Label')).toBeInTheDocument();
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });
});
