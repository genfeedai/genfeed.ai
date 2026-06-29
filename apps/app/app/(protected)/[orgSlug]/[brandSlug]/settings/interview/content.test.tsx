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
  getCompletenessService: vi.fn(),
  getInterviewService: vi.fn(),
  loggerError: vi.fn(),
  useBrandInterview: {
    completenessScore: 0,
    currentQuestion: null,
    error: null,
    interviewId: null,
    isLoading: false,
    progress: null,
    skipQuestion: vi.fn(),
    startInterview: vi.fn(),
    status: 'idle' as 'idle' | 'in_progress' | 'complete',
    submitAnswer: vi.fn(),
  },
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

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading…</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
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

  it('renders "Start interview" button in idle state', () => {
    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText('Start interview')).toBeVisible();
  });

  it('shows credit disclosure in idle state', () => {
    render(<BrandSettingsInterviewPage />);

    expect(screen.getByText(/10 credits/)).toBeVisible();
  });

  it('calls startInterview when "Start interview" button is clicked', async () => {
    render(<BrandSettingsInterviewPage />);

    fireEvent.click(screen.getByText('Start interview'));

    await waitFor(() => {
      expect(mocks.useBrandInterview.startInterview).toHaveBeenCalled();
    });
  });

  it('shows question after start (in_progress state)', () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      currentQuestion: {
        answerType: 'text',
        enumOptions: undefined,
        examples: undefined,
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
    expect(screen.getByText('Submit')).toBeVisible();
    expect(screen.getByText('Skip')).toBeVisible();
  });

  it('calls submitAnswer with typed text when Submit is clicked', async () => {
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

    fireEvent.change(screen.getByPlaceholderText('Type your answer…'), {
      target: { value: 'Acme Corp' },
    });

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mocks.useBrandInterview.submitAnswer).toHaveBeenCalledWith(
        'Acme Corp',
      );
    });
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

    fireEvent.click(screen.getByText('Skip'));

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

  it('calls handleRefreshBrand when interview completes', async () => {
    mocks.useBrandInterview = {
      ...mocks.useBrandInterview,
      completenessScore: 85,
      status: 'complete',
    };

    render(<BrandSettingsInterviewPage />);

    await waitFor(() => {
      expect(mocks.brandDetail.handleRefreshBrand).toHaveBeenCalledWith(true);
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
