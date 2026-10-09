import {
  GENERATION_ENTRY_HEADER,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import { isDesktopRuntimeShell } from '@services/core/desktop-runtime.service';

/** A renderer hint, not identity proof. Server calls must not claim a browser. */
export function getGenerationEntryHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return {
    [GENERATION_ENTRY_HEADER]: isDesktopRuntimeShell()
      ? GenerationEntryChannel.DESKTOP
      : GenerationEntryChannel.WEB,
  };
}
