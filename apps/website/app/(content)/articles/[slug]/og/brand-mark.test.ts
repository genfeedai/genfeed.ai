// @vitest-environment node
// Reads files off disk, so it runs on the server side of the test config rather
// than under jsdom.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const MARK_COMPONENT = new URL('./brand-mark.tsx', import.meta.url);
const CANONICAL_LOGO = new URL(
  '../../../../../../app/public/logo.svg',
  import.meta.url,
);

describe('BrandMark', () => {
  it('takes fill from a prop so the dark card is not stuck with black', async () => {
    const component = await readFile(MARK_COMPONENT, 'utf8');

    expect(component).toContain('fill={fill}');
    expect(component).not.toContain('fill="#000000"');
  });
});
