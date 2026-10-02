import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function validateVersion(version, ref, prefix) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) {
    throw new Error(
      'Delivery package version must be a stable major.minor.patch version.',
    );
  }
  if (
    ref?.startsWith(`refs/tags/${prefix}`) &&
    ref !== `refs/tags/${prefix}${version}`
  ) {
    throw new Error('Release tag version must match the package version.');
  }
}

export function validateBrowserRelease({ version, ref, submit, keys }) {
  validateVersion(version, ref, 'extension-browser-v');
  if (!submit) return;
  if (ref !== `refs/tags/extension-browser-v${version}`) {
    throw new Error(
      'Browser submission requires the matching extension-browser release tag.',
    );
  }
  let config;
  try {
    config = JSON.parse(keys ?? '');
  } catch {
    throw new Error(
      'EXTENSION_SUBMIT_KEYS must contain valid Chrome publishing JSON.',
    );
  }
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    Object.keys(config).some((key) => !['chrome', '$schema'].includes(key)) ||
    ['clientId', 'clientSecret', 'refreshToken', 'extId'].some(
      (key) =>
        typeof config.chrome?.[key] !== 'string' || !config.chrome[key].trim(),
    ) ||
    !/^[a-p]{32}$/.test(config.chrome.extId)
  ) {
    throw new Error(
      'EXTENSION_SUBMIT_KEYS requires a Chrome clientId, clientSecret, refreshToken and 32-letter extId.',
    );
  }
}

export function prepareMobileConfig({
  config,
  version,
  ref,
  build,
  token,
  projectId,
}) {
  validateVersion(version, ref, 'mobile-v');
  if (config.expo?.version !== version)
    throw new Error('Expo app version must match the mobile package version.');
  if (!build) return structuredClone(config);
  if (!token?.trim())
    throw new Error('EXPO_TOKEN is required for a remote EAS build.');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId ?? '',
    ) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(projectId)
  ) {
    throw new Error(
      'EXPO_PROJECT_ID must identify the linked Expo project (UUID).',
    );
  }
  if (!config.expo.ios?.bundleIdentifier || !config.expo.android?.package) {
    throw new Error(
      'Expo app config must define iOS bundleIdentifier and Android package.',
    );
  }
  const result = structuredClone(config);
  result.expo.extra = {
    ...result.expo.extra,
    eas: { ...result.expo.extra?.eas, projectId },
  };
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
  try {
    if (process.argv[2] === 'browser') {
      validateBrowserRelease({
        version: readJson('apps/extensions/browser/app/package.json').version,
        ref: process.env.GITHUB_REF,
        submit: process.env.SUBMIT === 'true',
        keys: process.env.EXTENSION_SUBMIT_KEYS,
      });
    } else if (process.argv[2] === 'mobile') {
      const file = 'apps/mobile/app/app.json';
      const build = process.env.REMOTE_BUILD === 'true';
      const config = prepareMobileConfig({
        config: readJson(file),
        version: readJson('apps/mobile/app/package.json').version,
        ref: process.env.GITHUB_REF,
        build,
        token: process.env.EXPO_TOKEN,
        projectId: process.env.EXPO_PROJECT_ID,
      });
      if (build) writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    } else throw new Error('Select browser or mobile delivery validation.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
