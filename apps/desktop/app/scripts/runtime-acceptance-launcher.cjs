#!/usr/bin/env node
// Test-process boundary only: imports the unchanged production main bundle.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, dialog, safeStorage, session } = require('electron');

const data = process.env.GENFEED_RUNTIME_ACCEPTANCE_DATA;
const api = new URL(process.env.GENFEED_RUNTIME_ACCEPTANCE_API || '');
const shell = new URL(process.env.GENFEED_DESKTOP_APP_URL || '');
if (!data || !path.basename(data).startsWith('genfeed-runtime-electron-'))
  throw new Error(
    'A fresh task-specific temporary data directory is required.',
  );
for (const url of [api, shell]) {
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    throw new Error('Acceptance endpoints must be loopback fixture servers.');
}
for (const name of ['appData', 'userData', 'sessionData']) {
  const directory = path.join(data, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
// No protocol registration or Keychain entry is created by this fixture.
app.setAsDefaultProtocolClient = () => false;
safeStorage.isEncryptionAvailable = () => false;
const statePath = path.join(app.getPath('userData'), 'desktop-state.json');
const audit = {
  dialogCalls: 0,
  relaunchCalls: 0,
  nodeRequests: [],
  blocked: [],
};
let dialogMode = 'cancel';
let pendingDialog;
let failRename = false;
let startMain;
const started = new Promise((resolve) => {
  startMain = resolve;
});
let fixtureReady;
const prepared = new Promise((resolve) => {
  fixtureReady = resolve;
});
// Production main registers its privileged scheme at import time, which Electron
// only allows before `ready`. Import it before ready and hold its startup (its
// own `app.whenReady()`) until the fixture is written and the test says `start`.
const whenElectronReady = app.whenReady.bind(app);
app.whenReady = () =>
  Promise.all([whenElectronReady(), prepared, started]).then(() => undefined);
const mainImport = import(
  pathToFileURL(path.resolve(__dirname, '../dist/main.js')).href
);
const originalDialog = dialog.showMessageBox.bind(dialog);
dialog.showMessageBox = (...args) => {
  const options = args.at(-1);
  if (!options.message?.startsWith('Switch Genfeed Desktop to '))
    return originalDialog(...args);
  audit.dialogCalls++;
  if (dialogMode === 'defer')
    return new Promise((resolve) => {
      pendingDialog = resolve;
    });
  return Promise.resolve({ response: 1, checkboxChecked: false });
};
const rename = fs.renameSync;
fs.renameSync = (from, to) => {
  if (failRename && to === statePath) {
    failRename = false;
    throw new Error('Acceptance mode persistence failure');
  }
  return rename(from, to);
};
app.relaunch = () => {
  audit.relaunchCalls++;
  // Always prevent an accidental uninstrumented child/relaunch.
  throw new Error('Acceptance relaunch failure');
};
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url || input);
  audit.nodeRequests.push(url.pathname);
  if (url.origin === shell.origin) return nativeFetch(input, options);
  if (
    (url.origin === api.origin || url.hostname === 'api.genfeed.ai') &&
    (url.pathname.endsWith('/auth/whoami') || url.pathname.endsWith('/health'))
  )
    return nativeFetch(new URL(url.pathname, api).toString(), options);
  audit.blocked.push(url.pathname);
  return Promise.reject(
    new Error('Acceptance blocked nonfixture main request'),
  );
};
globalThis.__genfeedRuntimeAcceptance = {
  control(action) {
    if (action === 'start') startMain();
    else if (action === 'defer') dialogMode = 'defer';
    else if (action === 'confirm' || action === 'cancel') {
      if (!pendingDialog) throw new Error('No confirmation is pending.');
      const resolve = pendingDialog;
      pendingDialog = undefined;
      dialogMode = 'cancel';
      resolve({
        response: action === 'confirm' ? 0 : 1,
        checkboxChecked: false,
      });
    } else if (action === 'fail-mode-rename') failRename = true;
    else throw new Error('Unknown acceptance control.');
  },
  read() {
    const values = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return { ...audit, savedMode: values['desktop.runtime.mode'] || 'cloud' };
  },
};
void (async () => {
  await whenElectronReady();
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowed =
      url.protocol === 'data:' ||
      url.protocol === 'devtools:' ||
      url.origin === shell.origin ||
      url.origin === api.origin;
    if (!allowed) audit.blocked.push(url.pathname);
    callback({ cancel: !allowed });
  });
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  // Synthetic fixture session in this launch's data root only.
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      'desktop.server.selection': JSON.stringify({ kind: 'cloud' }),
      'desktop.session': JSON.stringify({
        issuedAt: new Date().toISOString(),
        token: 'gf_runtime_fixture',
        userId: 'mock-user-id-e2e-test',
        sessionCookie: {
          cookieName: 'better-auth.session_token',
          cookieValue: 'runtime-fixture',
          expiresAt,
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: false,
        },
      }),
    }),
    { mode: 0o600 },
  );
  fixtureReady();
  await mainImport;
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
