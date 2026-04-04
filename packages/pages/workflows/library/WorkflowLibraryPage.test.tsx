import WorkflowLibraryPage from '@pages/workflows/library/WorkflowLibraryPage';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const getServiceMock = vi.fn(async () => ({
  list: listMock,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getServiceMock,
}));

describe('WorkflowLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the default workflow card image when a workflow has no thumbnail', async () => {
    listMock.mockResolvedValue([
      {
        _id: 'workflow-1',
        createdAt: '2026-03-16T10:00:00.000Z',
        lifecycle: 'draft',
        name: 'No Thumb Workflow',
        nodeCount: 4,
        updatedAt: '2026-03-16T12:00:00.000Z',
      },
    ]);

    render(<WorkflowLibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('No Thumb Workflow')).toBeInTheDocument();
    });

    expect(screen.getByAltText('Default workflow card')).toHaveAttribute(
      'src',
      'https://cdn.genfeed.ai/assets/cards/default.jpg',
    );
  });

  it('renders the persisted workflow thumbnail when present', async () => {
    listMock.mockResolvedValue([
      {
        _id: 'workflow-2',
        createdAt: '2026-03-16T10:00:00.000Z',
        lifecycle: 'published',
        name: 'Thumb Workflow',
        nodeCount: 7,
        thumbnail: 'https://cdn.example.com/workflow-thumb.jpg',
        updatedAt: '2026-03-16T12:00:00.000Z',
      },
    ]);

    render(<WorkflowLibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Thumb Workflow')).toBeInTheDocument();
    });

    expect(screen.getByAltText('Thumb Workflow thumbnail')).toHaveAttribute(
      'src',
      'https://cdn.example.com/workflow-thumb.jpg',
    );
  });
});
