import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatThreadPage, * as PageModule from './page';

const replaceMock = vi.fn();
const paramsState: { current: Record<string, string> } = {
  current: { id: 'thread-1', orgSlug: 'test-org' },
};

vi.mock('@genfeedai/agent', () => ({
  isRenderableThreadId: (value: unknown) =>
    typeof value === 'string' &&
    value.length > 0 &&
    value !== 'undefined' &&
    value !== 'null',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => paramsState.current,
  useRouter: () => ({ replace: replaceMock }),
}));

runPageModuleTests('app/(protected)/[orgSlug]/~/agent/[id]/page', PageModule);

describe('ChatThreadPage', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    paramsState.current = { id: 'thread-1', orgSlug: 'test-org' };
  });

  it('renders nothing for a valid thread — the agent layout hosts the conversation', () => {
    const { container } = render(<ChatThreadPage />);

    expect(container).toBeEmptyDOMElement();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('recovers malformed thread ids to the agent root', () => {
    paramsState.current = { id: 'undefined', orgSlug: 'test-org' };
    render(<ChatThreadPage />);

    expect(replaceMock).toHaveBeenCalledWith('/test-org/~/agent');
  });

  // A prerendered fallback shell carries opaque placeholders until Next
  // resolves the params; recovering then built /undefined/~/agent.
  it.each([
    ['both params are', { id: '%%drp:id:1%%', orgSlug: '%%drp:orgSlug:1%%' }],
    ['the organization is', { id: 'undefined', orgSlug: '%%drp:orgSlug:1%%' }],
    ['the thread id is', { id: '%%drp:id:1%%', orgSlug: 'test-org' }],
  ])('waits while %s unresolved', (_label, params) => {
    paramsState.current = params;
    render(<ChatThreadPage />);

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
