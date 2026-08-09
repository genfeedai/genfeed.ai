import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishLayoutContent from './publish-layout-content';

const usePathnameMock = vi.fn();
const useRouterMock = vi.fn();
const useSearchParamsMock = vi.fn();
const openAgentComposerMock = vi.fn();

const brandMock = vi.hoisted(() => ({ label: 'Acme Creator' }));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    selectedBrand: { id: 'brand-1', label: brandMock.label },
  })),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-creator', orgSlug: 'acme-org' }),
  usePathname: () => usePathnameMock(),
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/hooks/use-open-agent-composer', () => ({
  useOpenAgentComposer: () => openAgentComposerMock,
}));

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('PublishLayoutContent', () => {
  beforeEach(() => {
    brandMock.label = 'Acme Creator';
    openAgentComposerMock.mockReset();
    usePathnameMock.mockReturnValue('/publish/scheduled');
    useRouterMock.mockReturnValue({ refresh: vi.fn() });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('platform=youtube'),
    );
  });

  it('renders list actions without route-level status tabs', () => {
    render(
      <PublishLayoutContent>
        <div>child content</div>
      </PublishLayoutContent>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /new post/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new post/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /drafts/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /scheduled/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /published/i }),
    ).not.toBeInTheDocument();
  });

  it('seeds the agent composer without leaving Publish', () => {
    render(
      <PublishLayoutContent>
        <div>child content</div>
      </PublishLayoutContent>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new post/i }));

    expect(openAgentComposerMock).toHaveBeenCalledTimes(1);
    expect(openAgentComposerMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /generate a new post for my brand "Acme Creator".*do not ask which brand/i,
      ),
    );
  });

  it('keeps the prompt well-formed when the brand label contains a quote', () => {
    brandMock.label = 'The "Real" Deal';

    render(
      <PublishLayoutContent>
        <div>child content</div>
      </PublishLayoutContent>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new post/i }));

    const prompt = openAgentComposerMock.mock.calls[0][0] as string;
    expect(prompt).toContain(
      'my brand "The \\"Real\\" Deal" (already selected',
    );
    expect(prompt).toContain('do not ask which brand to use)');
  });

  it('skips the container chrome for organization-and-brand-scoped detail routes', () => {
    usePathnameMock.mockReturnValue(
      '/acme-org/acme-creator/publish/posts/post-123',
    );
    useSearchParamsMock.mockReturnValue(new URLSearchParams(''));

    render(
      <PublishLayoutContent>
        <div>detail content</div>
      </PublishLayoutContent>,
    );

    expect(screen.getByText('detail content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new post/i }),
    ).not.toBeInTheDocument();
  });
});
