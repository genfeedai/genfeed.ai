import { vi } from 'vitest';

// Utility mock used by many components via @genfeedai/helpers/formatting/cn/cn.util
const cn = vi.fn((...classes: unknown[]) => classes.filter(Boolean).join(' '));

vi.mock('@genfeedai/helpers/formatting/cn/cn.util', () => ({
  BG_BLUR: '!bg-black/90 backdrop-blur-sm',
  BORDER_WHITE_30: 'rounded-lg shadow-dropdown',
  cn,
}));

export { cn };
