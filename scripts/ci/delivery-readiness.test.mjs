import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareMobileConfig,
  validateBrowserRelease,
} from './delivery-readiness.mjs';

const chromeKeys = JSON.stringify({
  chrome: {
    clientId: 'fixture-client',
    clientSecret: 'fixture-value',
    refreshToken: 'fixture-value',
    extId: 'a'.repeat(32),
  },
});

test('browser validation needs no store credentials; submissions require a matching release tag', () => {
  assert.doesNotThrow(() =>
    validateBrowserRelease({
      version: '1.2.3',
      ref: 'refs/heads/master',
      submit: false,
    }),
  );
  assert.throws(
    () =>
      validateBrowserRelease({
        version: '1.2.3',
        ref: 'refs/heads/master',
        submit: true,
        keys: chromeKeys,
      }),
    /release tag/,
  );
  assert.throws(
    () =>
      validateBrowserRelease({
        version: '1.2.3',
        ref: 'refs/tags/extension-browser-v1.2.4',
        submit: false,
      }),
    /version/,
  );
  assert.doesNotThrow(() =>
    validateBrowserRelease({
      version: '1.2.3',
      ref: 'refs/tags/extension-browser-v1.2.3',
      submit: true,
      keys: chromeKeys,
    }),
  );
});

test('browser submission rejects malformed or incomplete credentials without exposing them', () => {
  const args = {
    version: '1.2.3',
    ref: 'refs/tags/extension-browser-v1.2.3',
    submit: true,
  };
  for (const keys of [
    '',
    'sensitive-invalid-json',
    '{}',
    '{"chrome":{}}',
    '{"chrome":[],"firefox":{}}',
  ]) {
    assert.throws(
      () => validateBrowserRelease({ ...args, keys }),
      (error) =>
        /EXTENSION_SUBMIT_KEYS/.test(error.message) &&
        !error.message.includes('sensitive-invalid-json'),
    );
  }
});

test('mobile validation is independent of Expo; remote builds require token and project linkage', () => {
  const config = {
    expo: {
      version: '1.2.3',
      ios: { bundleIdentifier: 'ai.genfeed.mobile' },
      android: { package: 'ai.genfeed.mobile' },
    },
  };
  const args = {
    config,
    version: '1.2.3',
    ref: 'refs/heads/master',
    build: false,
  };
  assert.deepEqual(prepareMobileConfig(args), config);
  for (const projectId of [
    '',
    'your-project-id',
    '00000000-0000-0000-0000-000000000000',
  ]) {
    assert.throws(
      () =>
        prepareMobileConfig({
          ...args,
          build: true,
          token: 'fixture-value',
          projectId,
        }),
      /EXPO_PROJECT_ID/,
    );
  }
  assert.throws(
    () =>
      prepareMobileConfig({
        ...args,
        build: true,
        projectId: '12345678-1234-4123-8123-123456789abc',
      }),
    /EXPO_TOKEN/,
  );
  const result = prepareMobileConfig({
    ...args,
    build: true,
    token: 'fixture-value',
    projectId: '12345678-1234-4123-8123-123456789abc',
  });
  assert.equal(
    result.expo.extra.eas.projectId,
    '12345678-1234-4123-8123-123456789abc',
  );
  assert.equal(config.expo.extra, undefined, 'do not mutate the source config');
});

test('mobile tags must agree with both app and package versions', () => {
  const args = {
    config: { expo: { version: '1.2.3' } },
    version: '1.2.3',
    build: false,
  };
  assert.throws(
    () => prepareMobileConfig({ ...args, ref: 'refs/tags/mobile-v1.2.4' }),
    /version/,
  );
  assert.throws(
    () =>
      prepareMobileConfig({
        ...args,
        version: '1.2.4',
        ref: 'refs/heads/master',
      }),
    /version/,
  );
});
