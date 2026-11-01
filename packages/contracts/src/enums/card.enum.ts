export enum CardVariant {
  DEFAULT = 'default',
  /** CSS `border-border` edge instead of the inset hairline. */
  BORDERED = 'bordered',
  /** Borderless recessed panel for a block that sits on a card or page. */
  INSET = 'inset',
}

/** Body padding of a `Card`. */
export enum CardPadding {
  /** Children own their spacing (media, tables, lists that bleed to the edge). */
  NONE = 'none',
  SM = 'sm',
  MD = 'md',
  LG = 'lg',
  XL = 'xl',
}

/** Space between the header, children and actions of a `Card`. */
export enum CardGap {
  NONE = 'none',
  SM = 'sm',
  MD = 'md',
  LG = 'lg',
}

export enum CardSize {
  DEFAULT = 'default',
  SM = 'sm',
  MD = 'md',
  LG = 'lg',
  PILL = 'pill',
}

export enum CardEmptySize {
  DEFAULT = 'default',
  SM = 'sm',
  LG = 'lg',
}

/** Accent rule on the leading edge of a `Card`, for a state-coloured section. */
export enum CardTone {
  SUCCESS = 'success',
  WARNING = 'warning',
  DESTRUCTIVE = 'destructive',
}
