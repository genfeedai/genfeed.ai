import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tailwind theme selector contract', () => {
  it('scans only browser application and shared UI sources', () => {
    const source = readFileSync(
      join(process.cwd(), '../../packages/styles/globals.css'),
      'utf8',
    );

    expect(source).toContain('@import "tailwindcss" source(none);');
    expect(source).toContain('@source "../../apps/app/app";');
    expect(source).toContain('@source "../../apps/app/src";');
    expect(source).toContain('@source "../../apps/app/packages";');
    expect(source).toContain('@source "../../apps/website/app";');
    expect(source).toContain('@source "../../apps/website/packages";');
    expect(source).toContain('@source not "../../**/.next/**";');
    expect(source).not.toContain('@source "../../apps/app";');
    expect(source).not.toContain('@source "../../apps/website";');
    expect(source).not.toContain('@source "../../apps/server";');
  });

  it('binds dark variants to the data-theme attribute used by next-themes', () => {
    const source = readFileSync(
      join(process.cwd(), '../../packages/styles/globals.css'),
      'utf8',
    );

    expect(source).toContain(
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
    );
  });

  it('keeps opt-in opacity and transform transitions available on buttons', () => {
    const source = readFileSync(
      join(process.cwd(), '../../packages/styles/globals.css'),
      'utf8',
    );

    const buttonRule = source.match(/\.btn,\s*button\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body;

    expect(buttonRule).toContain('opacity');
    expect(buttonRule).toContain('transform');
    expect(buttonRule).not.toContain('transition-property: all');
  });
});
