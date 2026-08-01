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
    answeredFields: {} as Record<string, string | string[]>,
    completenessScore: 0,
    currentQuestion: null as null | Record<string, unknown>,
    error: null as string | null,
    interviewId: null as string | null,
    isLoading: false,
    progress: null as null | Record<string, number>,
    skipQuestion: vi.fn(),
    startInterview: vi.fn(),
    status: 'idle' as 'idle' | 'in_progress' | 'complete',
    steps: [] as Array<Record<string, unknown>>,
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
      answeredFields: {},
      completenessScore: 0,
      currentQuestion: null,
      error: null,
      interviewId: null,
      isLoading: false,
      progress: null,
      skipQuestion: vi.fn(),
      startInterview: vi.fn(),
      status: 'idle',
      steps: [],
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

    expect(
      screen.getByRole('button', { name: 'Start interview' }),
    ).toBeVisible();
    expect(screen.getByText(/10 credits/i)).toBeVisible();
  });

  it('calls startInterview when Start is clicked', async () => {
    render(<BrandSettingsInterviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => {
      expect(mocks.useBrandInterview.startInterview).toHaveBeenCalled();
    });
  });

  it('shows the current question inline without a Manage modal', () => {
    const question = {
      answerType: 'text',
      fieldKey: 'label',
      group: 'identity',
      hint: 'The name of your brand',
      isRequired: true,
      questionText: 'What is the name of your brand?',
      weight: 10,
    };

    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: question,
      interviewId: 'iv-123',
      progress: { answeredFields: 1, percentComplete: 10, totalFields: 10 },
      status: 'in_progress',
      steps: [
        {
          answerPreview: undefined,
          fieldKey: 'label',
          group: 'identity',
          isNavigable: true,
          label: question.questionText,
          question,
          status: 'current',
        },
        {
          fieldKey: 'tone',
          group: 'voice',
          isNavigable: false,
          label: 'What is your brand tone?',
          question: {
            answerType: 'text',
            fieldKey: 'tone',
            group: 'voice',
            isRequired: true,
            questionText: 'What is your brand tone?',
            weight: 8,
          },
          status: 'upcoming',
        },
      ],
    };

    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('What is the name of your brand?')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'Interview steps' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Manage' }),
    ).not.toBeInTheDocument();
  });

  it('writes drafts to the zustand store and submits from persisted value', async () => {
    const question = {
      answerType: 'text',
      fieldKey: 'label',
      group: 'identity',
      isRequired: true,
      questionText: 'What is the name of your brand?',
      weight: 10,
    };
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: question,
      interviewId: 'iv-123',
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 5 },
      status: 'in_progress',
      steps: [
        {
          fieldKey: 'label',
          group: 'identity',
          isNavigable: true,
          label: question.questionText,
          question,
          status: 'current',
        },
      ],
    };

    const { rerender } = render(<BrandSettingsInterviewPage />);

    const answerField = screen.getByLabelText('Interview answer');
    fireEvent.change(answerField, {
      target: { value: 'Acme Corp' },
    });
    expect(mocks.draftSet).toHaveBeenCalledWith(
      'brand-1',
      'label',
      'Acme Corp',
    );

    // Mock store does not notify React; re-render so getAnswer reads the Map.
    rerender(<BrandSettingsInterviewPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mocks.useBrandInterview.submitAnswer).toHaveBeenCalledWith(
        'Acme Corp',
      );
      expect(mocks.draftClearAnswer).toHaveBeenCalledWith('brand-1', 'label');
    });
  });

  it('renders list answers as a multi-line textarea with example chips', () => {
    const question = {
      answerType: 'list',
      examples: ['We believe AI should be a co-creator'],
      fieldKey: 'messagingPillars',
      group: 'voice',
      isRequired: true,
      questionText: 'What are your key messaging pillars?',
      weight: 10,
    };
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: question,
      interviewId: 'iv-123',
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 5 },
      status: 'in_progress',
      steps: [
        {
          fieldKey: 'messagingPillars',
          group: 'voice',
          isNavigable: true,
          label: question.questionText,
          question,
          status: 'current',
        },
      ],
    };

    render(<BrandSettingsInterviewPage />);

    expect(
      screen.getByPlaceholderText('One item per line (or comma-separated)…'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'We believe AI should be a co-creator',
      }),
    ).toBeVisible();
  });

  it('calls skipQuestion when Skip is clicked', async () => {
    const question = {
      answerType: 'text',
      fieldKey: 'label',
      group: 'identity',
      isRequired: false,
      questionText: 'Optional question?',
      weight: 5,
    };
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: question,
      interviewId: 'iv-123',
      progress: { answeredFields: 0, percentComplete: 0, totalFields: 5 },
      status: 'in_progress',
      steps: [
        {
          fieldKey: 'label',
          group: 'identity',
          isNavigable: true,
          label: question.questionText,
          question,
          status: 'current',
        },
      ],
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
      steps: [],
    };

    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('Interview complete')).toBeVisible();
    // Score appears in the description and the progress label.
    expect(screen.getAllByText(/85%/).length).toBeGreaterThan(0);
  });

  it('lets users reopen an answered step from the steps rail', async () => {
    const current = {
      answerType: 'text',
      fieldKey: 'style',
      group: 'voice',
      isRequired: false,
      questionText: 'How would you describe your writing style?',
      weight: 7,
    };
    const answered = {
      answerType: 'text',
      fieldKey: 'tone',
      group: 'voice',
      isRequired: true,
      questionText:
        "What is your brand's communication tone? Describe the overall feel of how your brand speaks.",
      weight: 8,
    };

    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      answeredFields: { tone: 'Professional yet warm' },
      currentQuestion: current,
      interviewId: 'iv-123',
      progress: { answeredFields: 1, percentComplete: 10, totalFields: 10 },
      status: 'in_progress',
      steps: [
        {
          answerPreview: 'Professional yet warm',
          fieldKey: 'tone',
          group: 'voice',
          isNavigable: true,
          label: answered.questionText,
          question: answered,
          status: 'answered',
        },
        {
          fieldKey: 'style',
          group: 'voice',
          isNavigable: true,
          label: current.questionText,
          question: current,
          status: 'current',
        },
      ],
    };

    render(<BrandSettingsInterviewPage />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /What is your brand's communication tone/i,
      }),
    );

    expect(
      screen.getByText(
        "What is your brand's communication tone? Describe the overall feel of how your brand speaks.",
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save answer' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Back to current' }),
    ).toBeVisible();
  });

  it('clears drafts and refreshes brand when interview completes', async () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      completenessScore: 85,
      status: 'complete',
      steps: [],
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
