import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePanel } from '~components/create/CreatePanel';
import { useBrandStore } from '~store/use-brand-store';
import { usePlatformStore } from '~store/use-platform-store';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  draft: vi.fn(),
  aggregate: vi.fn(),
}));
vi.mock('~components/create/PublicationInsightsPanel', () => ({
  PublicationInsightsPanel: () => <section>Publication analytics</section>,
}));
vi.mock('~components/create/content-engine.utils', async (original) => ({
  ...(await original()),
  extractAnalyticsSnapshot: mocks.aggregate,
}));
vi.mock('~services/auth.service', () => ({
  authService: {
    getAuthContext: async () => ({ organization: { id: 'org-1' } }),
    getToken: async () => 'verified-token',
  },
}));
vi.mock('~services/agent-tools.service', () => ({
  AgentToolsService: class {
    execute = mocks.execute;
    saveDraft = mocks.draft;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({
    success: true,
    data: { content: 'Generated preview' },
  });
  mocks.draft.mockResolvedValue(undefined);
  useBrandStore.setState({ activeBrandId: 'brand-1', brands: [] });
  usePlatformStore.setState({
    currentPlatform: 'twitter',
    composeBoxAvailable: true,
    pageContext: { url: 'https://x.com/a/status/1' },
  });
});
afterEach(cleanup);
describe('Content Engine exact publication integration', () => {
  it('mounts publication analytics and removes brand aggregate controls/calls', () => {
    render(<CreatePanel onStartChat={() => undefined} />);
    expect(screen.getByText('Publication analytics')).toBeInTheDocument();
    expect(screen.queryByText('Analytics Snapshot')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run Analytics' })).toBeNull();
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('preserves generate, draft and explicit manual Insert with inert mocks', async () => {
    render(<CreatePanel onStartChat={() => undefined} />);
    fireEvent.change(
      screen.getByPlaceholderText('Write a prompt for generated content…'),
      {
        target: { value: 'Original topic' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run Generate' }));
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('Generated preview appears here…'),
      ).toHaveValue('Generated preview'),
    );
    expect(mocks.execute).toHaveBeenCalledWith('generate', {
      brandId: 'brand-1',
      platform: 'twitter',
      topic: 'Original topic',
      type: 'post',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Post Draft' }));
    await waitFor(() =>
      expect(mocks.draft).toHaveBeenCalledWith(
        'Generated preview',
        'twitter',
        'Generated preview',
        'brand-1',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Insert/ }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      {
        event: 'RELAY_TO_CONTENT',
        payload: {
          content: 'Generated preview',
          platform: 'twitter',
          type: 'INSERT_CONTENT',
        },
      },
      expect.any(Function),
    );
    expect(mocks.execute).not.toHaveBeenCalledWith(
      'analytics',
      expect.anything(),
    );
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });
});
