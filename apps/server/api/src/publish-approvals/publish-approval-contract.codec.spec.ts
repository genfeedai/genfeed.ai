import {
  CredentialPlatform,
  PublishApprovalPolicyId,
  PublishApprovalStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  type ApprovalPost,
  PublishApprovalContractCodec,
  type PublishApprovalRow,
} from './publish-approval-contract.codec';

const NOW = new Date('2026-07-19T06:00:00.000Z');

function makePost(overrides: Partial<ApprovalPost> = {}): ApprovalPost {
  return {
    agentContextVersion: 4,
    brandId: 'brand-1',
    credentialId: 'credential-1',
    id: 'post-1',
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    publishApprovalId: 'approval-1',
    scheduledDate: new Date('2026-07-20T10:00:00.000Z'),
    status: 'scheduled',
    targetExecutionState: TargetExecutionState.SCHEDULED,
    timezone: 'UTC',
    ...overrides,
  };
}

function makeRow(
  overrides: Partial<PublishApprovalRow> = {},
): PublishApprovalRow {
  return {
    actorUserId: 'user-1',
    artifactVersionPinId: 'pin-1',
    brandId: 'brand-1',
    contextVersion: 4,
    createdAt: NOW,
    destinations: [
      {
        credentialId: 'credential-z',
        platform: CredentialPlatform.YOUTUBE,
      },
      {
        credentialId: 'credential-a',
        platform: CredentialPlatform.TWITTER,
      },
    ],
    executedAt: null,
    id: 'approval-1',
    invalidatedAt: null,
    invalidationReason: null,
    lastError: null,
    operationId: 'operation-1',
    organizationId: 'org-1',
    policy: {
      id: PublishApprovalPolicyId.VERSION_BOUND_V1,
      version: 1,
    },
    postId: 'post-1',
    provenance: { source: 'typed-publish-approval' },
    scheduleIntent: {
      kind: 'scheduled',
      scheduledAt: '2026-07-20T10:00:00.000Z',
      timezone: 'UTC',
    },
    scopeDigest: 'scope-digest',
    status: PublishApprovalStatus.QUEUED,
    statusTransitions: [
      {
        actorId: 'user-1',
        at: NOW.toISOString(),
        from: PublishApprovalStatus.APPROVED,
        reason: 'Ready to publish.',
        to: PublishApprovalStatus.QUEUED,
      },
    ],
    updatedAt: NOW,
    ...overrides,
  };
}

describe('PublishApprovalContractCodec', () => {
  const codec = new PublishApprovalContractCodec();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses the version-bound create contract', () => {
    expect(
      codec.parseCreateInput({
        contextVersion: 4,
        policy: {
          id: PublishApprovalPolicyId.VERSION_BOUND_V1,
          version: 1,
        },
        postId: 'post-1',
        scheduleIntent: {
          kind: 'scheduled',
          scheduledAt: '2026-07-20T10:00:00.000Z',
          timezone: 'UTC',
        },
      }),
    ).toEqual({
      contextVersion: 4,
      policy: {
        id: PublishApprovalPolicyId.VERSION_BOUND_V1,
        version: 1,
      },
      postId: 'post-1',
      scheduleIntent: {
        kind: 'scheduled',
        scheduledAt: '2026-07-20T10:00:00.000Z',
        timezone: 'UTC',
      },
    });
  });

  it('preserves the structured bad-request response for invalid create input', () => {
    expect.assertions(3);
    try {
      codec.parseCreateInput({ postId: '' });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          detail: expect.stringContaining('postId'),
          title: 'Invalid publish approval payload',
        }),
      );
      expect((error as BadRequestException).getStatus()).toBe(400);
    }
  });

  it('validates canonical schedule, destination, and target contracts', () => {
    const post = makePost();
    const intent = {
      kind: 'scheduled' as const,
      scheduledAt: post.scheduledDate?.toISOString() ?? '',
      timezone: post.timezone,
    };

    expect(() => codec.assertScheduleIntent(post, intent)).not.toThrow();
    expect(codec.requireScheduledDate(post)).toEqual(post.scheduledDate);
    expect(codec.canonicalDestinations(post)).toEqual([
      {
        credentialId: 'credential-1',
        platform: CredentialPlatform.TWITTER,
      },
    ]);
    expect(() => codec.assertTargetStatus(post)).not.toThrow();
  });

  it('projects persisted JSON through the public contract deterministically', () => {
    expect(codec.toInterface(makeRow())).toEqual({
      actorUserId: 'user-1',
      artifactVersionPinId: 'pin-1',
      brandId: 'brand-1',
      contextVersion: 4,
      createdAt: NOW.toISOString(),
      destinations: [
        {
          credentialId: 'credential-a',
          platform: CredentialPlatform.TWITTER,
        },
        {
          credentialId: 'credential-z',
          platform: CredentialPlatform.YOUTUBE,
        },
      ],
      executedAt: null,
      id: 'approval-1',
      invalidatedAt: null,
      invalidationReason: null,
      operationId: 'operation-1',
      organizationId: 'org-1',
      policy: {
        id: PublishApprovalPolicyId.VERSION_BOUND_V1,
        version: 1,
      },
      postId: 'post-1',
      provenance: {
        actorUserId: 'user-1',
        origin: 'unknown',
        source: 'typed-publish-approval',
      },
      scheduleIntent: {
        kind: 'scheduled',
        scheduledAt: '2026-07-20T10:00:00.000Z',
        timezone: 'UTC',
      },
      scopeDigest: 'scope-digest',
      status: PublishApprovalStatus.QUEUED,
      statusTransitions: [
        {
          actorId: 'user-1',
          at: NOW.toISOString(),
          from: PublishApprovalStatus.APPROVED,
          reason: 'Ready to publish.',
          to: PublishApprovalStatus.QUEUED,
        },
      ],
      updatedAt: NOW.toISOString(),
    });
  });

  it.each([
    [
      () => codec.parseStatus('unknown'),
      'Publish approval contains an unknown lifecycle status.',
    ],
    [
      () => codec.parseExecutionStartedAt('not-a-timestamp'),
      'Publish execution lease timestamp is invalid.',
    ],
    [
      () => codec.readDestinations([]),
      'Publish approval destinations are invalid.',
    ],
    [
      () => codec.readScheduleIntent({}),
      'Publish approval schedule intent is invalid.',
    ],
    [() => codec.readPolicy({}), 'Publish approval policy is invalid.'],
    [
      () => codec.readTransitions({}),
      'Publish approval transition history is invalid.',
    ],
  ])('preserves persisted-contract failure behavior', (read, message) => {
    expect(read).toThrow(new ConflictException(message));
  });

  it('creates a stable transition shape at the current instant', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(
      codec.transition(
        PublishApprovalStatus.APPROVED,
        PublishApprovalStatus.QUEUED,
        'user-1',
        'Ready to publish.',
      ),
    ).toEqual({
      actorId: 'user-1',
      at: NOW.toISOString(),
      from: PublishApprovalStatus.APPROVED,
      reason: 'Ready to publish.',
      to: PublishApprovalStatus.QUEUED,
    });
  });
});
