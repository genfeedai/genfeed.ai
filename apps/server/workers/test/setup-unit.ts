/**
 * Unit Test Setup - runs before all unit tests
 *
 * Stubs the ambient env unit tests must never depend on. Processors that
 * reach EncryptionUtil (via @api imports) resolve the key through
 * `resolveTokenEncryptionKey()`, which throws when TOKEN_ENCRYPTION_KEY is
 * unset — specs pass plaintext fixtures, which the cipher passes through.
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Mock encryption key — same value as the api test setup so encrypted
// fixtures interop across service suites.
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-for-testing-only';
