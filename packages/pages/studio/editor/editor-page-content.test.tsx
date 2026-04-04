import EditorPageContent from '@pages/studio/editor/editor-page-content';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    id: 'editor-123',
  })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: vi.fn(() => ({
    data: null,
    isLoading: false,
    refresh: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({
    openConfirm: vi.fn(),
  })),
  useGalleryModal: vi.fn(() => ({
    openGallery: vi.fn(),
  })),
}));

describe('EditorPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<EditorPageContent projectId="editor-123" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
