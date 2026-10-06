const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwindcss = require('@tailwindcss/postcss');

const repoRoot = path.resolve(__dirname, '../../..');
const entry = path.join(__dirname, 'src/ui/preview-client.tsx');
const style = path.join(__dirname, 'src/ui/preview.css');
const paths = {
  '@ui/*': ['packages/ui/src/*', 'packages/ui/src/components/*'],
  '@genfeedai/services/*': ['packages/services/*'],
  '@genfeedai/props/*': ['packages/props/*'],
  '@genfeedai/utils/*': ['packages/utils/*'],
};
for (const name of fs.readdirSync(path.join(repoRoot, 'packages'))) {
  const source = `packages/${name}/src`;
  if (!fs.existsSync(path.join(repoRoot, source))) continue;
  paths[`@genfeedai/${name}`] = [`${source}/index.ts`];
  paths[`@genfeedai/${name}/*`] = [`${source}/*`];
}

/** Both Nest/webpack and Vitest consume the identical self-contained browser build. */
async function buildMcpPreview(
  addDependency = () => {},
  addContextDependency = () => {},
) {
  const [bundle, stylesheet] = await Promise.all([
    esbuild.build({
      entryPoints: [entry],
      absWorkingDir: repoRoot,
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'GenfeedPreview',
      platform: 'browser',
      conditions: ['browser'],
      target: 'es2022',
      jsx: 'automatic',
      minify: true,
      metafile: true,
      define: {
        'process.env.NODE_ENV': '"production"',
        'process.env': '{}',
        global: 'globalThis',
      },
      tsconfigRaw: { compilerOptions: { baseUrl: repoRoot, paths } },
      logLevel: 'silent',
    }),
    postcss([
      tailwindcss({ base: repoRoot, optimize: { minify: true } }),
    ]).process(fs.readFileSync(style, 'utf8'), { from: style }),
  ]);
  for (const input of Object.keys(bundle.metafile.inputs))
    addDependency(path.resolve(repoRoot, input));
  for (const message of stylesheet.messages) {
    if (message.type === 'dependency') addDependency(message.file);
    if (message.type === 'dir-dependency' && message.dir)
      addContextDependency(message.dir);
  }
  addDependency(style);
  return { script: bundle.outputFiles[0].text, css: stylesheet.css };
}

module.exports = { buildMcpPreview };
