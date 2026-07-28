export enum ButtonVariant {
  DEFAULT = 'default',
  SECONDARY = 'secondary',
  GHOST = 'ghost',
  DESTRUCTIVE = 'destructive',
  LINK = 'link',
  /** Escape hatch for internal composite controls that own their entire visual contract. */
  UNSTYLED = 'unstyled',
  /** @deprecated Use SECONDARY. Retained for public API compatibility. */
  OUTLINE = 'outline',
  /** @deprecated Use SECONDARY. Retained for public API compatibility. */
  OUTLINE_WHITE = 'outline-white',
  /** @deprecated Use SECONDARY. Retained for public API compatibility. */
  SOFT = 'soft',
  /** @deprecated Use DEFAULT. Retained for public API compatibility. */
  WHITE = 'white',
  /** @deprecated Use DEFAULT. Retained for public API compatibility. */
  BLACK = 'black',
  /** @deprecated Use DEFAULT. Retained for public API compatibility. */
  GENERATE = 'generate',
}

export enum ButtonSize {
  DEFAULT = 'default',
  SM = 'sm',
  LG = 'lg',
  XS = 'xs',
  ICON = 'icon',
  PUBLIC = 'public',
}
