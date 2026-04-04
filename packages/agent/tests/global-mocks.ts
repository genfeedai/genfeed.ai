import { vi } from 'vitest';

// Utility mock used by many components via @helpers/formatting/cn/cn.util
const cn = vi.fn((...classes: unknown[]) => classes.filter(Boolean).join(' '));

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  BG_BLUR: '!bg-black/90 backdrop-blur-sm',
  BORDER_WHITE_30: 'border border-white/[0.08] shadow-2xl',
  cn,
}));

export { cn };
