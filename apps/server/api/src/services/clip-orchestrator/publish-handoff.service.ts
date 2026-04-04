import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishAsset {
  /** Asset identifier (clip result ID, merged video ID, etc.). */
  assetId: string;
  /** Public or signed URL to the media file. */
  mediaUrl: string;
  /** MIME type of the asset (e.g. video/mp4). */
  mimeType: string;
  /** Optional caption / post text. */
  caption?: string;
}

export interface PublishHandoffPayload {
  /** Clip project this handoff belongs to. */
  clipProjectId: string;
  /** Assets ready for publishing. */
  assets: PublishAsset[];
  /** Target platforms (matches workflow publish node schema). */
  platforms: string[];
  /** Schedule mode — mirrors the workflow output-publish node config. */
  schedule: 'immediate' | 'scheduled';
  /**
   * Always `true`. Publishing is an explicit user action; the service only
   * prepares the payload and never auto-publishes.
   */
  confirmBeforePublish: true;
  /** ISO timestamp when the handoff was prepared. */
  preparedAt: string;
  /** Arbitrary metadata forwarded to the publish UI. */
  metadata?: Record<string, unknown>;
}

export interface PrepareHandoffOptions {
  /** Platforms to target. Defaults to `['instagram']`. */
  platforms?: string[];
  /** Schedule mode. Defaults to `'immediate'`. */
  schedule?: 'immediate' | 'scheduled';
  /** Extra metadata for the publish UI. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PublishHandoffService {
  private readonly logContext = 'PublishHandoffService';

  constructor(private readonly logger: LoggerService) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Prepare a publish handoff payload from a clip project's output assets.
   *
   * The returned payload is compatible with the existing ModalPublish /
   * workflow `output-publish` node format so it can be rendered directly in
   * the publish UI without any new subsystem.
   *
   * This method **never** auto-publishes. `confirmBeforePublish` is always
   * `true` — the user must explicitly confirm in the UI.
   */
  async preparePublishHandoff(
    clipProjectId: string,
    assetIds: string[],
    options?: PrepareHandoffOptions,
  ): Promise<PublishHandoffPayload> {
    if (!clipProjectId) {
      throw new Error('clipProjectId is required');
    }
    if (!assetIds || assetIds.length === 0) {
      throw new Error('At least one asset ID is required');
    }

    const platforms = options?.platforms ?? ['instagram'];
    const schedule = options?.schedule ?? 'immediate';

    // Build asset stubs. In the real implementation the service would look up
    // each asset's media URL and MIME type from the clip results / merged
    // output collections.
    const assets: PublishAsset[] = assetIds.map((assetId) => ({
      assetId,
      mediaUrl: '', // resolved by the orchestrator / asset lookup
      mimeType: 'video/mp4',
    }));

    const payload: PublishHandoffPayload = {
      assets,
      clipProjectId,
      confirmBeforePublish: true,
      metadata: options?.metadata,
      platforms,
      preparedAt: new Date().toISOString(),
      schedule,
    };

    this.logger.log(`${this.logContext} publish handoff prepared`, {
      assetCount: assets.length,
      clipProjectId,
      platforms,
      schedule,
    });

    return payload;
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate that a handoff payload meets the requirements for the publish UI.
   */
  validatePayload(payload: PublishHandoffPayload): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!payload.clipProjectId) {
      errors.push('clipProjectId is required');
    }
    if (!payload.assets || payload.assets.length === 0) {
      errors.push('At least one asset is required');
    }
    if (!payload.platforms || payload.platforms.length === 0) {
      errors.push('At least one platform is required');
    }
    if (payload.confirmBeforePublish !== true) {
      errors.push('confirmBeforePublish must be true');
    }

    return { errors, valid: errors.length === 0 };
  }
}
