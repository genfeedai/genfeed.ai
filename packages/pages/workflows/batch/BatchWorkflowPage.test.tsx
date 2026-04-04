import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  ingredientsService,
  mockDownloadIngredient,
  mockOpenPostBatchModal,
  mockRouterPush,
  mockRouterReplace,
  mockSearchParams,
  mockUseAuthedService,
  workflowApiService,
} = vi.hoisted(() => ({
  ingredientsService: {
    postUpload: vi.fn(),
  },
  mockDownloadIngredient: vi.fn(),
  mockOpenPostBatchModal: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockSearchParams: {
    current: new URLSearchParams(),
  },
  mockUseAuthedService: vi.fn(),
  workflowApiService: {
    getBatchStatus: vi.fn(),
    list: vi.fn(),
    listBatchJobs: vi.fn(),
    runBatch: vi.fn(),
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: mockUseAuthedService,
}));

vi.mock('@genfeedai/workflow', () => ({
  createWorkflowApiService: function createWorkflowApiService() {
    return workflowApiService;
  },
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  usePostModal: () => ({
    openPostBatchModal: mockOpenPostBatchModal,
    publishIngredient: null,
  }),
}));

vi.mock('@helpers/media/download/download.helper', () => ({
  downloadIngredient: mockDownloadIngredient,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/studio/batch',
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getInputProps: () => ({}),
    getRootProps: () => ({}),
    isDragActive: false,
  }),
}));

import BatchWorkflowPage from './BatchWorkflowPage';

const workflow = {
  _id: 'workflow-1',
  createdAt: '2026-03-15T12:00:00.000Z',
  lifecycle: 'published' as const,
  name: 'Video Workflow',
  nodeCount: 4,
  updatedAt: '2026-03-15T12:00:00.000Z',
};

const recentJob = {
  _id: 'job-1',
  completedCount: 0,
  createdAt: '2026-03-15T12:01:00.000Z',
  failedCount: 0,
  status: 'processing',
  totalCount: 2,
  workflowId: workflow._id,
};

const processingBatchJob = {
  _id: 'job-1',
  completedCount: 0,
  createdAt: '2026-03-15T12:01:00.000Z',
  failedCount: 0,
  items: [
    {
      _id: 'item-1',
      ingredientId: 'input-1',
      status: 'processing',
    },
    {
      _id: 'item-2',
      ingredientId: 'input-2',
      status: 'pending',
    },
  ],
  status: 'processing',
  totalCount: 2,
  updatedAt: '2026-03-15T12:01:30.000Z',
  workflowId: workflow._id,
};

const completedBatchJob = {
  _id: 'job-1',
  completedCount: 2,
  createdAt: '2026-03-15T12:01:00.000Z',
  failedCount: 0,
  items: [
    {
      _id: 'item-1',
      completedAt: '2026-03-15T12:02:00.000Z',
      executionId: 'exec-1',
      ingredientId: 'input-1',
      outputCategory: 'video',
      outputIngredientId: 'video-output-1',
      outputSummary: {
        category: 'video',
        id: 'video-output-1',
        ingredientUrl:
          'https://cdn.example.com/ingredients/videos/video-output-1',
        status: 'generated',
        thumbnailUrl:
          'https://cdn.example.com/ingredients/thumbnails/video-output-1',
      },
      status: 'completed',
    },
    {
      _id: 'item-2',
      completedAt: '2026-03-15T12:02:10.000Z',
      executionId: 'exec-2',
      ingredientId: 'input-2',
      outputCategory: 'video',
      outputIngredientId: 'video-output-2',
      outputSummary: {
        category: 'video',
        id: 'video-output-2',
        ingredientUrl:
          'https://cdn.example.com/ingredients/videos/video-output-2',
        status: 'generated',
        thumbnailUrl:
          'https://cdn.example.com/ingredients/thumbnails/video-output-2',
      },
      status: 'completed',
    },
  ],
  status: 'completed',
  totalCount: 2,
  updatedAt: '2026-03-15T12:02:10.000Z',
  workflowId: workflow._id,
};

function renderPage() {
  mockUseAuthedService.mockImplementation((factory: { name?: string }) => {
    if (factory?.name === 'createWorkflowApiService') {
      return vi.fn().mockResolvedValue(workflowApiService);
    }

    return vi.fn().mockResolvedValue(ingredientsService);
  });

  return render(<BatchWorkflowPage />);
}

describe('BatchWorkflowPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockSearchParams.current = new URLSearchParams();

    workflowApiService.list.mockResolvedValue([workflow]);
    workflowApiService.listBatchJobs.mockResolvedValue([recentJob]);
    workflowApiService.runBatch.mockResolvedValue({
      batchJobId: 'job-1',
      totalCount: 2,
    });
  });

  it('renders the composer, recent jobs, and a disabled run button by default', async () => {
    renderPage();

    expect(screen.getByText('Batch Workflow Runner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Run Batch \(0\)/i }),
    ).toBeDisabled();

    expect(await screen.findByText('Recent jobs')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Video Workflow/i }),
    ).toBeVisible();
  });

  it('reopens a recent batch job from the jobs list', async () => {
    const user = userEvent.setup();
    workflowApiService.getBatchStatus.mockResolvedValue(processingBatchJob);

    renderPage();

    await user.click(
      await screen.findByRole('button', { name: /Video Workflow/i }),
    );

    expect(workflowApiService.getBatchStatus).toHaveBeenCalledWith('job-1');
    expect(await screen.findByText('Batch Results')).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith('/studio/batch?job=job-1');
  });

  it('opens the requested batch job from the job query parameter', async () => {
    mockSearchParams.current = new URLSearchParams('job=job-1');
    workflowApiService.getBatchStatus.mockResolvedValue(processingBatchJob);

    renderPage();

    expect(await screen.findByText('Batch Results')).toBeInTheDocument();
    expect(workflowApiService.getBatchStatus).toHaveBeenCalledWith('job-1');
  });

  it('resumes polling for a non-terminal batch and updates when it completes', async () => {
    mockSearchParams.current = new URLSearchParams('job=job-1');
    workflowApiService.getBatchStatus
      .mockResolvedValueOnce(processingBatchJob)
      .mockResolvedValueOnce(completedBatchJob);
    const setIntervalSpy = vi
      .spyOn(window, 'setInterval')
      .mockImplementation((callback: TimerHandler) => {
        void (callback as () => Promise<void> | void)();
        return 1 as unknown as number;
      });

    renderPage();

    expect(
      await screen.findByText(/2 \/ 2 items processed/i),
    ).toBeInTheDocument();
    expect(setIntervalSpy).toHaveBeenCalled();
    expect(workflowApiService.getBatchStatus).toHaveBeenCalledTimes(2);

    setIntervalSpy.mockRestore();
  });

  it('enables bulk selected actions only after selection and passes selected outputs through', async () => {
    const user = userEvent.setup();
    mockSearchParams.current = new URLSearchParams('job=job-1');
    workflowApiService.getBatchStatus.mockResolvedValue(completedBatchJob);

    renderPage();

    const publishSelectedButton = await screen.findByRole('button', {
      name: 'Publish selected',
    });
    const downloadSelectedButton = screen.getByRole('button', {
      name: 'Download selected',
    });

    expect(publishSelectedButton).toBeDisabled();
    expect(downloadSelectedButton).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select output item-1' }),
    );

    expect(publishSelectedButton).toBeEnabled();
    expect(downloadSelectedButton).toBeEnabled();

    await user.click(publishSelectedButton);

    expect(mockOpenPostBatchModal).toHaveBeenCalledWith([
      expect.objectContaining({
        category: 'video',
        id: 'video-output-1',
        ingredientUrl:
          'https://cdn.example.com/ingredients/videos/video-output-1',
      }),
    ]);

    await user.click(downloadSelectedButton);

    await waitFor(() => {
      expect(mockDownloadIngredient).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'video',
          id: 'video-output-1',
        }),
      );
    });
  });
});
