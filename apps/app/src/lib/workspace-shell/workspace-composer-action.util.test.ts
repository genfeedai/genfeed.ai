import type {
  ConversationComposerActionDefinition,
  ConversationComposerActionInvocation,
} from '@genfeedai/agent';

import {
  canLaunchComposerCanvas,
  canvasLaunchDispatchedResult,
  canvasLaunchUnavailableResult,
  isTrustedComposerActionMatch,
  overlayDispatchResult,
  resolveComposerActionGuard,
  resolveNamedComposerOverlay,
  resolveTrustedComposerAction,
} from './workspace-composer-action.util';

const trustedAction: ConversationComposerActionDefinition = {
  description: 'Open Studio',
  isConsequentialProposal: false,
  label: 'Studio',
  name: 'create',
  requiredScope: 'brand',
  route: '/studio',
};

const invocation: ConversationComposerActionInvocation = {
  action: trustedAction,
  arguments: '',
};

describe('workspace composer action helpers', () => {
  it('blocks consequential actions until scope is synchronized', () => {
    expect(
      resolveComposerActionGuard({
        invocation,
        isConsequentiallyBlocked: true,
        trustedAction,
      }),
    ).toMatchObject({ status: 'unauthorized' });
  });

  it('rejects unregistered or mismatched actions', () => {
    expect(isTrustedComposerActionMatch(undefined, invocation)).toBe(false);
    expect(
      resolveComposerActionGuard({
        invocation: {
          action: { ...trustedAction, route: '/other' },
          arguments: '',
        },
        isConsequentiallyBlocked: false,
        trustedAction,
      }),
    ).toMatchObject({ status: 'unavailable' });
  });

  it('opens named overlays and reports unavailability', () => {
    expect(
      resolveNamedComposerOverlay({
        actionName: 'workflow',
        openLibraryPicker: () => false,
        openWorkflowPicker: () => true,
      }),
    ).toMatchObject({ status: 'dispatched' });
    expect(
      resolveNamedComposerOverlay({
        actionName: 'remix',
        openLibraryPicker: () => false,
        openWorkflowPicker: () => true,
      }),
    ).toMatchObject({ status: 'unavailable' });
    expect(
      resolveNamedComposerOverlay({
        actionName: 'create',
        openLibraryPicker: () => true,
        openWorkflowPicker: () => true,
      }),
    ).toBeNull();
  });

  it('launches canvas destinations only on a push into canvas mode', () => {
    expect(canLaunchComposerCanvas({ history: 'push', mode: 'canvas' })).toBe(
      true,
    );
    expect(
      canLaunchComposerCanvas({ history: 'replace', mode: 'canvas' }),
    ).toBe(false);
    expect(canvasLaunchUnavailableResult().status).toBe('unavailable');
    expect(canvasLaunchDispatchedResult(trustedAction).message).toContain(
      'Studio',
    );
    expect(
      canvasLaunchDispatchedResult({
        ...trustedAction,
        isConsequentialProposal: true,
      }).message,
    ).toContain('typed confirmation');
  });

  it('narrows a trusted action after the guard passes', () => {
    const resolved = resolveTrustedComposerAction({
      invocation,
      isConsequentiallyBlocked: false,
      trustedAction,
    });
    expect(resolved).toEqual({ action: trustedAction, ok: true });
    expect(
      resolveTrustedComposerAction({
        invocation,
        isConsequentiallyBlocked: false,
        trustedAction: undefined,
      }).ok,
    ).toBe(false);
  });

  it('maps overlay open/close into dispatch results', () => {
    expect(overlayDispatchResult(true, 'opened', 'closed').status).toBe(
      'dispatched',
    );
    expect(overlayDispatchResult(false, 'opened', 'closed').status).toBe(
      'unavailable',
    );
  });
});
