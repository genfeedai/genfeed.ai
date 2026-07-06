import { describe, expect, it } from 'vitest';
import {
  getLifecycleBadgeClass,
  getStatusBorderColor,
  getStatusColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';

describe('getStatusIcon', () => {
  it('completed', () => expect(getStatusIcon('completed')).toBe('✅'));
  it('failed', () => expect(getStatusIcon('failed')).toBe('❌'));
  it('running', () => expect(getStatusIcon('running')).toBe('⏳'));
  it('cancelled', () => expect(getStatusIcon('cancelled')).toBe('🚫'));
  it('skipped', () => expect(getStatusIcon('skipped')).toBe('⏭️'));
  it('default', () => expect(getStatusIcon('pending')).toBe('⏸️'));
});

describe('getStatusColor', () => {
  it('completed', () =>
    expect(getStatusColor('completed')).toContain('text-success'));
  it('failed', () =>
    expect(getStatusColor('failed')).toContain('text-destructive'));
  it('running', () =>
    expect(getStatusColor('running')).toContain('text-warning'));
  it('cancelled', () =>
    expect(getStatusColor('cancelled')).toContain('text-muted-foreground'));
  it('skipped', () =>
    expect(getStatusColor('skipped')).toContain('border-border'));
  it('default', () => expect(getStatusColor('pending')).toContain('muted'));
});

describe('getStatusBorderColor', () => {
  it('completed', () =>
    expect(getStatusBorderColor('completed')).toContain('border-success'));
  it('failed', () =>
    expect(getStatusBorderColor('failed')).toContain('border-destructive'));
  it('running', () =>
    expect(getStatusBorderColor('running')).toContain('border-warning'));
  it('skipped', () =>
    expect(getStatusBorderColor('skipped')).toContain('border-border'));
  it('default', () =>
    expect(getStatusBorderColor('pending')).toContain('border'));
});

describe('getLifecycleBadgeClass', () => {
  it('published', () =>
    expect(getLifecycleBadgeClass('published')).toContain('success'));
  it('archived', () =>
    expect(getLifecycleBadgeClass('archived')).toContain('white'));
  it('draft/default', () =>
    expect(getLifecycleBadgeClass('draft')).toContain('warning'));
  it('undefined', () =>
    expect(getLifecycleBadgeClass(undefined)).toContain('warning'));
});
