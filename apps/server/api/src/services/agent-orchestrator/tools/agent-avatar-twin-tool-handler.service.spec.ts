import {
  AgentAvatarTwinToolHandler,
  nextStepFor,
} from '@api/services/agent-orchestrator/tools/agent-avatar-twin-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AvatarTwinStatus } from '@genfeedai/contracts';
import type { AvatarTwin } from '@genfeedai/prisma';

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

/** Input checks run before any twin is read, so no service is reached. */
const handler = new AgentAvatarTwinToolHandler(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
);

function twin(
  status: AvatarTwinStatus,
  providerConsent: string | null = 'pending',
): AvatarTwin {
  return {
    failureMessage: status === AvatarTwinStatus.READY ? null : 'Face hidden.',
    providerConsent,
    status,
  } as AvatarTwin;
}

describe('AgentAvatarTwinToolHandler', () => {
  it.each([
    [AvatarTwinStatus.UPLOADING, 'pending', 'Not ready yet'],
    [AvatarTwinStatus.TRAINING, 'pending', 'opens the consent link'],
    [AvatarTwinStatus.TRAINING, 'accepted', 'Consent is accepted'],
    [AvatarTwinStatus.AWAITING_CONSENT, 'pending', 'Not ready until HeyGen'],
    [AvatarTwinStatus.CONSENT_REJECTED, 'rejected', 'digital_twin_consent'],
    [AvatarTwinStatus.FAILED, null, 'Face hidden. Record or upload a new take'],
    [AvatarTwinStatus.READY, 'accepted', 'Ready. Make it the brand default'],
  ])(
    'tells the person what to do when the twin is %s (consent %s)',
    (status, consent, expected) => {
      expect(nextStepFor(twin(status, consent))).toContain(expected);
    },
  );

  it.each([
    AvatarTwinStatus.UPLOADING,
    AvatarTwinStatus.TRAINING,
    AvatarTwinStatus.AWAITING_CONSENT,
    AvatarTwinStatus.CONSENT_REJECTED,
    AvatarTwinStatus.FAILED,
  ])('never calls a %s twin ready', (status) => {
    expect(nextStepFor(twin(status))).not.toMatch(/^Ready/);
  });

  it.each([
    [
      'a start without a video',
      () => handler.start({}, ctx),
      'videoId is required for operation digital_twin.',
    ],
    [
      'a non-boolean keep flag',
      () => handler.start({ isRecordingKept: 'yes', videoId: 'v-1' }, ctx),
      'isRecordingKept must be a boolean.',
    ],
    [
      'a consent link without a twin',
      () => handler.requestConsent({}, ctx),
      'twinId is required for operation digital_twin_consent.',
    ],
    [
      'a default at organization scope',
      () =>
        handler.setBrandDefault(
          { defaultAvatar: { twinId: 't-1' }, scope: 'organization' },
          ctx,
        ),
      'defaultAvatar needs scope brand.',
    ],
    [
      'a default without a twin',
      () => handler.setBrandDefault({ defaultAvatar: {}, scope: 'brand' }, ctx),
      'defaultAvatar.twinId is required.',
    ],
    [
      'a Library filter on a twin listing',
      () => handler.list({ shelf: 'approved', type: 'digital_twin' }, ctx),
      'shelf does not apply to type digital_twin.',
    ],
  ])('refuses %s', async (_label, call, error) => {
    expect(await call()).toEqual({ creditsUsed: 0, error, success: false });
  });

  it.each([
    ['get_assets', { type: 'digital_twin' }, true],
    ['get_assets', { type: 'voice' }, false],
    ['transform_media', { type: 'digital_twin' }, false],
  ])('%s %o is a twin listing: %s', (tool, params, expected) => {
    expect(handler.handlesList(tool, params)).toBe(expected);
  });
});
