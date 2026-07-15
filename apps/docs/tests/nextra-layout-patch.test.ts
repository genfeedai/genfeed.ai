import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const themeDist = path.dirname(
  fileURLToPath(import.meta.resolve('nextra-theme-docs')),
);

function readThemeFile(fileName: string): string {
  return fs.readFileSync(path.join(themeDist, fileName), 'utf8');
}

describe('Nextra docs layout prerender patch', () => {
  it('validates the complete layout props object', () => {
    const layout = readThemeFile('layout.js');

    expect(layout).toContain('LayoutPropsSchema.safeParse(t0)');
    expect(layout).not.toContain('LayoutPropsSchema.safeParse(themeConfig)');
  });

  it('keeps validated children out of the theme config', () => {
    const layout = readThemeFile('layout.js');
    const schema = readThemeFile('schemas.js');
    const schemaTypes = readThemeFile('schemas.d.mts');

    expect(layout).toMatch(/banner,\s+children,\s+\.\.\.rest/);
    expect(schema).toContain('children: reactNode,');
    expect(schema).not.toContain('children: reactNode.optional()');
    expect(schemaTypes).toContain(
      'children: z.ZodCustom<react.ReactNode, react.ReactNode>',
    );
  });
});
