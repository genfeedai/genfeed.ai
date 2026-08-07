import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ModelsLayoutContent from './models-layout-content';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand', orgSlug: 'acme' }),
  usePathname: () => '/acme/~/settings/models/all',
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

beforeAll(() => {
  // Radix Select drives its trigger through Pointer Events and scrolls the
  // highlighted option into view; jsdom implements neither, so opening the
  // listbox throws before any option renders.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ModelsLayoutContent', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders a model type filter instead of type tabs', () => {
    render(
      <ModelsLayoutContent>
        <div>children</div>
      </ModelsLayoutContent>,
    );

    expect(
      screen.getByRole('combobox', { name: 'Model type' }),
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

    await user.click(screen.getByRole('combobox', { name: 'Model type' }));
    await user.click(await screen.findByRole('option', { name: 'Images' }));

    expect(mockPush).toHaveBeenCalledWith('/acme/~/settings/models/images');
  });
});
