import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tailwind theme selector contract', () => {
  it('scans only browser application and shared UI sources', () => {
    const shared = readFileSync(
      join(process.cwd(), '../../packages/styles/globals.css'),
      'utf8',
    );
    const appEntry = readFileSync(
      join(process.cwd(), 'app/styles.css'),
      'utf8',
    );

    expect(shared).toContain('@import "tailwindcss" source(none);');
    expect(shared).not.toContain('@source "../../apps/app";');
    expect(shared).not.toContain('@source "../../apps/website";');
    expect(shared).not.toContain('@source "../../apps/server";');
    expect(appEntry).toContain('@source "../src";');
    expect(appEntry).toContain('@source "../../../packages/ui";');
    expect(appEntry).toContain('@source not "../../../**/.next/**";');
    expect(appEntry).not.toContain('apps/website');
    expect(appEntry).not.toContain('apps/server');
  });

  it('stills every element except the page menu and progress indicators', () => {
    const appEntry = readFileSync(
      join(process.cwd(), 'app/styles.css'),
      'utf8',
    );
    const policy = readFileSync(
      join(process.cwd(), '../../packages/styles/motion-policy.css'),
      'utf8',
    );
    const rail = readFileSync(
      join(
        process.cwd(),
        '../../packages/ui/src/components/shell/app-rail/AppRail.tsx',
      ),
      'utf8',
    );
    const sidebar = readFileSync(
      join(
        process.cwd(),
        '../../packages/ui/src/components/layouts/app/DesktopSidebar.tsx',
      ),
      'utf8',
    );

    expect(appEntry).toContain(
      '@import "../../../packages/styles/motion-policy.css";',
    );
    expect(policy).toContain('[data-motion="allow"] *');
    expect(policy).toContain('[class*="genfeed-loader"]');
    expect(policy).toContain('transition-duration: 0.01ms !important;');
    expect(policy).toContain('animation-duration: 0.01ms !important;');
    expect(rail).toContain('data-motion="allow"');
    expect(sidebar).toContain('data-motion="allow"');
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
