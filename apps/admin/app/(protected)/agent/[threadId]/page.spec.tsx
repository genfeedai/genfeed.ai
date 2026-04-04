import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockAgentPageContent = vi.fn(({ threadId }: { threadId?: string }) => (
  <div
    data-testid="agent-page-content"
    data-thread-id={threadId ?? 'undefined'}
  />
));

vi.mock('@pages/agent', () => ({
  AgentPageContent: (props: { threadId?: string }) =>
    mockAgentPageContent(props),
}));

import * as PageModule from '@protected/agent/[threadId]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests(
  'apps/admin/app/(protected)/agent/[threadId]/page',
  PageModule,
);

describe('AdminAgentThreadPage', () => {
  it('passes the resolved thread id through to the shared agent page content', async () => {
    const element = await PageModule.default({
      params: Promise.resolve({ threadId: 'thread-123' }),
    });

    render(element);

    expect(screen.getByTestId('agent-page-content')).toHaveAttribute(
      'data-thread-id',
      'thread-123',
    );
  });

  it('maps the new-thread sentinel to the default agent workspace', async () => {
    const element = await PageModule.default({
      params: Promise.resolve({ threadId: 'new' }),
    });

    render(element);

    expect(screen.getByTestId('agent-page-content')).toHaveAttribute(
      'data-thread-id',
      'undefined',
    );
  });
});
