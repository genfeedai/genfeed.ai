import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { Newsletter } from '@models/content/newsletter.model';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewsletterEditor } from './useNewsletterEditor';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  getContext: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const getService = async () => ({
    findOne: mocks.findOne,
    getContext: mocks.getContext,
    patch: mocks.patch,
  });
  return { useAuthedService: () => getService };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {},
  captureAnalyticsEvent: vi.fn(),
}));

function issue(label: string): Newsletter {
  return { content: 'Body', id: 'issue-1', label } as Newsletter;
}

const OTHER_VIEWER_KEY = [
  'newsletter',
  'issue-1',
  { viewer: ['user-2', 'org-2'] },
];
const OWN_VIEWER_KEY = [
  'newsletter',
  'issue-1',
  { viewer: ['user-1', 'org-1'] },
];

describe('useNewsletterEditor viewer cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue(issue('Loaded'));
    mocks.getContext.mockResolvedValue({ selectedContextIds: [] });
  });

  it('writes a saved issue into the saving viewer cache only', async () => {
    const client = createTestQueryClient();
    client.setQueryData(OTHER_VIEWER_KEY, issue('Other viewer copy'));
    mocks.patch.mockResolvedValue(issue('Saved'));

    const { result } = renderHook(() => useNewsletterEditor('issue-1'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(result.current.newsletter?.label).toBe('Loaded'),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() =>
      expect(client.getQueryData<Newsletter>(OWN_VIEWER_KEY)?.label).toBe(
        'Saved',
      ),
    );
    expect(client.getQueryData<Newsletter>(OTHER_VIEWER_KEY)?.label).toBe(
      'Other viewer copy',
    );
  });
});
