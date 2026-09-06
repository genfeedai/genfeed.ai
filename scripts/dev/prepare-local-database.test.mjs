import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isLocalDevelopmentDatabase,
  prepareLocalDatabase,
} from './prepare-local-database.ts';

test('only loopback PostgreSQL in development permits automatic migrations', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(
      isLocalDevelopmentDatabase({
        DATABASE_URL: `postgresql://user:password@${host}:5432/genfeed`,
      }),
      true,
    );
  }
  for (const url of [
    undefined,
    '',
    'invalid',
    'https://localhost/db',
    'postgres://db.example.com/db',
    'postgres://localhost.example.com/db',
    'postgres://localhost/db?host=remote',
    'postgres://localhost/db?hostaddr=1.2.3.4',
    'postgres://localhost/db?service=remote',
  ]) {
    const commands = [];
    prepareLocalDatabase('/repo', { DATABASE_URL: url }, (args) => {
      commands.push(args);
    });
    assert.deepEqual(commands, []);
  }
  for (const NODE_ENV of ['production', 'staging', 'test']) {
    assert.equal(
      isLocalDevelopmentDatabase({
        NODE_ENV,
        DATABASE_URL: 'postgres://localhost/genfeed',
      }),
      false,
    );
  }
});

test('migrations finish before generating the client used by the API', () => {
  const commands = [];
  prepareLocalDatabase(
    '/repo',
    { DATABASE_URL: 'postgres://localhost/genfeed' },
    (args) => {
      commands.push(args);
    },
  );
  assert.deepEqual(commands, [['migrate', 'deploy'], ['generate']]);
});

test('migration failure aborts preparation without regenerating or hiding the error', () => {
  const commands = [];
  assert.throws(
    () =>
      prepareLocalDatabase(
        '/repo',
        { DATABASE_URL: 'postgres://localhost/genfeed' },
        (args) => {
          commands.push(args);
          throw new Error('migration failed');
        },
      ),
    /migration failed/,
  );
  assert.deepEqual(commands, [['migrate', 'deploy']]);
});
