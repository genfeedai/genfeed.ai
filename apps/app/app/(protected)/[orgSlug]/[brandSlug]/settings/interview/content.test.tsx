import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsInterviewPage from './content';

const mocks = vi.hoisted(() => ({
  brandDetail: {
    brand: { id: 'brand-1', label: 'Test Brand' },
    brandId: 'brand-1',
    handleRefreshBrand: vi.fn(),
    hasBrandId: true,
    isLoading: false,
  },
  getInterviewService: vi.fn(),
  loggerError: vi.fn(),
  useBrandInterview: {
    completenessScore: 0,
    currentQuestion: null as null | Record<string, unknown>,
    error: null as string | null,
    interviewId: null as string | null,
    isLoading: false,
    progress: null as null | Record<string, number>,
    skipQuestion: vi.fn(),
    startInterview: vi.fn(),
    status: 'idle' as 'idle' | 'in_progress' | 'complete',
    submitAnswer: vi.fn(),
  },
  draftGet: vi.fn(() => ''),
  draftSet: vi.fn(),
  draftClearAnswer: vi.fn(),
  draftClearBrand: vi.fn(),
}));

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => mocks.brandDetail,
}));

vi.mock('@hooks/utils/use-brand-interview/use-brand-interview', () => ({
  useBrandInterview: () => mocks.useBrandInterview,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getInterviewService,
}));

vi.mock('@services/social/brand-interview.service', () => ({
  BrandInterviewService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: vi.fn(),
  },
}));

vi.mock('@/store/brand-interview-draft.store', () => {
  const answers = new Map<string, string>();
  const keyOf = (brandId: string, fieldKey: string) => `${brandId}:${fieldKey}`;

  return {
    useBrandInterviewDraftStore: (
      selector: (state: {
        byBrandId: Record<string, { answerByFieldKey: Record<string, string> }>;
        clearAnswer: (brandId: string, fieldKey: string) => void;
        clearBrand: (brandId: string) => void;
        getAnswer: (brandId: string, fieldKey: string) => string;
        setAnswer: (brandId: string, fieldKey: string, value: string) => void;
      }) => unknown,
    ) =>
      selector({
        byBrandId: {},
        clearAnswer: (brandId, fieldKey) => {
          answers.delete(keyOf(brandId, fieldKey));
          mocks.draftClearAnswer(brandId, fieldKey);
        },
        clearBrand: (brandId) => {
          for (const key of answers.keys()) {
            if (key.startsWith(`${brandId}:`)) {
              answers.delete(key);
            }
          }
          mocks.draftClearBrand(brandId);
        },
        getAnswer: (brandId, fieldKey) =>
          answers.get(keyOf(brandId, fieldKey)) ?? mocks.draftGet(),
        setAnswer: (brandId, fieldKey, value) => {
          answers.set(keyOf(brandId, fieldKey), value);
          mocks.draftSet(brandId, fieldKey, value);
        },
      }),
  };
});

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    description,
    headerAction,
    label,
  }: {
    children?: ReactNode;
    description?: string;
    headerAction?: ReactNode;
    label?: string;
  }) => (
    <section>
      {label ? <h2>{label}</h2> : null}
      {description ? <p>{description}</p> : null}
      {headerAction}
      {children}
    </section>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading…</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
    type = 'button',
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button disabled={isDisabled} type={type} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

describe('BrandSettingsInterviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.draftGet.mockReturnValue('');

    mocks.brandDetail = {
      brand: { id: 'brand-1', label: 'Test Brand' },
      brandId: 'brand-1',
      handleRefreshBrand: vi.fn(),
      hasBrandId: true,
      isLoading: false,
    };

    mocks.useBrandInterview = {
      completenessScore: 0,
      currentQuestion: null,
      error: null,
      interviewId: null,
      isLoading: false,
      progress: null,
      skipQuestion: vi.fn(),
      startInterview: vi.fn(),
      status: 'idle',
      submitAnswer: vi.fn(),
    };

    mocks.getInterviewService.mockResolvedValue({
      getCompleteness: vi.fn().mockResolvedValue({
        incompleteFieldKeys: [],
        interviewableGapCount: 3,
        overallScore: 42,
      }),
    });
  });

  it('renders Start in idle state with credit note', () => {
    render(<BrandSettingsInterviewPage />);

    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible();
    expect(screen.getByText(/10 credits/i)).toBeVisible();
  });

  it('calls startInterview when Start is clicked', async () => {
    render(<BrandSettingsInterviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(mocks.useBrandInterview.startInterview).toHaveBeenCalled();
    });
  });

  it('shows the current question inline without a Manage modal', () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: {
        answerType: 'text',
        fieldKey: 'label',
        group: 'identity',
        hint: 'The name of your brand',
        isRequired: true,
        questionText: 'What is the name of your brand?',
        weight: 10,
      },
      interviewId: 'iv-123',
      progress: { answeredFields: 1, percentComplete: 10, totalFields: 10 },
      status: 'in_progress',
    };

    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('What is the name of your brand?')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Manage' }),
    ).not.toBeInTheDocument();
  });

  it('writes drafts to the zustand store and submits from persisted value', async () => {
    mocks.draftGet.mockReturnValue('Acme Corp');
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: {
        answerType: 'text',
        fieldKey: 'label',
        group: 'identity',
        isRequired: true,
        questionText: 'What is the name of your brand?',
        weight: 10,
      },
      interviewId: 'iv-123',
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 5 },
      status: 'in_progress',
    };

    render(<BrandSettingsInterviewPage />);

    fireEvent.change(screen.getByLabelText('Interview answer'), {
      target: { value: 'Acme Corp' },
    });
    expect(mocks.draftSet).toHaveBeenCalledWith(
      'brand-1',
      'label',
      'Acme Corp',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mocks.useBrandInterview.submitAnswer).toHaveBeenCalledWith(
        'Acme Corp',
      );
      expect(mocks.draftClearAnswer).toHaveBeenCalledWith('brand-1', 'label');
    });
  });

  it('renders list answers as chip entry instead of a huge textarea first', () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: {
        answerType: 'list',
        examples: ['We believe AI should be a co-creator'],
        fieldKey: 'messagingPillars',
        group: 'voice',
        isRequired: true,
        questionText: 'What are your key messaging pillars?',
        weight: 10,
      },
      interviewId: 'iv-123',
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 5 },
      status: 'in_progress',
    };

    render(<BrandSettingsInterviewPage />);

    expect(
      screen.getByPlaceholderText('Type a pillar, press Enter to add…'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'We believe AI should be a co-creator',
      }),
    ).toBeVisible();
    expect(
      screen.queryByPlaceholderText(
        'Enter values separated by commas or new lines…',
      ),
    ).not.toBeInTheDocument();
  });

  it('calls skipQuestion when Skip is clicked', async () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: {
        answerType: 'text',
        fieldKey: 'label',
        group: 'identity',
        isRequired: false,
        questionText: 'Optional question?',
        weight: 5,
      },
      interviewId: 'iv-123',
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 5 },
      status: 'in_progress',
    };

    render(<BrandSettingsInterviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    await waitFor(() => {
      expect(mocks.useBrandInterview.skipQuestion).toHaveBeenCalled();
    });
  });

  it('shows complete state when status is complete', () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      completenessScore: 85,
      status: 'complete',
    };

    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('Interview complete')).toBeVisible();
    expect(screen.getByText(/85%/)).toBeVisible();
  });

  it('clears drafts and refreshes brand when interview completes', async () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      completenessScore: 85,
      status: 'complete',
    };

    render(<BrandSettingsInterviewPage />);

    await waitFor(() => {
      expect(mocks.brandDetail.handleRefreshBrand).toHaveBeenCalledWith(true);
      expect(mocks.draftClearBrand).toHaveBeenCalledWith('brand-1');
    });
  });

  it('shows loading state', () => {
    mocks.brandDetail = {
      ...mocks.brandDetail,
      hasBrandId: false,
      isLoading: true,
    };

    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('Loading…')).toBeVisible();
  });

  it('shows not-found state', () => {
    mocks.brandDetail = {
      ...mocks.brandDetail,
      brand: null,
      hasBrandId: true,
      isLoading: false,
    };

    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('Brand not found.')).toBeVisible();
  });
});
