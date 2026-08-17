import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatThreadPage, * as PageModule from './page';

const replaceMock = vi.fn();
const paramsState = { current: { id: 'thread-1', orgSlug: 'test-org' } };

vi.mock('@genfeedai/agent', () => ({
  isRenderableThreadId: (value: unknown) =>
    typeof value === 'string' &&
    value.length > 0 &&
    value !== 'undefined' &&
    value !== 'null',
}));

vi.mock('next/navigation', () => ({
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
});
