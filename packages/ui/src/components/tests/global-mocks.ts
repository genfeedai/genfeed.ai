import { vi } from 'vitest';

// Utility mock used by many components via @genfeedai/helpers/formatting/cn/cn.util
const cn = vi.fn((...classes: unknown[]) => classes.filter(Boolean).join(' '));

vi.mock('@genfeedai/helpers/formatting/cn/cn.util', () => ({
  FLOATING_PANEL_SURFACE:
    'rounded-lg shadow-dropdown bg-popover/80 backdrop-blur-xl supports-[backdrop-filter]:bg-popover/70',
  cn,
}));

export { cn };
