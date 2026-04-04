import { Injectable } from '@nestjs/common';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Represents a parsed conversation intent for clip creation.
 */
export interface ConversationIntent {
  /** Type of content to produce. */
  contentType: 'clip' | 'highlight' | 'trailer';

  /** Source video or project reference. */
  sourceId?: string;

  /** Target platform override. */
  platform?: string;

  /** Duration override in seconds. */
  duration?: number;

  /** Aspect ratio override (e.g. '16:9', '9:16', '1:1'). */
  aspectRatio?: string;

  /** Whether to require confirmation before publishing. */
  confirmBeforePublish?: boolean;

  /** User ID initiating the intent. */
  userId: string;

  /** Organization owning the content. */
  organizationId: string;

  /** Optional workflow ID to bind to. */
  workflowId?: string;

  /** Freeform overrides passed to workflow nodes. */
  overrides?: Record<string, unknown>;
}

/**
 * Payload ready to be passed to WorkflowExecutorService.
 */
export interface WorkflowTriggerPayload {
  /** Trigger type matching workflow trigger nodes. */
  type: string;

  /** Target platform. */
  platform: string;

  /** Organization ID. */
  organizationId: string;

  /** User ID. */
  userId: string;

  /** Data passed to the workflow trigger node. */
  data: {
    sourceId?: string;
    contentType: string;
    duration: number;
    aspectRatio: string;
    [key: string]: unknown;
  };

  /** Execution metadata for tracking and control. */
  metadata: {
    confirmBeforePublish: boolean;
    triggeredBy: 'conversation';
    workflowId?: string;
    [key: string]: unknown;
  };
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_PLATFORM = 'twitter';
const DEFAULT_DURATION_SECONDS = 30;
const DEFAULT_ASPECT_RATIO = '16:9'; // landscape

// =============================================================================
// SERVICE
// =============================================================================

/**
 * WorkflowTriggerBridgeService
 *
 * Maps conversation intents and defaults into workflow execution
 * payloads ready for WorkflowExecutorService. Acts as a translation
 * layer between the conversational agent and the workflow engine.
 */
@Injectable()
export class WorkflowTriggerBridgeService {
  /**
   * Map a conversation intent into a WorkflowTriggerPayload.
   *
   * Applies defaults for platform, duration, and aspect ratio
   * when not specified in the intent. Merges any freeform overrides
   * into the data payload.
   */
  mapConversationIntentToWorkflow(
    intent: ConversationIntent,
  ): WorkflowTriggerPayload {
    this.validateIntent(intent);

    const platform = intent.platform ?? DEFAULT_PLATFORM;
    const duration = intent.duration ?? DEFAULT_DURATION_SECONDS;
    const aspectRatio = intent.aspectRatio ?? DEFAULT_ASPECT_RATIO;
    const confirmBeforePublish = intent.confirmBeforePublish ?? true;

    return {
      data: {
        aspectRatio,
        contentType: intent.contentType,
        duration,
        sourceId: intent.sourceId,
        ...(intent.overrides ?? {}),
      },
      metadata: {
        confirmBeforePublish,
        triggeredBy: 'conversation',
        workflowId: intent.workflowId,
      },
      organizationId: intent.organizationId,
      platform,
      type: this.resolveTypeTrigger(intent.contentType),
      userId: intent.userId,
    };
  }

  /**
   * Resolve the trigger type string from the content type.
   */
  resolveTypeTrigger(contentType: ConversationIntent['contentType']): string {
    const typeMap: Record<string, string> = {
      clip: 'clipGeneration',
      highlight: 'highlightGeneration',
      trailer: 'trailerGeneration',
    };
    return typeMap[contentType] ?? 'clipGeneration';
  }

  /**
   * Check whether a platform is supported.
   */
  isSupportedPlatform(platform: string): boolean {
    const supported = new Set([
      'twitter',
      'youtube',
      'tiktok',
      'instagram',
      'linkedin',
    ]);
    return supported.has(platform.toLowerCase());
  }

  /**
   * Check whether an aspect ratio string is valid.
   */
  isValidAspectRatio(ratio: string): boolean {
    const valid = new Set(['16:9', '9:16', '1:1', '4:5', '4:3']);
    return valid.has(ratio);
  }

  /**
   * Return the default payload values (useful for UI hints).
   */
  getDefaults(): {
    platform: string;
    duration: number;
    aspectRatio: string;
  } {
    return {
      aspectRatio: DEFAULT_ASPECT_RATIO,
      duration: DEFAULT_DURATION_SECONDS,
      platform: DEFAULT_PLATFORM,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private validateIntent(intent: ConversationIntent): void {
    if (!intent.userId) {
      throw new Error('ConversationIntent requires a userId');
    }
    if (!intent.organizationId) {
      throw new Error('ConversationIntent requires an organizationId');
    }
    if (!intent.contentType) {
      throw new Error('ConversationIntent requires a contentType');
    }

    if (intent.platform && !this.isSupportedPlatform(intent.platform)) {
      throw new Error(`Unsupported platform: ${intent.platform}`);
    }

    if (intent.aspectRatio && !this.isValidAspectRatio(intent.aspectRatio)) {
      throw new Error(`Invalid aspect ratio: ${intent.aspectRatio}`);
    }

    if (intent.duration !== undefined && intent.duration <= 0) {
      throw new Error('Duration must be a positive number');
    }
  }
}
