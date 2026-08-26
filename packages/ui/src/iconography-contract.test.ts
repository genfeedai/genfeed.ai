import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_ROOT = import.meta.dirname;
const REPO_ROOT = join(UI_ROOT, '../../..');

function readUiSource(relativePath: string): string {
  return readFileSync(join(UI_ROOT, relativePath), 'utf8');
}

describe('value-swap iconography contract', () => {
  it.each([
    'components/menus/organization-switcher/OrganizationSwitcher.tsx',
    'components/menus/switchers/MenuBrandSwitcher.tsx',
    'components/shell/app-switcher/AppSwitcher.tsx',
  ])('uses ChevronsUpDown on %s', (relativePath) => {
    const source = readUiSource(relativePath);

    expect(source).toContain('ChevronsUpDown');
    expect(source).not.toContain('ChevronDown');
  });

  it('uses the value-swap glyph on Select while keeping directional scroll glyphs', () => {
    const source = readUiSource('primitives/select.tsx');

    expect(source).toContain('<ChevronsUpDown');
    expect(source).toContain('<ChevronUp');
    expect(source).toContain('<ChevronDown');
  });

  it('uses one stable value-swap glyph on the model picker', () => {
    const source = readUiSource(
      'components/dropdowns/model-selector/ModelSelectorTrigger.tsx',
    );

    expect(source).toContain('ChevronsUpDown');
    expect(source).not.toContain('ChevronIcon');
    expect(source).not.toContain('ChevronDown');
    expect(source).not.toContain('ChevronUp');
  });

  it('uses the value-swap glyph on the multi-select trigger', () => {
    const source = readUiSource(
      'components/dropdowns/multiselect/DropdownMultiSelect.tsx',
    );

    expect(source).toContain('ChevronsUpDown');
    expect(source).not.toContain('ChevronDown');
  });

  it('documents the one-question value-swap rule and labeled status contract', () => {
    const design = readFileSync(join(REPO_ROOT, 'DESIGN.md'), 'utf8');

    expect(design).toContain("does the trigger's own");
    expect(design).toContain('ChevronsUpDown');
    expect(design).toContain(
      'status-specific icon alongside its visible label',
    );
  });
});
