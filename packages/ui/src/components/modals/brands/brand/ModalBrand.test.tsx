import type {
  FormColorPickerProps,
  FormControlProps,
} from '@props/forms/form.props';
import type { BrandOverlayProps } from '@props/modals/modal.props';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import type { TextareaLabelActionsProps } from '@props/ui/forms/textarea-label-actions.props';
import type { TabsProps } from '@props/ui/navigation/tabs.props';
import type { AlertProps } from '@props/ui/ui.props';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalBrand from '@ui/modals/brands/brand/ModalBrand';
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

vi.mock('@ui/forms/base/form-control/FormControl', () => ({
  __esModule: true,
  default: ({ children }: FormControlProps) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/forms/inputs/input/form-input/FormInput', () => ({
  __esModule: true,
  default: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/forms/inputs/textarea/form-textarea/FormTextarea', () => ({
  __esModule: true,
  default: () => <textarea data-testid="form-textarea" />,
}));

vi.mock(
  '@ui/forms/pickers/color-picker/form-color-picker/FormColorPicker',
  () => ({
    __esModule: true,
    default: ({ label }: FormColorPickerProps) => (
      <div data-testid="form-color-picker">{label}</div>
    ),
  }),
);

vi.mock('@ui/forms/selectors/select/form-select/FormSelect', () => ({
  __esModule: true,
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

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
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

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  __esModule: true,
  useElements: () => ({
    fontFamilies: [],
    imageModels: [],
    videoModels: [],
  }),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  __esModule: true,
  useResource: () => ({
    data: null,
    isLoading: false,
    mutate: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
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

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

vi.mock('@hooks/utils/use-form-submit/use-form-submit', () => ({
  __esModule: true,
  useFormSubmitWithState: () => ({
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  __esModule: true,
  useSocketManager: () => ({
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  __esModule: true,
  useConfirmModal: () => ({
    openConfirm: vi.fn(),
  }),
  useUploadModal: () => ({
    openUpload: vi.fn(),
  }),
}));

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
        }}
        initialView="overview"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open page' }));

    expect(pushMock).toHaveBeenCalledWith('/settings/brands/brand-1');
  });
});
