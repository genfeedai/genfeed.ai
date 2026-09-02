/**
 * Context carried from a finished clip into the Agent so a draft can be written
 * without the retired composer. Everything is optional except the title — a
 * handoff with no media still gives the Agent enough to start from.
 */
export interface IClipDraftHandoff {
  description?: string;
  ingredientId?: string;
  mediaUrl?: string;
  title: string;
}
