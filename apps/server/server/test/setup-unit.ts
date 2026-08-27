/**
 * Unit-test environment shared by the extracted server domain.
 *
 * Credential fixtures exercise the same cipher boundary as API and worker
 * tests, so they use the repository's standard non-production test key.
 */

process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-for-testing-only';
