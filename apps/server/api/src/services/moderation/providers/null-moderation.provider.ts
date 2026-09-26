import type { ModerationScores } from '@genfeedai/contracts/api-types/contracts';
import type { IModerationProvider } from '@genfeedai/contracts/interfaces';

/**
 * Self-host default (#4880): nothing leaves the host and nothing is scored.
 * The moderation service checks `isEnabled` and persists no verdict at all,
 * so these methods are only reachable from a caller that ignored it.
 */
export class NullModerationProvider implements IModerationProvider {
  readonly isEnabled = false;
  readonly name = 'none' as const;

  async classifyImage(): Promise<ModerationScores> {
    return {};
  }

  async classifyFrames(urls: readonly string[]): Promise<ModerationScores[]> {
    return urls.map(() => ({}));
  }

  async classifyText(): Promise<ModerationScores> {
    return {};
  }
}
