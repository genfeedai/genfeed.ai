import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sanitizeLayoutForPersistence = vi.fn();

vi.mock('@genfeedai/agent/dashboard', () => ({
  sanitizeLayoutForPersistence: (input: unknown) =>
    sanitizeLayoutForPersistence(input),
}));

const CTX = {
  brandId: 'brand-ctx',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

type ServiceMock = {
  findForPage: ReturnType<typeof vi.fn>;
  upsertForPage: ReturnType<typeof vi.fn>;
};

function createHandler(service?: Partial<ServiceMock>) {
  const serviceMock: ServiceMock = {
    findForPage: vi.fn(),
    upsertForPage: vi.fn(),
    ...service,
  };
  const handler = new AgentDashboardToolHandler(
    serviceMock as unknown as ConstructorParameters<
      typeof AgentDashboardToolHandler
    >[0],
  );
  return { handler, serviceMock };
}

describe('AgentDashboardToolHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sanitizeLayoutForPersistence.mockReturnValue({
      document: { blocks: [], version: 'genfeed.dashboard.openui.v1' },
      issues: [],
    });
  });

  describe('saveDashboardLayout', () => {
    it('rejects a layout whose blocks fail validation, without persisting', async () => {
      sanitizeLayoutForPersistence.mockReturnValueOnce({
        document: { blocks: [], version: 'genfeed.dashboard.openui.v1' },
        issues: [
          {
            code: 'invalid_props',
            message: 'needs sourceKey',
            path: 'blocks[0]',
          },
        ],
      });
      const { handler, serviceMock } = createHandler();

      const result = await handler.saveDashboardLayout(
        { blocks: [{ id: 'a', type: 'metric_card', value: 1 }] },
        CTX,
      );

      expect(result.success).toBe(false);
      expect(result.data?.issues).toHaveLength(1);
      expect(serviceMock.upsertForPage).not.toHaveBeenCalled();
    });

    it('persists a valid layout scoped to the caller organization', async () => {
      const { handler, serviceMock } = createHandler({
        upsertForPage: vi.fn().mockResolvedValue({ version: 2 }),
      });

      const result = await handler.saveDashboardLayout(
        { blocks: [{ id: 'a', sourceKey: 'totalPosts', type: 'metric_card' }] },
        CTX,
      );

      expect(result.success).toBe(true);
      expect(serviceMock.upsertForPage).toHaveBeenCalledWith('org-1', {
        brandId: 'brand-ctx',
        document: {
          blocks: [{ id: 'a', sourceKey: 'totalPosts', type: 'metric_card' }],
        },
        pageKey: 'workspace-overview',
      });
      expect(result.data).toMatchObject({ saved: true, version: 2 });
    });

    it('falls back to the brand in context and default page key', async () => {
      const { handler, serviceMock } = createHandler({
        upsertForPage: vi.fn().mockResolvedValue({ version: 1 }),
      });

      await handler.saveDashboardLayout({ document: { blocks: [] } }, CTX);

      expect(serviceMock.upsertForPage).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          brandId: 'brand-ctx',
          pageKey: 'workspace-overview',
        }),
      );
    });

    it('errors when no brand is available', async () => {
      const { handler, serviceMock } = createHandler();

      const result = await handler.saveDashboardLayout({ blocks: [] }, {
        organizationId: 'org-1',
        userId: 'u',
      } as ToolExecutionContext);

      expect(result.success).toBe(false);
      expect(serviceMock.upsertForPage).not.toHaveBeenCalled();
    });
  });

  describe('getDashboardLayout', () => {
    it('returns the persisted document for the scoped brand/page', async () => {
      const document = { blocks: [], version: 'genfeed.dashboard.openui.v1' };
      const { handler, serviceMock } = createHandler({
        findForPage: vi.fn().mockResolvedValue({ document, version: 3 }),
      });

      const result = await handler.getDashboardLayout({ pageKey: 'x' }, CTX);

      expect(serviceMock.findForPage).toHaveBeenCalledWith(
        'brand-ctx',
        'org-1',
        'x',
      );
      expect(result.data).toMatchObject({ document, version: 3 });
    });

    it('returns a null document when no layout exists', async () => {
      const { handler } = createHandler({
        findForPage: vi.fn().mockResolvedValue(null),
      });

      const result = await handler.getDashboardLayout({}, CTX);

      expect(result.success).toBe(true);
      expect(result.data?.document).toBeNull();
    });
  });
});
