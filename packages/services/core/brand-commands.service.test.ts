import type { Brand } from '@genfeedai/models/organization/brand.model';
import { BrandCommandsService } from '@services/core/brand-commands.service';
import { describe, expect, it, vi } from 'vitest';

function makeBrand(id: string, label: string): Brand {
  return { id, label } as Brand;
}

describe('BrandCommandsService', () => {
  describe('generateBrandCommands', () => {
    it('returns empty array for empty brands list', () => {
      const result = BrandCommandsService.generateBrandCommands(
        [],
        'org-1',
        vi.fn(),
      );
      expect(result).toEqual([]);
    });

    it('returns empty array for falsy brands', () => {
      const result = BrandCommandsService.generateBrandCommands(
        null as unknown as Brand[],
        'org-1',
        vi.fn(),
      );
      expect(result).toEqual([]);
    });

    it('creates one command per brand', () => {
      const brands = [makeBrand('b1', 'Brand A'), makeBrand('b2', 'Brand B')];
      const result = BrandCommandsService.generateBrandCommands(
        brands,
        'b1',
        vi.fn(),
      );
      expect(result).toHaveLength(2);
    });

    it('generates correct command ids', () => {
      const brands = [makeBrand('abc', 'Test Brand')];
      const [cmd] = BrandCommandsService.generateBrandCommands(
        brands,
        'x',
        vi.fn(),
      );
      expect(cmd.id).toBe('switch-brand-abc');
    });

    it('marks current brand description as "Current brand"', () => {
      const brands = [makeBrand('active', 'Active Brand')];
      const [cmd] = BrandCommandsService.generateBrandCommands(
        brands,
        'active',
        vi.fn(),
      );
      expect(cmd.description).toBe('Current brand');
      expect(cmd.priority).toBe(10);
    });

    it('marks other brands description as "Switch brand"', () => {
      const brands = [makeBrand('other', 'Other Brand')];
      const [cmd] = BrandCommandsService.generateBrandCommands(
        brands,
        'current',
        vi.fn(),
      );
      expect(cmd.description).toBe('Switch brand');
      expect(cmd.priority).toBe(7);
    });

    it('calls onBrandSwitch when action is invoked for a different brand', async () => {
      const onSwitch = vi.fn();
      const brands = [makeBrand('target', 'Target Brand')];
      const [cmd] = BrandCommandsService.generateBrandCommands(
        brands,
        'other',
        onSwitch,
      );
      await cmd.action?.([]);
      expect(onSwitch).toHaveBeenCalledWith('target');
    });

    it('does not call onBrandSwitch when action is invoked for the current brand', async () => {
      const onSwitch = vi.fn();
      const brands = [makeBrand('active', 'Active Brand')];
      const [cmd] = BrandCommandsService.generateBrandCommands(
        brands,
        'active',
        onSwitch,
      );
      await cmd.action?.([]);
      expect(onSwitch).not.toHaveBeenCalled();
    });

    it('adds keyboard shortcut for first 9 brands', () => {
      const brands = Array.from({ length: 10 }, (_, i) =>
        makeBrand(`b${i}`, `Brand ${i}`),
      );
      const commands = BrandCommandsService.generateBrandCommands(
        brands,
        'none',
        vi.fn(),
      );
      expect(commands[0].shortcut).toEqual(['⌘', 'Shift', '1']);
      expect(commands[8].shortcut).toEqual(['⌘', 'Shift', '9']);
      expect(commands[9].shortcut).toBeUndefined();
    });

    it('includes correct keywords', () => {
      const brands = [makeBrand('b1', 'My Brand')];
      const [cmd] = BrandCommandsService.generateBrandCommands(
        brands,
        'x',
        vi.fn(),
      );
      expect(cmd.keywords).toContain('switch');
      expect(cmd.keywords).toContain('brand');
      expect(cmd.keywords).toContain('my brand');
    });
  });

  describe('getBrandCommandPrefix', () => {
    it('returns the expected prefix string', () => {
      expect(BrandCommandsService.getBrandCommandPrefix()).toBe(
        'switch-brand-',
      );
    });
  });

  describe('isBrandCommand', () => {
    it('returns true for a brand command id', () => {
      expect(BrandCommandsService.isBrandCommand('switch-brand-abc')).toBe(
        true,
      );
    });

    it('returns false for an unrelated command id', () => {
      expect(BrandCommandsService.isBrandCommand('nav-overview')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(BrandCommandsService.isBrandCommand('')).toBe(false);
    });
  });

  describe('extractBrandId', () => {
    it('extracts brand id from a valid brand command id', () => {
      expect(BrandCommandsService.extractBrandId('switch-brand-org_123')).toBe(
        'org_123',
      );
    });

    it('returns null for a non-brand command id', () => {
      expect(BrandCommandsService.extractBrandId('nav-overview')).toBeNull();
    });
  });
});
