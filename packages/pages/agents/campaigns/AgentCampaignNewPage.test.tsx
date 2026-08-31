import AgentCampaignNewPage from '@pages/agents/campaigns/AgentCampaignNewPage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const pushMock = vi.fn();
const createMock = vi.fn();
const createFromTemplateMock = vi.fn();
const errorMock = vi.fn();
const successMock = vi.fn();
const useAgentStrategiesMock = vi.fn();
const invalidateQueriesMock = vi.fn();
let brandContext = {
  brandId: 'brand-one',
  isReady: true,
  organizationId: 'org-one',
};
let searchParams = new URLSearchParams();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandContext,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    create: createMock,
    createFromTemplate: createFromTemplateMock,
  }),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: (options: unknown) => useAgentStrategiesMock(options),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/demo/automation/campaigns/new',
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: errorMock, success: successMock }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description?: string;
    label: string;
  }) => (
    <section>
      <h1>{label}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    'aria-pressed': ariaPressed,
    children,
    isDisabled,
    label,
    onClick,
    type = 'button',
  }: {
    'aria-pressed'?: boolean;
    children?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button
      aria-pressed={ariaPressed}
      disabled={isDisabled}
      onClick={onClick}
      type={type}
    >
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/label', () => ({
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    'aria-label': ariaLabel,
    checked,
    id,
    onCheckedChange,
  }: {
    'aria-label': string;
    checked?: boolean;
    id?: string;
    onCheckedChange?: () => void;
  }) => (
    <input
      aria-label={ariaLabel}
      checked={checked}
      id={id}
      onChange={() => onCheckedChange?.()}
      type="checkbox"
    />
  ),
}));

describe('AgentCampaignNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brandContext = {
      brandId: 'brand-one',
      isReady: true,
      organizationId: 'org-one',
    };
    searchParams = new URLSearchParams();
    useAgentStrategiesMock.mockReturnValue({
      strategies: [
        { agentType: 'general', id: 'agent-one', label: 'Existing Agent' },
      ],
    });
    createMock.mockResolvedValue({ id: 'program-one' });
    createFromTemplateMock.mockResolvedValue({ id: 'program-one' });
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it('opens the Creator Studio template from the legacy launch-team URL', () => {
    searchParams = new URLSearchParams('template=creator-studio');

    render(<AgentCampaignNewPage />);

    expect(
      screen.getByRole('button', { name: /Creator Studio team/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Program Label/)).toHaveValue(
      'Creator Studio team Program',
    );
    expect(screen.queryByText('Brand')).not.toBeInTheDocument();
  });

  it('does not load an organization-wide roster before brand resolution', () => {
    brandContext = { brandId: '', isReady: false, organizationId: '' };

    render(<AgentCampaignNewPage />);

    expect(screen.getByText('Loading the selected brand…')).toBeInTheDocument();
    expect(useAgentStrategiesMock).toHaveBeenCalledWith({
      enabled: false,
    });
  });

  it('atomically creates the selected team template and opens its Program', async () => {
    let resolveCampaignInvalidation: () => void = () => undefined;
    invalidateQueriesMock.mockImplementation(
      ({ queryKey }: { queryKey: string[] }) =>
        queryKey[0] === 'agent-campaigns'
          ? new Promise<void>((resolve) => {
              resolveCampaignInvalidation = resolve;
            })
          : Promise.resolve(),
    );
    searchParams = new URLSearchParams('template=creator-studio');
    render(<AgentCampaignNewPage />);

    fireEvent.click(screen.getByLabelText('Select Existing Agent'));
    fireEvent.change(screen.getByLabelText(/Start Date/), {
      target: { value: '2026-08-20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Program' }));

    await waitFor(() => {
      expect(createFromTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentStrategyIds: ['agent-one'],
          brandId: 'brand-one',
          templateId: 'creator-studio',
        }),
      );
    });
    expect(createFromTemplateMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'status',
    );
    expect(createMock).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['agent-campaigns', 'brand-one'],
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['agent-strategies', 'brand-one'],
    });
    expect(pushMock).not.toHaveBeenCalled();

    resolveCampaignInvalidation();
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/acme/demo/automation/campaigns/program-one',
      );
    });
  });

  it('creates a blank draft Program without the template command', async () => {
    render(<AgentCampaignNewPage />);

    fireEvent.change(screen.getByLabelText(/Program Label/), {
      target: { value: 'Launch Plan' },
    });
    fireEvent.change(screen.getByLabelText(/Start Date/), {
      target: { value: '2026-08-20' },
    });
    fireEvent.click(screen.getByLabelText('Select Existing Agent'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Program' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-one',
          label: 'Launch Plan',
          agentStrategyIds: ['agent-one'],
          status: 'draft',
        }),
      );
    });
    expect(createFromTemplateMock).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['agent-campaigns', 'brand-one'],
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['agent-strategies', 'brand-one'],
    });
  });
});
