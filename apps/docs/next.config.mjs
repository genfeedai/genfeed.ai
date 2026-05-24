import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextra from 'nextra';

const docsDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(docsDir, '../..');

const withNextra = nextra({
  contentDirBasePath: '/',
});

export default withNextra({
  reactStrictMode: true,
  turbopack: {
    root: monorepoRoot,
  },
});
