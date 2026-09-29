import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { getSystemWorkflowCatalogEntry } from '@api/collections/workflows/system-workflow-catalog';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { MediaType } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/templates/workflow-template-example-outputs',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@api/collections/workflows/templates/workflow-template-example-outputs')
      >();
    const { MediaType: MockMediaType } = await import('@genfeedai/contracts');
    const outputs: typeof actual.WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS = {
      'daily-trends-digest': {
        mediaType: MockMediaType.IMAGE,
        url: 'https://cdn.example.com/examples/digest.png',
      },
      'founder-x-thread': {
        mediaType: MockMediaType.VIDEO,
        posterUrl: 'https://cdn.example.com/examples/thread.jpg',
        url: 'https://cdn.example.com/examples/thread.mp4',
      },
    };

    return {
      ...actual,
      getWorkflowTemplateExampleOutput: (templateId: string) =>
        actual.getWorkflowTemplateExampleOutput(templateId, outputs),
      WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS: outputs,
      withExampleOutputs: <T extends { id: string }>(
        templates: Record<string, T>,
      ) => actual.withExampleOutputs(templates, outputs),
    };
  },
);

describe('workflow template example output wiring', () => {
  it('serves the example output with the starter template catalog', () => {
    expect(WORKFLOW_TEMPLATES['founder-x-thread']?.exampleOutput).toEqual({
      mediaType: MediaType.VIDEO,
      posterUrl: 'https://cdn.example.com/examples/thread.jpg',
      url: 'https://cdn.example.com/examples/thread.mp4',
    });
  });

  it('serves the example output with system catalog entries', () => {
    expect(
      getSystemWorkflowCatalogEntry('daily-trends-digest')?.exampleOutput,
    ).toEqual({
      mediaType: MediaType.IMAGE,
      url: 'https://cdn.example.com/examples/digest.png',
    });
  });

  it('keeps the example output on installed catalog entries', async () => {
    const prisma = {
      workflow: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'wf-1',
            metadata: { sourceTemplateId: 'daily-trends-digest' },
          },
        ]),
      },
    };
    const service = new SystemWorkflowCatalogService(
      prisma as never,
      { debug: vi.fn(), error: vi.fn() } as unknown as LoggerService,
      {} as never,
    );

    const items = await service.listCatalogForOrganization('org-1');

    expect(
      items.find((item) => item.canonicalId === 'daily-trends-digest'),
    ).toMatchObject({
      exampleOutput: {
        mediaType: MediaType.IMAGE,
        url: 'https://cdn.example.com/examples/digest.png',
      },
      installed: true,
      installedWorkflowId: 'wf-1',
    });
  });
});
