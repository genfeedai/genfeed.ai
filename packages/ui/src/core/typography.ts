export type TypographyTokenName =
  | 'fontSans'
  | 'fontSerif'
  | 'fontSerifItalic'
  | 'fontSizeXs'
  | 'fontSizeSm'
  | 'fontSizeMd'
  | 'fontSizeLg'
  | 'fontSizeXl'
  | 'fontSizeXxl'
  | 'fontSizeXxxl'
  | 'fontSizeHero'
  | 'fontSizeH1'
  | 'fontSizeH2'
  | 'fontSizeH3';

export const typographyTokens = {
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSerif: "Georgia, 'Times New Roman', serif",
  fontSerifItalic: "Georgia, 'Times New Roman', serif",
  fontSizeH1: '26px',
  fontSizeH2: '24px',
  fontSizeH3: '20px',
  fontSizeHero: '28px',
  fontSizeLg: '14px',
  fontSizeMd: '13px',
  fontSizeSm: '12px',
  fontSizeXl: '15px',
  fontSizeXs: '11px',
  fontSizeXxl: '16px',
  fontSizeXxxl: '18px',
} as const satisfies Record<TypographyTokenName, string>;
