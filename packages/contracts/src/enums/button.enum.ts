export enum ButtonVariant {
  DEFAULT = 'default',
  SECONDARY = 'secondary',
  GHOST = 'ghost',
  DESTRUCTIVE = 'destructive',
  LINK = 'link',
  /** Dark translucent control that sits on top of media (a thumbnail, a canvas preview). */
  OVERLAY = 'overlay',
  /** Escape hatch for internal composite controls that own their entire visual contract. */
  UNSTYLED = 'unstyled',
}

export enum ButtonSize {
  DEFAULT = 'default',
  SM = 'sm',
  LG = 'lg',
  XS = 'xs',
  /** 28px icon-only control for genuinely dense chrome. */
  MICRO = 'micro',
  /** No box of its own: sized by its content, for a control that reads as text in a line. */
  INLINE = 'inline',
  ICON = 'icon',
  PUBLIC = 'public',
}
