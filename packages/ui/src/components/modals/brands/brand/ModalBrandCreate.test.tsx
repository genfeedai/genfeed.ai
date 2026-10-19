import { LinkCategory } from '@genfeedai/contracts';
import type { ModalBrandCreateProps } from '@genfeedai/props/modals/modal.props';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import type { AlertProps } from '@genfeedai/props/ui/ui.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModalBrandCreate from '@ui/modals/brands/brand/ModalBrandCreate';
import type { FieldProps } from '@ui/primitives/field';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const postBrandMock = vi.fn().mockResolvedValue({
  id: 'brand-created',
});
const findBrandMock = vi.fn().mockResolvedValue({
  id: 'brand-created',
  label: 'Acme',
  slug: 'acme',
});
const crawlBrandKitMock = vi.fn().mockResolvedValue({
  assetCandidates: [
    {
      candidateId: 'banner-1',
      label: 'Website banner',
      role: 'banner',
      sourceUrl: 'https://acme.test/og.jpg',
    },
    {
      candidateId: 'logo-1',
      label: 'Website logo',
      role: 'logo',
      sourceUrl: 'https://acme.test/logo.png',
    },
  ],
});
const importBrandKitAssetsMock = vi.fn().mockResolvedValue({
  importedAssetIds: ['asset-1'],
  status: 'accepted',
});
const formValues = vi.hoisted(() => ({
  current: {} as Record<string, string>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
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

vi.mock('@ui/feedback/alert/Alert', () => ({
  __esModule: true,
  default: ({ children }: AlertProps) => (
    <div data-testid="alert">{children}</div>
  ),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  useAuthedService: () => () =>
    Promise.resolve({
      crawlBrandKitWebsite: crawlBrandKitMock,
      findOne: findBrandMock,
      importBrandKitAssets: importBrandKitAssetsMock,
      post: postBrandMock,
      previewWebsite: vi.fn(),
    }),
}));

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  __esModule: true,
  useOrgUrl: () => ({ orgSlug: 'acme-org' }),
}));

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

vi.mock('@genfeedai/hooks/utils/use-form-submit/use-form-submit', () => ({
  __esModule: true,
  useFormSubmitWithState: (handler: () => Promise<void>) => ({
    isSubmitting: false,
    onSubmit: vi.fn(async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      await handler();
    }),
  }),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    formState: { errors: {}, isValid: true },
    getValues: vi.fn((name?: string) =>
      name ? (formValues.current[name] ?? '') : formValues.current,
    ),
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn((name?: string) =>
      name ? (formValues.current[name] ?? '') : formValues.current,
    ),
  }),
}));

describe('ModalBrandCreate', () => {
  const onConfirm = vi.fn();
  const defaultProps: ModalBrandCreateProps = {
    isOpen: true,
    onConfirm,
  };

  beforeEach(() => {
    pushMock.mockReset();
    onConfirm.mockReset();
    postBrandMock.mockClear();
    findBrandMock.mockClear();
    crawlBrandKitMock.mockClear();
    importBrandKitAssetsMock.mockClear();
    formValues.current = {};
  });

  it('renders the create brand form in a dialog', () => {
    render(<ModalBrandCreate {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'New brand' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create brand' }),
    ).toBeInTheDocument();
  });

  it('disables Create brand until label and slug are filled', () => {
    render(<ModalBrandCreate {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Create brand' })).toBeDisabled();
  });

  it('confirms with the new brand id and routes to its settings page', async () => {
    formValues.current = {
      label: 'Acme',
      slug: 'acme',
    };
    render(<ModalBrandCreate {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create brand' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/acme-org/acme/settings');
    });
    expect(onConfirm).toHaveBeenCalledWith('brand-created');
  });

  it('stores and imports website banner + logo when creating a brand', async () => {
    formValues.current = {
      label: 'Acme',
      slug: 'acme',
      websiteUrl: 'https://acme.test',
    };
    render(<ModalBrandCreate {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create brand' }));

    await waitFor(() => {
      expect(postBrandMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          brandId: 'brand-created',
          category: LinkCategory.WEBSITE,
          url: 'https://acme.test',
        }),
      );
      expect(crawlBrandKitMock).toHaveBeenCalledWith('brand-created', {
        url: 'https://acme.test',
      });
      expect(importBrandKitAssetsMock).toHaveBeenCalledWith('brand-created', {
        assets: [
          expect.objectContaining({
            candidateId: 'banner-1',
            replaceExisting: false,
            role: 'banner',
            sourceUrl: 'https://acme.test/og.jpg',
          }),
          expect.objectContaining({
            candidateId: 'logo-1',
            replaceExisting: false,
            role: 'logo',
            sourceUrl: 'https://acme.test/logo.png',
          }),
        ],
      });
    });
  });
});
