import { describe, expect, it } from 'vitest';
import {
  mostRestrictiveMcpAccessMode,
  parseMcpAccessMode,
} from './access-mode';

describe('access modes', () => {
  it('fails closed to the Claude connector for anything unrecognised', () => {
    expect(parseMcpAccessMode(undefined)).toBe('standard');
    expect(parseMcpAccessMode('standard')).toBe('standard');
    expect(parseMcpAccessMode('admin')).toBe('admin');
    expect(parseMcpAccessMode(null)).toBe('claude');
    expect(parseMcpAccessMode('')).toBe('claude');
    expect(parseMcpAccessMode('full')).toBe('claude');
    expect(parseMcpAccessMode({})).toBe('claude');
    expect(parseMcpAccessMode('claude')).toBe('claude');
  });

  it('keeps the narrowest mode a request carries', () => {
    expect(mostRestrictiveMcpAccessMode('standard', 'claude')).toBe('claude');
    expect(mostRestrictiveMcpAccessMode('claude', 'standard')).toBe('claude');
    expect(mostRestrictiveMcpAccessMode('admin', 'claude')).toBe('claude');
    expect(mostRestrictiveMcpAccessMode(undefined)).toBe('standard');
  });

  it('grants admin only when every given mode is admin', () => {
    expect(mostRestrictiveMcpAccessMode('admin', 'admin')).toBe('admin');
    expect(mostRestrictiveMcpAccessMode(undefined, 'admin')).toBe('admin');
    expect(mostRestrictiveMcpAccessMode('admin', 'standard')).toBe('standard');
    expect(mostRestrictiveMcpAccessMode('standard', 'admin')).toBe('standard');
  });
});
