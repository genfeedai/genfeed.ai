import type { BrandOverlayProps } from '@genfeedai/props/modals/modal.props';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import type { TextareaLabelActionsProps } from '@genfeedai/props/ui/forms/textarea-label-actions.props';
import type { TabsProps } from '@genfeedai/props/ui/navigation/tabs.props';
import type { AlertProps } from '@genfeedai/props/ui/ui.props';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalBrand from '@ui/modals/brands/brand/ModalBrand';
import type { ColorPickerProps } from '@ui/primitives/color-picker';
import type { FieldProps } from '@ui/primitives/field';
import type { PropsWithChildren, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('@ui/overlays/entity/EntityOverlayShell', () => ({
  __esModule: true,
  default: ({
    children,
    title,
    onOpenDetail,
  }: {
    children: ReactNode;
    title?: string;
    onOpenDetail?: () => void;
  }) => (
    <div data-testid="entity-overlay">
      <div>{title}</div>
      {onOpenDetail ? (
        <button type="button" onClick={onOpenDetail}>
          Open page
        </button>
      ) : null}
      {children}
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useParams: () => ({
    orgSlug: 'acme-org',
  }),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({
    label,
    children,
    onClick,
    isDisabled,
    isLoading,
    ariaLabel,
    ...props
  }: BaseButtonProps) => (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled || isLoading}
      aria-label={ariaLabel}
      {...props}
    >
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: FieldProps) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  __esModule: true,
  Input: () => <input data-testid="form-input" />,
  default: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/primitives/textarea', () => ({
  __esModule: true,
  Textarea: () => <textarea data-testid="form-textarea" />,
  default: () => <textarea data-testid="form-textarea" />,
}));

vi.mock('@ui/primitives/color-picker', () => ({
  __esModule: true,
  default: ({ label }: ColorPickerProps) => (
    <div data-testid="form-color-picker">{label}</div>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  __esModule: true,
  SelectField: ({ children }: PropsWithChildren) => (
    <select data-testid="form-select">{children}</select>
  ),
  default: ({ children }: PropsWithChildren) => (
    <select data-testid="form-select">{children}</select>
  ),
}));

vi.mock('@ui/content/textarea-label-actions/TextareaLabelActions', () => ({
  __esModule: true,
  default: ({ label }: TextareaLabelActionsProps) => (
    <div data-testid="textarea-label-actions">{label}</div>
  ),
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  __esModule: true,
  default: ({ children }: AlertProps) => (
    <div data-testid="alert">{children}</div>
  ),
}));

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  __esModule: true,
  default: ({ tabs, activeTab }: TabsProps) => (
    <div data-testid="tabs">
      <span>{activeTab}</span>
      <span>{Array.isArray(tabs) ? tabs.length : 0}</span>
    </div>
  ),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  default: () => () =>
    Promise.resolve({
      patch: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: 'prompt-1' }),
    }),
  useAuthedService: () => () =>
    Promise.resolve({
      patch: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: 'prompt-1' }),
    }),
}));

vi.mock('@genfeedai/hooks/data/elements/use-elements/use-elements', () => ({
  __esModule: true,
  useElements: () => ({
    fontFamilies: [],
    imageModels: [],
    videoModels: [],
  }),
}));

vi.mock('@genfeedai/hooks/data/resource/use-resource/use-resource', () => ({
  __esModule: true,
  useResource: () => ({
    data: null,
    isLoading: false,
    mutate: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  __esModule: true,
  useBrand: () => ({
    organizationId: 'org-1',
  }),
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  __esModule: true,
  LazyModalBrandGenerate: () => <div data-testid="brand-generate-modal" />,
  LazyModalBrandLink: () => <div data-testid="brand-link-modal" />,
}));

vi.mock('@pages/brands/components/detail-sidebar/BrandDetailSidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="brand-detail-sidebar" />,
}));

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

vi.mock('@genfeedai/hooks/utils/use-form-submit/use-form-submit', () => ({
  __esModule: true,
  useFormSubmitWithState: () => ({
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  __esModule: true,
  useSocketManager: () => ({
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    __esModule: true,
    useConfirmModal: () => ({
      openConfirm: vi.fn(),
    }),
    useUploadModal: () => ({
      openUpload: vi.fn(),
    }),
  }),
);

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    formState: { errors: {}, isValid: true },
    getValues: vi.fn((name?: string) => (name ? '' : {})),
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
  }),
}));

describe('ModalBrand', () => {
  const defaultProps: BrandOverlayProps = {
    brand: null,
    isOpen: true,
    onConfirm: vi.fn(),
  };

  it('renders brand form', () => {
    render(<ModalBrand {...defaultProps} />);
    expect(screen.getByTestId('entity-overlay')).toBeInTheDocument();
  });

  it('opens the canonical brand detail page from the overlay header', () => {
    render(
      <ModalBrand
        {...defaultProps}
        brand={{
          description: 'Brand description',
          id: 'brand-1',
          label: 'Brand One',
          scope: 'brand',
          slug: 'brand-one',
        }}
        initialView="overview"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open page' }));

    expect(pushMock).toHaveBeenCalledWith(
      '/acme-org/~/settings/brands/brand-one',
    );
  });
});
