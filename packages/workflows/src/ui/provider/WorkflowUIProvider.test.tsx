import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowRefApi } from '../nodes/composition/workflow-ref-node.helpers';
import {
  getExecutionApiBaseUrl,
  getExecutionHeaders,
  getExecutionHttpClient,
} from '../stores/execution/executionApi';
import { getWorkflowPersistence } from '../stores/workflow/workflowPersistence';
import type { WorkflowUIConfig } from './types';
import { WorkflowUIProvider } from './WorkflowUIProvider';

afterEach(() => {
  // Re-render with an empty config to reset module-scope registries.
  render(
    <WorkflowUIProvider config={{}}>
      <span />
    </WorkflowUIProvider>,
  );
});

describe('WorkflowUIProvider', () => {
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
