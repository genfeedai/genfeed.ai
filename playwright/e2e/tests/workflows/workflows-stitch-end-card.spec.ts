import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockBrandsData,
  mockNodeTypes,
  mockWorkflowCrud,
  mockWorkflowExecutions,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  testNodeTypes,
  testWorkflowExecutions,
} from '../../fixtures/test-data.fixture';
import { brandPath } from '../../utils/app-chrome';

const stitchWorkflow = {
  createdAt: '2025-03-01T09:00:00Z',
  description: 'Two chained stitches',
  edges: [{ id: 'edge-1', source: 'stitch-1', target: 'stitch-2' }],
  id: 'workflow-stitch',
  name: 'Chained stitch',
  nodes: [
    {
      data: {
        config: { actionId: 'videoStitch', parameters: {} },
        label: 'First Stitch',
      },
      id: 'stitch-1',
      label: 'First Stitch',
      position: { x: 100, y: 100 },
      type: 'genfeedAction',
    },
    {
      data: {
        config: { actionId: 'videoStitch', parameters: {} },
        label: 'Final Stitch',
      },
      id: 'stitch-2',
      label: 'Final Stitch',
      position: { x: 500, y: 100 },
      type: 'genfeedAction',
    },
  ],
  status: 'draft',
  updatedAt: '2025-03-01T09:00:00Z',
};

/**
 * A stitch another node joins later must not carry the brand end card, so the
 * `videoStitch` inspector offers a per-node switch that defaults to on.
 */
test.describe('Workflow stitch end card', () => {
  test.setTimeout(120_000);

  test('turns the brand end card off for one stitch node only', async ({
    authenticatedPage,
  }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, [stitchWorkflow]);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockNodeTypes(authenticatedPage, testNodeTypes);
    await mockBrandsData(authenticatedPage, 3);
    await authenticatedPage.goto(
      brandPath(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${stitchWorkflow.id}`),
      { waitUntil: 'domcontentloaded' },
    );

    const endCardSwitch = (nodeIndex: number) =>
      authenticatedPage
        .getByRole('checkbox', { name: 'Brand end card' })
        .nth(nodeIndex);

    await expect(endCardSwitch(0)).toBeChecked();
    await expect(endCardSwitch(1)).toBeChecked();

    await endCardSwitch(0).click();

    await expect(endCardSwitch(0)).not.toBeChecked();
    await expect(endCardSwitch(1)).toBeChecked();
  });
});
