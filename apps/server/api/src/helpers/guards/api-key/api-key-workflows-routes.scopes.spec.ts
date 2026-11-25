import { WorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/workflow-executions.controller';
import { WorkflowBatchController } from '@api/collections/workflows/controllers/workflow-batch.controller';
import { WorkflowBuilderController } from '@api/collections/workflows/controllers/workflow-builder.controller';
import { WorkflowCrudController } from '@api/collections/workflows/controllers/workflow-crud.controller';
import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';
import { WorkflowWebhookManagementController } from '@api/collections/workflows/controllers/workflow-webhook-management.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /workflow-executions',
    WorkflowExecutionsController,
    WorkflowExecutionsController.prototype.create,
  ],
  [
    'PATCH /workflow-executions/:id',
    WorkflowExecutionsController,
    WorkflowExecutionsController.prototype.update,
  ],
  [
    'POST /workflows/:workflowId/executions/batch',
    WorkflowBatchController,
    WorkflowBatchController.prototype.startBatchExecution,
  ],
  [
    'POST /workflows/generate',
    WorkflowBuilderController,
    WorkflowBuilderController.prototype.generateWorkflow,
  ],
  [
    'POST /workflows/import',
    WorkflowBuilderController,
    WorkflowBuilderController.prototype.importWorkflow,
  ],
  [
    'POST /workflows',
    WorkflowCrudController,
    WorkflowCrudController.prototype.create,
  ],
  [
    'PATCH /workflows/:workflowId',
    WorkflowCrudController,
    WorkflowCrudController.prototype.update,
  ],
  [
    'DELETE /workflows/:workflowId',
    WorkflowCrudController,
    WorkflowCrudController.prototype.remove,
  ],
  [
    'POST /workflows/:workflowId/execute',
    WorkflowExecutionController,
    WorkflowExecutionController.prototype.execute,
  ],
  [
    'POST /workflows/:workflowId/execute/partial',
    WorkflowExecutionController,
    WorkflowExecutionController.prototype.executePartial,
  ],
  [
    'POST /workflows/:workflowId/execute/resume/:runId',
    WorkflowExecutionController,
    WorkflowExecutionController.prototype.resumeExecution,
  ],
  [
    'POST /workflows/:workflowId/executions/:executionId/approve',
    WorkflowExecutionController,
    WorkflowExecutionController.prototype.submitApproval,
  ],
  [
    'PATCH /workflows/:workflowId/nodes',
    WorkflowExecutionController,
    WorkflowExecutionController.prototype.patchNodes,
  ],
];

describe.each(GEN_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:read', 'images:read', 'brands:read', 'posts:read']],
    [['brands:write', 'brand-kit:write', 'credentials:read']],
    [['posts:approve', 'posts:publish', 'analytics:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([
    ['videos:create'],
    ['images:create'],
    ['prompts:create'],
    ['articles:create'],
    ['posts:draft'],
    ['admin'],
  ])('allows a key with %s', async (scope) => {
    const guard = buildGuard(keyWithScopes([scope]));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).resolves.toBe(true);
  });
});

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'PATCH /workflow-executions/admin/failures/:id/resolution',
    WorkflowExecutionsController,
    WorkflowExecutionsController.prototype.resolveAdminFailure,
  ],
  [
    'POST /workflows/:workflowId/webhook',
    WorkflowWebhookManagementController,
    WorkflowWebhookManagementController.prototype.generateWebhook,
  ],
  [
    'PATCH /workflows/:workflowId/webhook',
    WorkflowWebhookManagementController,
    WorkflowWebhookManagementController.prototype.patchWebhook,
  ],
  [
    'DELETE /workflows/:workflowId/webhook',
    WorkflowWebhookManagementController,
    WorkflowWebhookManagementController.prototype.deleteWebhook,
  ],
];

describe.each(ADMIN_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create', 'articles:create']],
      [['posts:draft', 'posts:schedule', 'posts:publish', 'brands:write']],
      [['videos:read', 'images:read', 'brands:read', 'credits:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['admin']])('allows a key with %s', async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    });
  },
);
