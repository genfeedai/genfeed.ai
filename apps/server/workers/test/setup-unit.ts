/**
 * Unit Test Setup - runs before all unit tests
 *
 * Stubs the ambient env unit tests must never depend on. Processors that
 * reach EncryptionUtil (via @api imports) resolve the key through
 * `resolveTokenEncryptionKey()`, which throws when TOKEN_ENCRYPTION_KEY is
 * unset — specs pass plaintext fixtures, which the cipher passes through.
 */

// Per-file reset for `isolate: false` (vitest.config.ts). Setup files run
// before each spec's own imports, so every spec starts with a fresh module
// registry, real timers and no stub or spy left by the file that ran before it
// in the same worker. Keep this at the top level, not in a hook: a reset
// between the tests of one file would undo stubs that file set up on purpose.
vi.useRealTimers();
vi.restoreAllMocks();
vi.unstubAllGlobals();
vi.unstubAllEnvs();
vi.resetModules();

vi.stubEnv('NODE_ENV', 'test');

// Mock encryption key — same value as the api test setup so encrypted
// fixtures interop across service suites.
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-for-testing-only';
