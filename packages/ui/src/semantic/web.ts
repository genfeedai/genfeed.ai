/**
 * Tailwind v3 colour map for the extension surfaces
 * (apps/extensions/browser/app/tailwind.config.ts). Everything resolves through
 * the same CSS variables the v4 apps use, so a token change in
 * `packages/ui/src/core/*` reaches the extensions without a second edit.
 */
export const tailwindSemanticColors = {
  accent: {
    DEFAULT: 'hsl(var(--accent))',
    foreground: 'hsl(var(--accent-foreground))',
  },
  background: 'hsl(var(--background))',
  border: 'hsl(var(--border))',
  'border-strong': 'hsl(var(--border-strong))',
  card: {
    DEFAULT: 'hsl(var(--card))',
    foreground: 'hsl(var(--card-foreground))',
  },
  destructive: {
    DEFAULT: 'hsl(var(--destructive))',
    foreground: 'hsl(var(--destructive-foreground))',
  },
  foreground: 'hsl(var(--foreground))',
  /*
   * The neutral ladder. Step jobs, low to high: 100 raised fill · 200 hover ·
   * 300 active/selected · 400 border · 500 border-strong · 600 disabled text ·
   * 700 muted icon · 800 placeholder · 900 secondary text · 1000 primary text.
   * Nothing below 800 may carry words.
   */
  gray: {
    100: 'hsl(var(--gray-100))',
    200: 'hsl(var(--gray-200))',
    300: 'hsl(var(--gray-300))',
    400: 'hsl(var(--gray-400))',
    500: 'hsl(var(--gray-500))',
    600: 'hsl(var(--gray-600))',
    700: 'hsl(var(--gray-700))',
    800: 'hsl(var(--gray-800))',
    900: 'hsl(var(--gray-900))',
    1000: 'hsl(var(--gray-1000))',
  },
  /* Translucent twin: same step, same job, for use over media and gradients. */
  'gray-alpha': {
    100: 'var(--gray-alpha-100)',
    200: 'var(--gray-alpha-200)',
    300: 'var(--gray-alpha-300)',
    400: 'var(--gray-alpha-400)',
    500: 'var(--gray-alpha-500)',
    600: 'var(--gray-alpha-600)',
    700: 'var(--gray-alpha-700)',
    800: 'var(--gray-alpha-800)',
    900: 'var(--gray-alpha-900)',
    1000: 'var(--gray-alpha-1000)',
  },
  info: {
    DEFAULT: 'hsl(var(--info))',
    foreground: 'hsl(var(--info-foreground))',
  },
  input: 'hsl(var(--input))',
  muted: {
    DEFAULT: 'hsl(var(--muted))',
    foreground: 'hsl(var(--muted-foreground))',
  },
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  ring: 'hsl(var(--ring))',
  secondary: {
    DEFAULT: 'hsl(var(--secondary))',
    foreground: 'hsl(var(--secondary-foreground))',
  },
  success: {
    DEFAULT: 'hsl(var(--success))',
    foreground: 'hsl(var(--success-foreground))',
  },
  warning: {
    DEFAULT: 'hsl(var(--warning))',
    foreground: 'hsl(var(--warning-foreground))',
  },
} as const;
