/**
 * One entry in the `/` command palette shared by the Agent and Studio composers.
 *
 * `action` navigates or runs a composer action, `prompt` seeds the editor with
 * a prefix, and `skill` invokes a catalog skill against the current turn.
 */
export type PromptCommandKind = 'action' | 'prompt' | 'skill';

export interface PromptCommand {
  description: string;
  kind: PromptCommandKind;
  label: string;
  /** Unique within a palette; also the text typed after `/`. */
  name: string;
  /** Composer action to dispatch when `kind` is `action`. */
  actionName?: string;
  /** Icon key; falls back to a generic glyph when the palette has no match. */
  iconKey?: string;
  /** Text inserted into the editor when `kind` is `prompt`. */
  promptPrefix?: string;
  /** Catalog slug invoked when `kind` is `skill`. */
  skillSlug?: string;
}

export interface PromptCommandListProps {
  command: (item: PromptCommand) => void;
  items: PromptCommand[];
  /** Shown when `items` is empty; defaults to a generic "no commands" line. */
  emptyLabel?: string;
}
