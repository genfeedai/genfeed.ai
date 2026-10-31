import { selectFilterOption } from '@app-tests/filter-menu.helpers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ModelsLayoutContent from './models-layout-content';

const mockPush = vi.fn();
const mockPathname = vi.hoisted(() => ({ value: '/acme/~/settings/models' }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand', orgSlug: 'acme' }),
  usePathname: () => mockPathname.value,
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: mockPush,
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@contexts/models/models-context/models-context', () => ({
  useModelsContext: () => ({
    isRefreshing: false,
    refreshModels: vi.fn(),
  }),
}));

vi.mock('@contexts/models/trainings-context/trainings-context', () => ({
  useTrainingsContext: () => ({
    isRefreshing: false,
    refreshTrainings: vi.fn(),
  }),
}));

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) =>
      `/acme/~${path.startsWith('/') ? path : `/${path}`}`,
  }),
}));

describe('ModelsLayoutContent', () => {
  beforeEach(() => {
    mockPathname.value = '/acme/~/settings/models';
  });

  it('should render without crashing', () => {
    const { container } = render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('offers the model types as one facet of the Filters menu', async () => {
    const user = userEvent.setup();
    render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const type = await screen.findByRole('menuitem', { name: /^Model type/ });
    type.focus();
    await user.keyboard('{ArrowRight}');

    expect(
      await screen.findByRole('menuitemradio', { name: 'Catalog' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemradio', { name: 'Images' }),
    ).not.toBeInTheDocument();
  });

  it('renders a model type filter instead of type tabs or a dropdown', () => {
    render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Filters/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Images' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Images' }),
    ).not.toBeInTheDocument();
  });

  it('navigates when a model type is selected', async () => {
    const user = userEvent.setup();
    mockPush.mockClear();

    render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );

    await selectFilterOption(user, 'Model type', 'Trainings');

    expect(mockPush).toHaveBeenCalledWith('/acme/~/settings/models/trainings', {
      scroll: false,
    });
  });

  it('renders refresh from its slot ahead of the Filters menu', () => {
    render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );

    const filter = screen.getByRole('button', { name: /^Filters/ });
    const refresh = screen.getByRole('button', { name: 'Refresh' });

    expect(
      refresh.compareDocumentPosition(filter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hides refresh on the Custom Models tab', () => {
    mockPathname.value = '/acme/~/settings/models/custom-models';

    render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );

    expect(
      screen.getByRole('button', { name: /^Filters/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Refresh' }),
    ).not.toBeInTheDocument();
  });
});
