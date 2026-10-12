import {
  applyComposerText,
  type ComposerTextWrite,
  undoComposerText,
} from '~platforms/composer-helpers';
import type {
  AppliedComposerText,
  ComposerTextSnapshot,
} from '~types/extension';

const MAX_OPEN_SESSIONS = 5;

/**
 * One text action on one composer: the text captured before the preview, and
 * the one apply that Undo can reverse. The page owns it; the side panel only
 * ever holds its id.
 */
export class TextActionSession {
  private applied: AppliedComposerText | null = null;

  constructor(readonly snapshot: ComposerTextSnapshot) {}

  apply(text: string): ComposerTextWrite {
    const written = applyComposerText(this.snapshot, text);
    if (written.success) this.applied = written.applied;
    return written;
  }

  undo(): { error?: string; success: boolean } {
    if (!this.applied) {
      return { error: 'There is nothing to undo.', success: false };
    }
    const reverted = undoComposerText(this.applied);
    if (reverted.success) this.applied = null;
    return reverted;
  }
}

const sessions = new Map<string, TextActionSession>();

/** Keeps a session for the side panel to apply later; the oldest are forgotten. */
export function registerTextActionSession(session: TextActionSession): string {
  const id = crypto.randomUUID();
  sessions.set(id, session);
  while (sessions.size > MAX_OPEN_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
  return id;
}

export function findTextActionSession(
  id: unknown,
): TextActionSession | undefined {
  return typeof id === 'string' ? sessions.get(id) : undefined;
}
