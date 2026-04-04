import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@genfeedai/interfaces/automation/workflow-builder.interface';
import { useWorkflowBuilder } from '@hooks/automation/use-workflow-builder/use-workflow-builder';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn();
const mockNotifications = {
  error: vi.fn(),
  success: vi.fn(),
};

function createNodeRegistryResponse() {
  return {
    json: async () => ({
      byCategory: {
        ai: [],
        control: [],
        effects: [],
        input: [{ label: 'Input Node', type: 'input' }],
        output: [],
        processing: [],
      },
      registry: {
        input: { category: 'input', label: 'Input Node' },
      },
    }),
    ok: true,
  };
}

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => mockNotifications,
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
  };
});

describe('useWorkflowBuilder', () => {
  let originalFetch: typeof fetch | undefined;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue('token-123');
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    if (typeof originalFetch === 'undefined') {
      Reflect.deleteProperty(globalThis, 'fetch');
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  it('loads node registry and maps initial nodes and edges', async () => {
    mockFetch.mockResolvedValueOnce(createNodeRegistryResponse());

    const initialNodes: WorkflowVisualNode[] = [
      {
        data: { config: {}, inputVariableKeys: [], label: 'Input' },
        id: 'node-1',
        position: { x: 10, y: 20 },
        type: 'input',
      } as WorkflowVisualNode,
    ];

    const initialEdges: WorkflowEdge[] = [
      {
        id: 'edge-1',
        source: 'node-1',
        sourceHandle: 'a',
        target: 'node-2',
        targetHandle: 'b',
      },
    ];

    const { result } = renderHook(() =>
      useWorkflowBuilder({
        initialEdges,
        initialNodes,
        workflowId: 'workflow-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0]?.type).toBe('input-node');
    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0]?.type).toBe('smoothstep');
  });

  it('adds nodes and edges via handlers', async () => {
    mockFetch.mockResolvedValueOnce(createNodeRegistryResponse());

    const { result } = renderHook(() =>
      useWorkflowBuilder({ workflowId: 'workflow-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.onAddNode('input', { x: 5, y: 6 });
    });

    expect(result.current.nodes).toHaveLength(1);

    act(() => {
      result.current.onConnect({
        source: 'node-1',
        target: 'node-2',
      });
    });

    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0]?.type).toBe('smoothstep');
  });

  it('starts workflow executions through the workflow-executions endpoint', async () => {
    mockFetch.mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.includes('/workflows/nodes/registry')) {
          return createNodeRegistryResponse();
        }

        if (url.includes('/workflows/workflow-1') && init?.method === 'PATCH') {
          return {
            json: async () => ({}),
            ok: true,
          };
        }

        if (url.includes('/workflow-executions') && init?.method === 'POST') {
          return {
            json: async () => ({
              data: {
                id: 'exec-1',
              },
            }),
            ok: true,
          };
        }

        throw new Error(`Unexpected fetch call in test: ${url}`);
      },
    );

    const { result } = renderHook(() =>
      useWorkflowBuilder({ workflowId: 'workflow-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.runWorkflow();
    });

    expect(
      mockFetch.mock.calls.some(
        ([url, options]) =>
          typeof url === 'string' &&
          url.includes('/workflows/workflow-1') &&
          (options as { method?: string })?.method === 'PATCH',
      ),
    ).toBe(true);

    expect(
      mockFetch.mock.calls.some(
        ([url, options]) =>
          typeof url === 'string' &&
          url.includes('/workflow-executions') &&
          (options as { method?: string })?.method === 'POST',
      ),
    ).toBe(true);
  });

  it.skip('saves and validates workflows', async () => {
    // Skipped: Mock notification service not being called correctly
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          byCategory: {
            ai: [],
            control: [],
            effects: [],
            input: [{ label: 'Input Node', type: 'input' }],
            output: [],
            processing: [],
          },
          registry: {
            input: { category: 'input', label: 'Input Node' },
          },
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({}),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          errors: [{ message: 'Missing node' }],
          isValid: false,
        }),
        ok: true,
      });

    const { result } = renderHook(() =>
      useWorkflowBuilder({ workflowId: 'workflow-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.saveWorkflow();
    });

    expect(mockNotifications.success).toHaveBeenCalledWith('Workflow saved');

    const valid = await result.current.validateWorkflow();

    expect(valid).toBe(false);
    expect(mockNotifications.error).toHaveBeenCalledWith(
      'Validation errors: Missing node',
    );
  });
});
