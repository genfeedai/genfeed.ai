import {
  AgentApiServiceProvider,
  useAgentApiService,
} from '@genfeedai/agent/components/AgentApiServiceContext';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';

describe('AgentApiServiceContext', () => {
  it('shares the workspace service with non-Agent surfaces', () => {
    const service = { baseUrl: '/v1' } as AgentApiService;
    const wrapper = ({ children }: PropsWithChildren) => (
      <AgentApiServiceProvider service={service}>
        {children}
      </AgentApiServiceProvider>
    );

    const { result } = renderHook(() => useAgentApiService(), { wrapper });

    expect(result.current).toBe(service);
  });

  it('is optional outside the universal workspace shell', () => {
    const { result } = renderHook(() => useAgentApiService());

    expect(result.current).toBeNull();
  });
});
