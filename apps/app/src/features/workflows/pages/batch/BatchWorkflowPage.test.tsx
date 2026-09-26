import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchWorkflowPage from './BatchWorkflowPage';

const mocks = vi.hoisted(() => ({
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  pathname: '/demo/FUDNEWS/studio/batch/history',
  useBatchWorkflowPage: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('./useBatchWorkflowPage', () => ({
  useBatchWorkflowPage: mocks.useBatchWorkflowPage,
}));

vi.mock('./BatchDetail', () => ({
  default: ({ activeBatchStatus }: { activeBatchStatus: { id: string } }) => (
    <div data-testid="batch-detail">{activeBatchStatus.id}</div>
  ),
}));

vi.mock('./BatchHistoryList', () => ({
  default: () => <div data-testid="batch-history-list" />,
}));

vi.mock('./BatchComposer', () => ({
  default: () => <div data-testid="batch-composer" />,
}));

function baseHookState(overrides: Record<string, unknown> = {}) {
  return {
    activeBatchStatus: null,
    availableOutputs: [],
    canRunBatch: false,
    clearFiles: vi.fn(),
    error: null,
    files: [],
    getInputProps: () => ({}),
    getRootProps: () => ({}),
    handleBackToComposer: vi.fn(),
    handleDownload: vi.fn(),
    handleOpenInLibrary: vi.fn(),
    handleOpenRecentExecution: vi.fn(),
    handlePublish: vi.fn(),
    handleRunBatch: vi.fn(),
    hasPendingUploads: false,
    isDragActive: false,
    isBootstrapping: false,
    isLoadingExecution: false,
    isRunningBulkAction: false,
    isStartingBatch: false,
    openPostBatchModal: vi.fn(),
    push: vi.fn(),
    recentExecutions: [],
    requestedExecutionId: null,
    removeFile: vi.fn(),
    selectedOutputIds: new Set<string>(),
    selectedOutputs: [],
    selectedWorkflowId: '',
    setSelectedOutputIds: vi.fn(),
    setSelectedWorkflowId: vi.fn(),
    toggleOutputSelection: vi.fn(),
    workflowsById: new Map(),
    workflows: [],
    ...overrides,
  };
}

describe('BatchWorkflowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/demo/FUDNEWS/studio/batch/history';
  });

  it('shows the loading state for execution B instead of stale execution A results', () => {
    mocks.useBatchWorkflowPage.mockReturnValue(
      baseHookState({
        activeBatchStatus: { id: 'execution-a' },
        isLoadingExecution: true,
        requestedExecutionId: 'execution-b',
      }),
    );

    render(<BatchWorkflowPage />);

    expect(screen.queryByTestId('batch-detail')).not.toBeInTheDocument();
    expect(screen.getByText('Loading batch execution…')).toBeInTheDocument();
  });

  it('renders the detail once the active execution matches the requested one', () => {
    mocks.useBatchWorkflowPage.mockReturnValue(
      baseHookState({
        activeBatchStatus: { id: 'execution-b' },
        requestedExecutionId: 'execution-b',
      }),
    );

    render(<BatchWorkflowPage />);

    expect(screen.getByTestId('batch-detail')).toHaveTextContent('execution-b');
  });

  it('falls back to the history list while a requested execution has not loaded and none failed yet', () => {
    mocks.useBatchWorkflowPage.mockReturnValue(
      baseHookState({
        activeBatchStatus: null,
        isLoadingExecution: true,
        requestedExecutionId: 'execution-b',
      }),
    );

    render(<BatchWorkflowPage />);

    expect(screen.queryByTestId('batch-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('batch-history-list')).toBeInTheDocument();
  });
});
