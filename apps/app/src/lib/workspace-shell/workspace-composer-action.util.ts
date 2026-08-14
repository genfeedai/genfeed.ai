import type {
  ConversationComposerActionDefinition,
  ConversationComposerActionInvocation,
  ConversationComposerActionName,
  ConversationComposerDispatchResult,
} from '@genfeedai/agent';

export function overlayDispatchResult(
  didOpen: boolean,
  openedMessage: string,
  closedMessage: string,
): ConversationComposerDispatchResult {
  if (didOpen) {
    return {
      message: openedMessage,
      status: 'dispatched',
    };
  }

  return {
    message: closedMessage,
    status: 'unavailable',
  };
}

export function isTrustedComposerActionMatch(
  trustedAction: ConversationComposerActionDefinition | undefined,
  invocation: ConversationComposerActionInvocation,
): boolean {
  if (!trustedAction) {
    return false;
  }

  if (trustedAction.route !== invocation.action.route) {
    return false;
  }

  return trustedAction.requiredScope === invocation.action.requiredScope;
}

export function resolveComposerActionGuard(input: {
  invocation: ConversationComposerActionInvocation;
  isConsequentiallyBlocked: boolean;
  trustedAction: ConversationComposerActionDefinition | undefined;
}): ConversationComposerDispatchResult | null {
  if (input.isConsequentiallyBlocked) {
    return {
      message:
        'Synchronize the server-authoritative conversation scope before opening consequential actions. Your draft is unchanged.',
      status: 'unauthorized',
    };
  }

  if (!isTrustedComposerActionMatch(input.trustedAction, input.invocation)) {
    return {
      message:
        'That action is not registered. Your draft and references are unchanged.',
      status: 'unavailable',
    };
  }

  return null;
}

export function resolveNamedComposerOverlay(input: {
  actionName: ConversationComposerActionName;
  openLibraryPicker: () => boolean;
  openWorkflowPicker: () => boolean;
}): ConversationComposerDispatchResult | null {
  if (input.actionName === 'workflow') {
    return overlayDispatchResult(
      input.openWorkflowPicker(),
      'Opened the authorized workflow picker. Choose a workflow to attach it or open its focused editor.',
      'The workflow picker is unavailable. Your draft and references are unchanged.',
    );
  }

  if (input.actionName === 'remix') {
    return overlayDispatchResult(
      input.openLibraryPicker(),
      'Opened the authorized Library picker. Your draft and active thread are preserved.',
      'The Library picker is unavailable. Your draft and references are unchanged.',
    );
  }

  return null;
}

export type ComposerCanvasLaunch = {
  readonly history: string;
  readonly mode: string;
};

export function canLaunchComposerCanvas(launch: ComposerCanvasLaunch): boolean {
  return launch.history === 'push' && launch.mode === 'canvas';
}

export type ResolvedComposerAction =
  | {
      readonly action: ConversationComposerActionDefinition;
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly result: ConversationComposerDispatchResult;
    };

export function resolveTrustedComposerAction(input: {
  invocation: ConversationComposerActionInvocation;
  isConsequentiallyBlocked: boolean;
  trustedAction: ConversationComposerActionDefinition | undefined;
}): ResolvedComposerAction {
  const blocked = resolveComposerActionGuard(input);
  if (blocked) {
    return { ok: false, result: blocked };
  }

  if (!input.trustedAction) {
    return {
      ok: false,
      result: {
        message:
          'That action is not registered. Your draft and references are unchanged.',
        status: 'unavailable',
      },
    };
  }

  return { ok: true, action: input.trustedAction };
}

export function canvasLaunchUnavailableResult(): ConversationComposerDispatchResult {
  return {
    message:
      'That product surface is unavailable. Your draft and references are unchanged.',
    status: 'unavailable',
  };
}

export function canvasLaunchDispatchedResult(
  trustedAction: ConversationComposerActionDefinition,
): ConversationComposerDispatchResult {
  if (trustedAction.isConsequentialProposal) {
    return {
      message: `Opened ${trustedAction.label}. Your draft is preserved; execution still requires the product's explicit typed confirmation and authorization.`,
      status: 'dispatched',
    };
  }

  return {
    message: `Opened ${trustedAction.label}. Your draft and references are preserved.`,
    status: 'dispatched',
  };
}
