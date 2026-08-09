import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowRefApi } from '../nodes/composition/workflow-ref-node.helpers';
import {
  getExecutionApiBaseUrl,
  getExecutionHeaders,
  getExecutionHttpClient,
} from '../stores/execution/executionApi';
import { getWorkflowPersistence } from '../stores/workflow/workflowPersistence';
import type { WorkflowUIConfig } from './types';
import { useWorkflowUIConfig, WorkflowUIProvider } from './WorkflowUIProvider';

function ConfigProbe() {
  const config = useWorkflowUIConfig();
  return (
    <div data-testid="probe">{config.executionApiBaseUrl ?? 'no-base-url'}</div>
  );
}

afterEach(() => {
  // Re-render with an empty config to reset module-scope registries.
  render(
    <WorkflowUIProvider config={{}}>
      <span />
    </WorkflowUIProvider>,
  );
});

describe('WorkflowUIProvider', () => {
  it('exposes the config through useWorkflowUIConfig', () => {
    render(
      <WorkflowUIProvider
        config={{ executionApiBaseUrl: 'https://api.test/v1' }}
      >
        <ConfigProbe />
      </WorkflowUIProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent(
      'https://api.test/v1',
    );
  });

  it('returns an empty config outside the provider', () => {
    render(<ConfigProbe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('no-base-url');
  });

  it('registers injected services into the module-scope registries', () => {
    const httpClient = { post: vi.fn() };
    const persistence = {
      create: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
      getAll: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
    };
    const workflowReferences = {
      fetchReferencableWorkflows: vi.fn().mockResolvedValue([]),
      fetchWorkflowInterface: vi
        .fn()
        .mockResolvedValue({ inputs: [], outputs: [] }),
      validateReference: vi.fn(),
    };
    const config: WorkflowUIConfig = {
      executionApiBaseUrl: 'https://api.test/v1',
      executionHeaders: () => ({ 'X-Key': 'abc' }),
      executionHttpClient: httpClient,
      workflowPersistence: persistence,
      workflowReferences,
    };

    render(
      <WorkflowUIProvider config={config}>
        <span />
      </WorkflowUIProvider>,
    );

    expect(getExecutionApiBaseUrl()).toBe('https://api.test/v1');
    expect(getExecutionHeaders()).toEqual({ 'X-Key': 'abc' });
    expect(getExecutionHttpClient()).toBe(httpClient);
    expect(getWorkflowPersistence()).toBe(persistence);
    expect(workflowRefApi).toBe(workflowReferences);
  });

  it('resets registries when config values are removed', () => {
    const { rerender } = render(
      <WorkflowUIProvider
        config={{ executionApiBaseUrl: 'https://api.test/v1' }}
      >
        <span />
      </WorkflowUIProvider>,
    );
    expect(getExecutionApiBaseUrl()).toBe('https://api.test/v1');

    rerender(
      <WorkflowUIProvider config={{}}>
        <span />
      </WorkflowUIProvider>,
    );
    expect(getExecutionApiBaseUrl()).toBe('/v1');
    expect(getExecutionHeaders()).toEqual({});
  });
});
