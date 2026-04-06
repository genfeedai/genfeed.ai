import {
  getLifecycleBadgeClass,
  getStatusBorderColor,
  getStatusColor,
  getStatusIcon,
} from '@workflow-cloud/utils/status-helpers';
import { describe, expect, it } from 'vitest';

describe('getStatusIcon', () => {
  it('completed', () => expect(getStatusIcon('completed')).toBe('✅'));
  it('failed', () => expect(getStatusIcon('failed')).toBe('❌'));
  it('running', () => expect(getStatusIcon('running')).toBe('⏳'));
  it('cancelled', () => expect(getStatusIcon('cancelled')).toBe('🚫'));
  it('skipped', () => expect(getStatusIcon('skipped')).toBe('⏭️'));
  it('default', () => expect(getStatusIcon('pending')).toBe('⏸️'));
});

describe('getStatusColor', () => {
  it('completed', () => expect(getStatusColor('completed')).toContain('green'));
  it('failed', () => expect(getStatusColor('failed')).toContain('red'));
  it('running', () => expect(getStatusColor('running')).toContain('yellow'));
  it('cancelled', () => expect(getStatusColor('cancelled')).toContain('gray'));
  it('skipped', () => expect(getStatusColor('skipped')).toContain('gray'));
  it('default', () => expect(getStatusColor('pending')).toContain('muted'));
});

describe('getStatusBorderColor', () => {
  it('completed', () =>
    expect(getStatusBorderColor('completed')).toContain('green'));
  it('failed', () => expect(getStatusBorderColor('failed')).toContain('red'));
  it('running', () =>
    expect(getStatusBorderColor('running')).toContain('yellow'));
  it('skipped', () =>
    expect(getStatusBorderColor('skipped')).toContain('gray'));
  it('default', () =>
    expect(getStatusBorderColor('pending')).toContain('border'));
});

describe('getLifecycleBadgeClass', () => {
  it('published', () =>
    expect(getLifecycleBadgeClass('published')).toContain('emerald'));
  it('archived', () =>
    expect(getLifecycleBadgeClass('archived')).toContain('white'));
  it('draft/default', () =>
    expect(getLifecycleBadgeClass('draft')).toContain('amber'));
  it('undefined', () =>
    expect(getLifecycleBadgeClass(undefined)).toContain('amber'));
});
