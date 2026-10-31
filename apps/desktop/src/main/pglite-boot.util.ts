import { PGlite, type PGliteOptions } from '@electric-sql/pglite';

/**
 * PGlite's Emscripten runtime records an internal proc_exit(99) while
 * the WASM module boots, which assigns `process.exitCode = 99` even though
 * the database comes up healthy. Left alone, every process that merely
 * opened a database — the packaged Electron main process and `bun test`
 * alike — exits 99 on an otherwise clean shutdown. Boot through this helper
 * so the pre-boot exit code is restored once the instance is ready.
 */
export async function bootPGlite(options?: PGliteOptions): Promise<PGlite> {
  const exitCodeBeforeBoot = process.exitCode;
  const pglite = new PGlite(options);

  try {
    await pglite.waitReady;
  } catch (error) {
    await pglite.close().catch(() => undefined);
    throw error;
  } finally {
    if (process.exitCode !== exitCodeBeforeBoot) {
      process.exitCode = exitCodeBeforeBoot ?? 0;
    }
  }

  return pglite;
}
