import { assertClipperWorkflowActor } from './clipper-workflow-actor.util';

describe('Clip workflow execution actor', () => {
  const request = {
    context: { organizationId: 'org-1', userId: 'user-1' },
    input: {},
  };
  it('accepts the trusted organization and canonical actor', () => {
    expect(() =>
      assertClipperWorkflowActor(request as never, {
        orgId: 'org-1',
        userId: 'user-1',
      }),
    ).not.toThrow();
  });
  it.each([
    { orgId: 'foreign-org', userId: 'user-1' },
    { orgId: 'org-1', userId: 'foreign-user' },
  ])('rejects substituted nested actor %j', (actor) => {
    expect(() => assertClipperWorkflowActor(request as never, actor)).toThrow(
      'does not match',
    );
  });
  it.each([
    { orgId: 'foreign-org' },
    { organizationId: 'foreign-org' },
    { userId: 'foreign-user' },
  ])('rejects substituted top-level actor %j', (input) => {
    expect(() =>
      assertClipperWorkflowActor({ ...request, input } as never),
    ).toThrow('does not match');
  });
  it.each([
    undefined,
    { organizationId: '', userId: 'user-1' },
    { organizationId: 'org-1', userId: '' },
  ])('rejects missing execution identity %j', (context) => {
    expect(() =>
      assertClipperWorkflowActor({ ...request, context } as never),
    ).toThrow('does not match');
  });
});
