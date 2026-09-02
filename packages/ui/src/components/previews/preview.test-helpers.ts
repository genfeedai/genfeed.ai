import {
  CredentialPlatform,
  PostVisibility,
  ReleaseAttachmentKind,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseAttachment } from '@genfeedai/interfaces';
import type {
  TargetPreviewCredential,
  TargetPreviewRelease,
} from '@genfeedai/props/ui/previews.props';

/** Test-only fixture builders for the preview renderer suite. Not part of the package's public surface. */

let attachmentSequence = 0;

export function makeAttachment(
  overrides: Partial<IReleaseAttachment> = {},
): IReleaseAttachment {
  attachmentSequence += 1;

  return {
    body: 'Attachment body',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: `attachment-${attachmentSequence}`,
    isDeleted: false,
    kind: ReleaseAttachmentKind.COMMENT,
    order: 0,
    releaseId: 'release-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeRelease(
  overrides: Partial<TargetPreviewRelease> = {},
): TargetPreviewRelease {
  return {
    attachments: [],
    baseContent: 'Hello from Genfeed',
    media: [],
    title: 'Untitled release',
    ...overrides,
  };
}

export function makeTarget(
  overrides: Partial<IChannelTarget> = {},
): IChannelTarget {
  return {
    analytics: {
      collection: {
        capability: TargetAnalyticsCapability.SUPPORTED,
        error: null,
        freshness: TargetAnalyticsFreshness.UNAVAILABLE,
        lastCollectedAt: null,
        requestedAt: null,
        state: TargetAnalyticsCollectionState.PENDING,
      },
      snapshot: null,
      state: 'unavailable',
    },
    attachments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    credentialId: 'credential-1',
    id: 'target-1',
    isDeleted: false,
    order: 0,
    platform: CredentialPlatform.INSTAGRAM,
    releaseId: 'release-1',
    retryCount: 0,
    settings: {},
    source: ReleaseTargetSource.MANUAL,
    timezone: 'UTC',
    updatedAt: '2026-01-01T00:00:00.000Z',
    executionState: TargetExecutionState.DRAFT,
    validationIssues: [],
    validationState: TargetValidationState.PENDING,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  };
}

export function makeCredential(
  overrides: Partial<TargetPreviewCredential> = {},
): TargetPreviewCredential {
  return {
    externalAvatar: null,
    externalHandle: 'genfeed',
    externalName: 'Genfeed',
    label: 'Genfeed brand account',
    platform: CredentialPlatform.INSTAGRAM,
    ...overrides,
  };
}
