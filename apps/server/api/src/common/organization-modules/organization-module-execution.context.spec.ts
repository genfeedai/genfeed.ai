import {
  getOrganizationModuleExecutionContext,
  parseOrganizationModuleExecutionContext,
  runWithOrganizationModule,
} from '@api/common/organization-modules/organization-module-execution.context';
import { describe, expect, it } from 'vitest';

describe('server-owned organization module execution context', () => {
  it('keeps concurrent organizations isolated across awaits and restores nesting', async () => {
    await Promise.all(
      ['org-1', 'org-2'].map((organizationId) =>
        runWithOrganizationModule(
          { organizationId, moduleId: 'playground' },
          async () => {
            await Promise.resolve();
            expect(getOrganizationModuleExecutionContext()).toEqual({
              organizationId,
              moduleId: 'playground',
            });
            await runWithOrganizationModule(
              { organizationId, moduleId: 'storyboard' },
              async () => {
                await Promise.resolve();
                expect(getOrganizationModuleExecutionContext()?.moduleId).toBe(
                  'storyboard',
                );
              },
            );
            expect(getOrganizationModuleExecutionContext()?.moduleId).toBe(
              'playground',
            );
          },
        ),
      ),
    );
    expect(getOrganizationModuleExecutionContext()).toBeUndefined();
  });

  it('snapshots the admitted scope and restores it after failure', async () => {
    const scope = { organizationId: 'org-1', moduleId: 'batch' as const };
    await expect(
      runWithOrganizationModule(scope, async () => {
        scope.organizationId = 'forged';
        await Promise.resolve();
        expect(getOrganizationModuleExecutionContext()?.organizationId).toBe(
          'org-1',
        );
        expect(Object.isFrozen(getOrganizationModuleExecutionContext())).toBe(
          true,
        );
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');
    expect(getOrganizationModuleExecutionContext()).toBeUndefined();
  });

  it('rejects missing organization scope', () => {
    expect(() =>
      runWithOrganizationModule(
        { organizationId: ' ', moduleId: 'batch' },
        () => undefined,
      ),
    ).toThrow('Authenticated module execution context is required');
  });
});

describe('queued module envelope', () => {
  it('copies only a valid matching server scope', () => {
    const input = { organizationId: 'org-1', moduleId: 'batch' };
    const context = parseOrganizationModuleExecutionContext(input, 'org-1');
    input.moduleId = 'playground';
    expect(context).toEqual({ organizationId: 'org-1', moduleId: 'batch' });
    expect(Object.isFrozen(context)).toBe(true);
    expect(
      parseOrganizationModuleExecutionContext(undefined, 'org-1'),
    ).toBeUndefined();
  });

  it.each([
    null,
    true,
    [],
    'batch',
    {},
    { organizationId: 'org-1' },
    { organizationId: 'org-1', moduleId: 'unknown' },
    { organizationId: 'other-org', moduleId: 'batch' },
    { organizationId: ' ', moduleId: 'batch' },
    { organizationId: 'org-1', moduleId: 'batch', operation: 'read' },
    { organizationId: 'org-1', moduleId: 'batch', bypass: true },
  ])('rejects malformed or grant-expanding persisted data: %j', (input) => {
    expect(() =>
      parseOrganizationModuleExecutionContext(input, 'org-1'),
    ).toThrow('Invalid queued organization module execution context');
  });

  it('requires a job-owned tenant identity', () => {
    expect(() =>
      parseOrganizationModuleExecutionContext(
        { organizationId: 'org-1', moduleId: 'batch' },
        undefined,
      ),
    ).toThrow('Invalid queued organization module execution context');
  });
});
