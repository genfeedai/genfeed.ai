import { AgentDockProvider } from '@contexts/ui/agent-dock-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceSurfaceAdapter,
  WorkspaceSurfaceAdapterProvider,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { usePostAgent } from '@/features/posts/hooks/use-post-agent/use-post-agent';
import type { UsePostAgentOptions } from '@/features/posts/props/post-agent.props';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/publishing/posts/post-1',
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', organizationId: 'org-1' }),
}));

const POST = {
  id: 'post-1',
  label: 'Launch day',
  platform: CredentialPlatform.TIKTOK,
} as IPost;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AgentDockProvider>
      <WorkspaceSurfaceAdapterProvider>
        {children}
      </WorkspaceSurfaceAdapterProvider>
    </AgentDockProvider>
  );
}

function renderPostAgent(overrides: Partial<UsePostAgentOptions> = {}) {
  return renderHook(
    () => {
      const result = usePostAgent({
        descriptionDraft: '<p>Our new drop is live</p>',
        isEnabled: true,
        labelDraft: '',
        onApplyText: vi.fn(),
        post: POST,
        ...overrides,
      });
      return { adapter: useWorkspaceSurfaceAdapter(), result };
    },
    { wrapper },
  );
}

describe('usePostAgent', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it("pins the agent to the post's own conversation and carries the post", () => {
    const { result } = renderPostAgent();

    expect(result.current.adapter).toMatchObject({
      contextLabel: 'Post · Launch day',
      references: [
        {
          label: 'Launch day',
          reference: {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
            serializer: 'post',
          },
        },
      ],
      surfaceKey: 'publishing',
      threadKey: 'post:post-1',
    });
  });

  it('suggests things to do with this post in the agent', () => {
    renderPostAgent();

    const context = useAgentChatStore.getState().pageContext;
    expect(context?.placeholder).toBe('Ask about this post…');
    expect(context?.draftBody).toBe('Our new drop is live');
    expect(context?.suggestedActions?.map((action) => action.label)).toEqual([
      'Better hooks',
      'Review before posting',
      'Best time to post',
    ]);
    expect(context?.suggestedActions?.[0]?.prompt).toContain('TikTok post');
  });

  it('hands the agent nothing when the page is about something else', () => {
    const { result } = renderPostAgent({ isEnabled: false });

    expect(result.current.adapter).toBeNull();
    expect(useAgentChatStore.getState().pageContext).toBeNull();
    expect(result.current.result.onAskAgent).toBeUndefined();
  });
});
