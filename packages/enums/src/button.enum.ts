export enum ButtonVariant {
  DEFAULT = 'default',
  SECONDARY = 'secondary',
  GHOST = 'ghost',
  DESTRUCTIVE = 'destructive',
  LINK = 'link',
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
  ICON = 'icon',
  PUBLIC = 'public',
}
