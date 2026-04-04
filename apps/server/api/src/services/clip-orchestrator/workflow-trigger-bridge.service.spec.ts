import type { ConversationIntent } from '@api/services/clip-orchestrator/workflow-trigger-bridge.service';
import { WorkflowTriggerBridgeService } from '@api/services/clip-orchestrator/workflow-trigger-bridge.service';

function makeIntent(
  overrides: Partial<ConversationIntent> = {},
): ConversationIntent {
  return {
    contentType: 'clip',
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('WorkflowTriggerBridgeService', () => {
  let service: WorkflowTriggerBridgeService;

  beforeEach(() => {
    service = new WorkflowTriggerBridgeService();
  });

  // -------------------------------------------------------------------------
  // 1. Default mapping
  // -------------------------------------------------------------------------
  it('should map intent with defaults (twitter, 30s, 16:9)', () => {
    const payload = service.mapConversationIntentToWorkflow(makeIntent());

    expect(payload.platform).toBe('twitter');
    expect(payload.data.duration).toBe(30);
    expect(payload.data.aspectRatio).toBe('16:9');
    expect(payload.metadata.triggeredBy).toBe('conversation');
    expect(payload.metadata.confirmBeforePublish).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Override platform
  // -------------------------------------------------------------------------
  it('should apply platform override', () => {
    const payload = service.mapConversationIntentToWorkflow(
      makeIntent({ platform: 'youtube' }),
    );
    expect(payload.platform).toBe('youtube');
  });

  // -------------------------------------------------------------------------
  // 3. Override duration and aspect ratio
  // -------------------------------------------------------------------------
  it('should apply duration and aspectRatio overrides', () => {
    const payload = service.mapConversationIntentToWorkflow(
      makeIntent({ aspectRatio: '9:16', duration: 60 }),
    );
    expect(payload.data.duration).toBe(60);
    expect(payload.data.aspectRatio).toBe('9:16');
  });

  // -------------------------------------------------------------------------
  // 4. confirmBeforePublish defaults to true
  // -------------------------------------------------------------------------
  it('should default confirmBeforePublish to true', () => {
    const payload = service.mapConversationIntentToWorkflow(makeIntent());
    expect(payload.metadata.confirmBeforePublish).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. confirmBeforePublish can be set to false
  // -------------------------------------------------------------------------
  it('should respect confirmBeforePublish=false', () => {
    const payload = service.mapConversationIntentToWorkflow(
      makeIntent({ confirmBeforePublish: false }),
    );
    expect(payload.metadata.confirmBeforePublish).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Unsupported platform throws
  // -------------------------------------------------------------------------
  it('should throw for unsupported platform', () => {
    expect(() =>
      service.mapConversationIntentToWorkflow(
        makeIntent({ platform: 'myspace' }),
      ),
    ).toThrow('Unsupported platform: myspace');
  });

  // -------------------------------------------------------------------------
  // 7. Invalid aspect ratio throws
  // -------------------------------------------------------------------------
  it('should throw for invalid aspect ratio', () => {
    expect(() =>
      service.mapConversationIntentToWorkflow(
        makeIntent({ aspectRatio: '3:2' }),
      ),
    ).toThrow('Invalid aspect ratio: 3:2');
  });

  // -------------------------------------------------------------------------
  // 8. Missing userId throws
  // -------------------------------------------------------------------------
  it('should throw when userId is missing', () => {
    expect(() =>
      service.mapConversationIntentToWorkflow(makeIntent({ userId: '' })),
    ).toThrow('userId');
  });

  // -------------------------------------------------------------------------
  // 9. Missing organizationId throws
  // -------------------------------------------------------------------------
  it('should throw when organizationId is missing', () => {
    expect(() =>
      service.mapConversationIntentToWorkflow(
        makeIntent({ organizationId: '' }),
      ),
    ).toThrow('organizationId');
  });

  // -------------------------------------------------------------------------
  // 10. Content type mapping
  // -------------------------------------------------------------------------
  it('should map content types to correct trigger types', () => {
    expect(service.resolveTypeTrigger('clip')).toBe('clipGeneration');
    expect(service.resolveTypeTrigger('highlight')).toBe('highlightGeneration');
    expect(service.resolveTypeTrigger('trailer')).toBe('trailerGeneration');
  });

  // -------------------------------------------------------------------------
  // 11. Overrides are merged into data
  // -------------------------------------------------------------------------
  it('should merge freeform overrides into data payload', () => {
    const payload = service.mapConversationIntentToWorkflow(
      makeIntent({ overrides: { captionStyle: 'bold', color: '#fff' } }),
    );
    expect(payload.data.captionStyle).toBe('bold');
    expect(payload.data.color).toBe('#fff');
  });

  // -------------------------------------------------------------------------
  // 12. isSupportedPlatform
  // -------------------------------------------------------------------------
  it('should correctly identify supported platforms', () => {
    expect(service.isSupportedPlatform('twitter')).toBe(true);
    expect(service.isSupportedPlatform('TikTok')).toBe(true);
    expect(service.isSupportedPlatform('myspace')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 13. getDefaults returns expected values
  // -------------------------------------------------------------------------
  it('should return correct defaults', () => {
    const defaults = service.getDefaults();
    expect(defaults).toEqual({
      aspectRatio: '16:9',
      duration: 30,
      platform: 'twitter',
    });
  });

  // -------------------------------------------------------------------------
  // 14. Negative duration throws
  // -------------------------------------------------------------------------
  it('should throw for non-positive duration', () => {
    expect(() =>
      service.mapConversationIntentToWorkflow(makeIntent({ duration: -5 })),
    ).toThrow('Duration must be a positive number');
  });
});
