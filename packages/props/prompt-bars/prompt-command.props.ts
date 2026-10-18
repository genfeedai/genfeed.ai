/**
 * One entry in the `/` command palette shared by the Agent and Studio composers.
 *
 * `action` navigates or runs a composer action, `prompt` seeds the editor with
 * a prefix, `skill` invokes a catalog skill against the current turn, and
 * `preset` applies a generation preset the page registered for itself.
 */
export type PromptCommandKind = 'action' | 'preset' | 'prompt' | 'skill';

export interface PromptCommand {
  description: string;
  kind: PromptCommandKind;
  label: string;
  /** Unique within a palette; also the text typed after `/`. */
  name: string;
  /** Composer action to dispatch when `kind` is `action`. */
  actionName?: string;
  /** Section heading; consecutive commands with the same group share one. */
  group?: string;
  /** Icon key; falls back to a generic glyph when the palette has no match. */
  iconKey?: string;
  /** Text inserted into the editor when `kind` is `prompt`. */
  promptPrefix?: string;
  /** Catalog slug invoked when `kind` is `skill`. */
  skillSlug?: string;
}

/**
 * Commands a page adds to the palette for what it has loaded (presets, saved
 * looks), ahead of the catalog. `onSelect` applies a `preset` command; the
 * typed `/query` is already removed and `promptText` is what remains.
 */
export interface PromptCommandContext {
  commands: readonly PromptCommand[];
  onSelect: (command: PromptCommand, promptText: string) => void;
}

export interface PromptCommandListProps {
  command: (item: PromptCommand) => void;
  items: PromptCommand[];
  /** Shown when `items` is empty; defaults to a generic "no commands" line. */
  emptyLabel?: string;
}
