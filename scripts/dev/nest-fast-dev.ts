/**
 * Fast Nest dev runner: esbuild bundle + SWC (decorator metadata).
 *
 * Why not `nest start --watch` (webpack)?
 * - Webpack already uses swc-loader for transpile; the cost is the full module graph
 *   rebuild (~40MB api main.js) which pegs CPU and gets OOM-killed under memory pressure.
 * - Nest's native SWC builder does not bundle monorepo `@genfeedai/*` ESM packages into
 *   CJS, and our tsconfig rootDir spans the monorepo — so plain SWC OOMs or fails at runtime.
 *
 * This runner keeps the same runtime shape webpack produces (single CJS main.js + externals
 * for real node_modules) but rebuilds in ~100ms–2s instead of multi-second webpack spikes.
 *
 * Production / CI still uses `nest build` (webpack) via existing package scripts.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as swc from '@swc/core';
import * as dotenv from 'dotenv';
import * as esbuild from 'esbuild';

const WORKSPACE_ROOT = path.resolve(import.meta.dir, '../..');
const SERVER_ROOT = path.join(WORKSPACE_ROOT, 'apps/server');
const PACKAGES_ROOT = path.join(WORKSPACE_ROOT, 'packages');

interface NestFastDevApp {
  /** nest project name / dist folder under apps/server/dist/apps */
  name: string;
  /** absolute path to app directory (e.g. apps/server/api) */
  appDir: string;
  /** entry relative to appDir */
  entry?: string;
  /** extra watch roots for restart-on-change outside the bundle graph */
  extraWatch?: string[];
}

const APPS: Record<string, NestFastDevApp> = {
  api: {
    appDir: path.join(SERVER_ROOT, 'api'),
    entry: 'src/main.ts',
    extraWatch: [path.join(SERVER_ROOT, 'api/config')],
    name: 'api',
  },
  notifications: {
    appDir: path.join(SERVER_ROOT, 'notifications'),
    entry: 'src/main.ts',
    name: 'notifications',
  },
  files: {
    appDir: path.join(SERVER_ROOT, 'files'),
    entry: 'src/main.ts',
    name: 'files',
  },
  mcp: {
    appDir: path.join(SERVER_ROOT, 'mcp'),
    entry: 'src/main.ts',
    name: 'mcp',
  },
  workers: {
    appDir: path.join(SERVER_ROOT, 'workers'),
    entry: 'src/main.ts',
    name: 'workers',
  },
};

function fail(message: string): never {
  console.error(`[nest-fast-dev] ${message}`);
  process.exit(1);
}

function buildWorkspaceSourceAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const entry of fs.readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgSrc = path.join(PACKAGES_ROOT, entry.name, 'src');
    if (!fs.existsSync(pkgSrc)) continue;
    aliases[`@genfeedai/${entry.name}`] = pkgSrc;
  }

  for (const entry of fs.readdirSync(SERVER_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appSrc = path.join(SERVER_ROOT, entry.name, 'src');
    if (!fs.existsSync(appSrc)) continue;
    aliases[`@${entry.name}`] = appSrc;
  }

  aliases['@config'] = path.join(PACKAGES_ROOT, 'config/src');
  aliases['@helpers'] = path.join(PACKAGES_ROOT, 'helpers/src');
  aliases['@libs'] = path.join(PACKAGES_ROOT, 'libs');
  aliases['@serializers'] = path.join(PACKAGES_ROOT, 'serializers/src');
  aliases['@api-types'] = path.join(PACKAGES_ROOT, 'api-types/src');
  aliases['@genfeedai-types'] = path.join(PACKAGES_ROOT, 'types/src');
  aliases['@workflow-engine'] = path.join(PACKAGES_ROOT, 'workflow-engine/src');
  aliases['@workflow-saas'] = path.join(PACKAGES_ROOT, 'workflow-saas/src');
  aliases['@api-root'] = path.join(SERVER_ROOT, 'api');

  return aliases;
}

function isWorkspacePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/packages/') || normalized.includes('/apps/server/')
  );
}

function shouldBundleImport(id: string): boolean {
  if (id.startsWith('.') || path.isAbsolute(id)) return true;
  if (id.startsWith('@genfeedai/')) return true;
  if (id.startsWith('@api')) return true;
  if (id.startsWith('@libs/')) return true;
  if (id.startsWith('@helpers/')) return true;
  if (id.startsWith('@config/')) return true;
  if (id.startsWith('@serializers/')) return true;
  if (id.startsWith('@api-types')) return true;
  if (id.startsWith('@genfeedai-types')) return true;
  if (id.startsWith('@workflow-')) return true;
  if (id.startsWith('@files/')) return true;
  if (id.startsWith('@workers/')) return true;
  if (id.startsWith('@notifications/')) return true;
  if (id.startsWith('@mcp/')) return true;
  return false;
}

function createSwcPlugin(): esbuild.Plugin {
  return {
    name: 'swc-nest-decorators',
    setup(build) {
      build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
        if (args.path.includes(`${path.sep}node_modules${path.sep}`)) {
          if (!isWorkspacePath(args.path)) {
            return null;
          }
        }

        const source = await fs.promises.readFile(args.path, 'utf8');
        const isTsx = args.path.endsWith('.tsx');
        const result = await swc.transform(source, {
          filename: args.path,
          jsc: {
            externalHelpers: false,
            keepClassNames: true,
            loose: false,
            parser: {
              decorators: true,
              dynamicImport: true,
              syntax: 'typescript',
              tsx: isTsx,
            },
            target: 'es2022',
            transform: {
              decoratorMetadata: true,
              legacyDecorator: true,
              useDefineForClassFields: false,
            },
          },
          module: {
            type: 'es6',
          },
          sourceMaps: 'inline',
          swcrc: false,
        });

        // CJS bundle has no import.meta; point at the bundle file (same as webpack
        // single-file output). Path-sensitive loaders also fall back to cwd/dist.
        const code = result.code.replaceAll(
          'import.meta.url',
          '(typeof document === "undefined" ? require("node:url").pathToFileURL(__filename).href : document.baseURI)',
        );

        return {
          contents: code,
          loader: 'js',
          resolveDir: path.dirname(args.path),
        };
      });
    },
  };
}

function buildRuntimeEnv(app: NestFastDevApp): NodeJS.ProcessEnv {
  const runtimeEnv = { ...process.env };
  const nodeEnv = process.env.NODE_ENV;
  const envFiles =
    nodeEnv === 'production' || nodeEnv === 'staging' || nodeEnv === 'test'
      ? [
          path.join(app.appDir, `.env.${nodeEnv}`),
          path.join(WORKSPACE_ROOT, `.env.${nodeEnv}`),
        ]
      : [
          path.join(app.appDir, '.env.local'),
          path.join(app.appDir, '.env'),
          path.join(WORKSPACE_ROOT, '.env.local'),
          path.join(WORKSPACE_ROOT, '.env'),
        ];

  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    dotenv.config({ path: envFile, processEnv: runtimeEnv, quiet: true });
  }

  return runtimeEnv;
}

async function runApp(appName: string, once: boolean): Promise<void> {
  const app = APPS[appName];
  if (!app) {
    fail(
      `Unknown app "${appName}". Supported: ${Object.keys(APPS).join(', ')}`,
    );
  }

  const entry = path.join(app.appDir, app.entry ?? 'src/main.ts');
  if (!fs.existsSync(entry)) {
    fail(`Entry not found: ${entry}`);
  }

  const outDir = path.join(SERVER_ROOT, 'dist/apps', app.name);
  const outfile = path.join(outDir, 'main.js');
  fs.mkdirSync(outDir, { recursive: true });

  const aliases = buildWorkspaceSourceAliases();
  // App-local @api style alias (api only uses @api/* extensively)
  if (app.name === 'api') {
    aliases['@api'] = path.join(app.appDir, 'src');
  }
  aliases[`@${app.name}`] = path.join(app.appDir, 'src');

  let child: ChildProcess | null = null;
  let restarting = false;

  const stopChild = async (): Promise<void> => {
    if (!child || child.killed) return;
    const current = child;
    child = null;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        current.kill('SIGKILL');
        resolve();
      }, 3000);
      current.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      current.kill('SIGTERM');
    });
  };

  const startChild = (): void => {
    // Always run the CJS bundle with Node — Bun's package resolver breaks
    // webpack-style external requires from the dist path.
    const nodeBin = process.env.NEST_FAST_DEV_NODE || 'node';
    const nodeOptions = [
      process.env.NODE_OPTIONS,
      '--enable-source-maps',
      `--max-old-space-size=${app.name === 'api' ? '4096' : '2048'}`,
    ]
      .filter(Boolean)
      .join(' ');

    const bunNested = fs
      .readdirSync(path.join(WORKSPACE_ROOT, 'node_modules/.bun'), {
        withFileTypes: true,
      })
      .filter((d) => d.isDirectory())
      .map((d) =>
        path.join(WORKSPACE_ROOT, 'node_modules/.bun', d.name, 'node_modules'),
      )
      .filter((p) => fs.existsSync(p));
    const nodePath = [
      path.join(WORKSPACE_ROOT, 'node_modules'),
      path.join(WORKSPACE_ROOT, 'node_modules/.bun/node_modules'),
      // Prefer packages that are only nested under their install folder
      ...bunNested.slice(0, 500),
      process.env.NODE_PATH,
    ]
      .filter(Boolean)
      .join(path.delimiter);

    child = spawn(nodeBin, [outfile], {
      cwd: WORKSPACE_ROOT,
      env: {
        ...buildRuntimeEnv(app),
        NODE_ENV: process.env.NODE_ENV || 'development',
        NODE_OPTIONS: nodeOptions,
        NODE_PATH: nodePath,
      },
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (restarting) return;
      if (signal) {
        console.error(
          `[nest-fast-dev:${app.name}] process exited via ${signal}`,
        );
      } else if (code && code !== 0) {
        console.error(
          `[nest-fast-dev:${app.name}] process exited with code ${code}`,
        );
      }
    });
  };

  const plugin = createSwcPlugin();

  const bunNodeModules = path.join(
    WORKSPACE_ROOT,
    'node_modules/.bun/node_modules',
  );

  // First successful rebuild is the initial boot (`rebuildAndRun`). Later
  // watch rebuilds must restart the Node child or DTO/controller edits never
  // load into the running process (esbuild only rewrites the outfile).
  let hasStartedOnce = false;

  const context = await esbuild.context({
    absWorkingDir: WORKSPACE_ROOT,
    alias: aliases,
    banner: {
      js: '// generated by scripts/dev/nest-fast-dev.ts (esbuild + swc)',
    },
    bundle: true,
    entryPoints: [entry],
    // Bundle workspace sources only; leave real npm packages external (avoids
    // ESM/CJS default-import breakage like p-limit when re-bundled).
    packages: 'external',
    format: 'cjs',
    keepNames: true,
    logLevel: 'info',
    // Let esbuild resolve nested Bun installs the same way webpack does.
    nodePaths: [
      path.join(WORKSPACE_ROOT, 'node_modules'),
      bunNodeModules,
    ].filter((p) => fs.existsSync(p)),
    outfile,
    platform: 'node',
    plugins: [
      plugin,
      {
        name: 'bundle-workspace-only',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (shouldBundleImport(args.path)) {
              return null;
            }
            if (args.path.startsWith('.') || path.isAbsolute(args.path)) {
              return null;
            }
            // Force npm packages external even if packages:'external' misses one
            return { external: true, path: args.path };
          });
        },
      },
      {
        name: 'restart-node-on-rebuild',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              return;
            }
            if (!hasStartedOnce || once) {
              return;
            }
            void (async () => {
              try {
                patchEsmInterop();
                console.log(
                  `[nest-fast-dev:${app.name}] rebuild ok — restarting process`,
                );
                restarting = true;
                await stopChild();
                restarting = false;
                startChild();
              } catch (error) {
                restarting = false;
                console.error(
                  `[nest-fast-dev:${app.name}] watch restart failed`,
                  error,
                );
              }
            })();
          });
        },
      },
    ],
    sourcemap: 'linked',
    target: 'node20',
    treeShaking: true,
  });

  const patchEsmInterop = (): void => {
    // esbuild's __toESM(..., isNodeMode=1) sets `.default = mod` even when
    // Node already synthesized `{ __esModule: true, default: fn }` for pure-ESM
    // packages (p-limit, etc.). Prefer the real default export when present.
    if (!fs.existsSync(outfile)) return;
    let code = fs.readFileSync(outfile, 'utf8');
    const broken =
      'var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(\n  // If the importer is in node compatibility mode or this is not an ESM\n  // file that has been converted to a CommonJS file using a Babel-\n  // compatible transform (i.e. "__esModule" has not been set), then set\n  // "default" to the CommonJS "module.exports" for node compatibility.\n  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,\n  mod\n));';
    const fixed = `var __toESM = (mod, isNodeMode, target) => {
  if (mod && mod.__esModule) return mod;
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  return __copyProps(__defProp(target, "default", { value: mod, enumerable: true }), mod);
};`;
    if (code.includes(broken)) {
      code = code.replace(broken, fixed);
      fs.writeFileSync(outfile, code);
      return;
    }
    // Fallback: looser match if esbuild whitespace changes
    code = code.replace(
      /var __toESM = \(mod, isNodeMode, target\) => \([\s\S]*?mod\n\)\);/,
      fixed,
    );
    fs.writeFileSync(outfile, code);
  };

  const rebuildAndRun = async (reason: string): Promise<void> => {
    const started = Date.now();
    try {
      await context.rebuild();
      patchEsmInterop();
      const ms = Date.now() - started;
      console.log(
        `[nest-fast-dev:${app.name}] bundle ok in ${ms}ms (${reason}) → ${path.relative(WORKSPACE_ROOT, outfile)}`,
      );
      if (once) {
        return;
      }
      restarting = true;
      await stopChild();
      restarting = false;
      startChild();
    } catch (error) {
      restarting = false;
      console.error(`[nest-fast-dev:${app.name}] bundle failed`, error);
      if (once) {
        throw error;
      }
    }
  };

  // Initial bundle + process start. Watch rebuilds restart via the
  // `restart-node-on-rebuild` plugin (hasStartedOnce gates the first onEnd).
  await rebuildAndRun('initial');
  hasStartedOnce = true;

  if (once) {
    await context.dispose();
    console.log(`[nest-fast-dev:${app.name}] --once complete`);
    return;
  }

  await context.watch();
  console.log(
    `[nest-fast-dev:${app.name}] watching — outfile ${path.relative(WORKSPACE_ROOT, outfile)}`,
  );

  const shutdown = async (): Promise<void> => {
    restarting = true;
    await stopChild();
    await context.dispose();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  // Keep alive
  await new Promise(() => undefined);
}

function main(): void {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const appName = args.find((a) => !a.startsWith('--'));
  if (!appName) {
    fail(
      `Usage: bun run scripts/dev/nest-fast-dev.ts <${Object.keys(APPS).join('|')}> [--once]`,
    );
  }
  void runApp(appName, once).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

const isMain =
  typeof import.meta.main === 'boolean'
    ? import.meta.main
    : process.argv[1]?.includes('nest-fast-dev');

if (isMain) {
  main();
}
