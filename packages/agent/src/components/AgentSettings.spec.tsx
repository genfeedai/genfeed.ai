import { AgentSettings } from '@genfeedai/agent/components/AgentSettings';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentSettings', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/brands/')) {
        return Promise.resolve({
          json: async () => ({
            data: { attributes: { agentConfig: {} } },
          }),
          ok: true,
        });
      }

      return Promise.resolve({
        json: async () => ({
          data: { attributes: { generationPriority: 'balanced' } },
        }),
        ok: true,
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('describes Auto as the default routing path', async () => {
    render(
      <AgentSettings
        apiConfig={{
          baseUrl: 'https://example.com',
          getToken: vi.fn().mockResolvedValue('token'),
        }}
        brandId="brand-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Default Model Override')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Leave this on Auto to use brand defaults and OpenRouter auto-routing for new threads.',
      ),
    ).toBeInTheDocument();
  });
});
