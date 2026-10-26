// Shapes for the Genfeed button group and its menu injected into host pages

export type MenuItemStatus = 'busy' | 'done' | 'error';

/** What a menu action can do to its own row while it runs. */
export interface MenuItemControls {
  /** Puts the row back to its label and icon. */
  reset: () => void;
  /** Shows progress or an outcome in the row. Done and error clear themselves. */
  setStatus: (status: MenuItemStatus, label: string) => void;
}

export interface MenuItemSpec {
  ariaLabel?: string;
  hint?: string;
  /** Static SVG markup from `~platforms/ui/icons`. */
  icon: string;
  id: string;
  /** Checked each time the menu opens; the row is left out when it is false. */
  isAvailable?: () => boolean;
  label: string;
  run: (controls: MenuItemControls) => Promise<void> | void;
}

export interface MenuGroupSpec {
  id: string;
  /** Shows the group as one row that expands to its items, collapsed until it is opened. Needs a label. */
  isCollapsible?: boolean;
  items: MenuItemSpec[];
  label?: string;
}

/**
 * Size, shape and colour of the host site's own button, so ours sits level with
 * it and looks native. `background` and `color` are absent when the host button
 * has no solid fill, and the trigger falls back to the Genfeed theme.
 */
export interface ButtonSkin {
  /** The trigger sits among the host's icon buttons: round, no fill, in their colour. */
  isIcon?: boolean;
  height: number;
  radius: number;
  background?: string;
  color?: string;
}

export interface GenfeedGroupOptions {
  groups: MenuGroupSpec[];
  skin?: ButtonSkin;
}
