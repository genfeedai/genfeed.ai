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
  items: MenuItemSpec[];
  label?: string;
}

/** Size and shape of the host site's own button, so ours sits level with it. */
export interface ButtonSkin {
  height: number;
  radius: number;
}

export interface GenfeedGroupOptions {
  groups: MenuGroupSpec[];
  skin?: ButtonSkin;
}
