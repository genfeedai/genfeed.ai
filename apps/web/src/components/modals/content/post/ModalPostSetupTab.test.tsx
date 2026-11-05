import type { MultiPostSchema } from '@genfeedai/client/schemas';
import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import ModalPostSetupTab from '@/components/modals/content/post/ModalPostSetupTab';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  __esModule: true,
  useBrand: () => ({
    brandId: 'brand-1',
  }),
}));

vi.mock('@/hooks/utils/use-websocket-prompt/use-websocket-prompt', () => ({
  __esModule: true,
  useWebsocketPrompt: () => vi.fn(),
}));

vi.mock('@ui/primitives/button', () => ({
  __esModule: true,
  Button: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  __esModule: true,
  Input: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/primitives/textarea', () => ({
  __esModule: true,
  Textarea: () => <textarea data-testid="form-textarea" />,
}));

vi.mock('@ui/primitives/date-time-picker', () => ({
  __esModule: true,
  default: () => <div data-testid="form-date-time-picker" />,
}));

const xChannel: IPostPlatformConfig = {
  category: PostCategory.TEXT,
  credentialId: 'cred-x',
  customScheduledDate: '',
  description: '',
  enabled: true,
  handle: 'genfeed',
  isShareToFeedSelected: false,
  label: '',
  overrideSchedule: false,
  platform: CredentialPlatform.TWITTER,
  targetExecutionState: TargetExecutionState.SCHEDULED,
  visibility: PostVisibility.PUBLIC,
};

describe('ModalPostSetupTab', () => {
  const form = {
    control: {},
    setValue: () => undefined,
    watch: () => 'Hello',
  } as unknown as UseFormReturn<MultiPostSchema>;

  const baseProps = {
    form,
    getMinDateTime: () => new Date(),
    globalScheduledDate: null,
    ingredient: null,
    isLoading: false,
    platformConfigs: [xChannel],
    setGlobalScheduledDate: () => undefined,
  };

  it('holds the shared title, caption and time', () => {
    render(<ModalPostSetupTab {...baseProps} />);

    expect(screen.getByTestId('form-input')).toBeInTheDocument();
    expect(screen.getByTestId('form-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('form-date-time-picker')).toBeInTheDocument();
  });

  it('counts the shared caption against each channel that is on', () => {
    render(<ModalPostSetupTab {...baseProps} />);

    expect(screen.getByText('Characters per channel')).toBeVisible();
    expect(screen.getByText('5/280')).toBeVisible();
  });

  it('counts nothing while every channel is off', () => {
    render(
      <ModalPostSetupTab
        {...baseProps}
        platformConfigs={[{ ...xChannel, enabled: false }]}
      />,
    );

    expect(
      screen.queryByText('Characters per channel'),
    ).not.toBeInTheDocument();
  });
});
