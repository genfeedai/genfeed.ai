import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const args = process.argv.slice(2);
const options = Object.fromEntries(
  args.flatMap((value, index) =>
    index % 2 === 0 ? [[value, args[index + 1]]] : [],
  ),
);
if (
  args.length !== 4 ||
  !options['--build-dir'] ||
  !options['--output'] ||
  !path.isAbsolute(options['--build-dir']) ||
  !path.isAbsolute(options['--output'])
) {
  throw new Error(
    'Require --build-dir <absolute directory> --output <absolute JSON file>.',
  );
}
const directory = await realpath(options['--build-dir']);
if (!(await stat(directory)).isDirectory())
  throw new Error('Build directory required.');
const evidence = { buildDirectory: directory, entries: [], pass: false };
const safe = (error) => String(error?.message ?? error).slice(0, 1000);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function localFile(reference) {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(reference) ||
    reference.startsWith('//') ||
    reference.includes('\\')
  )
    throw new Error('Remote or unsupported script reference.');
  const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (pathname.split('/').includes('..'))
    throw new Error('Script traversal rejected.');
  const target = await realpath(
    path.resolve(directory, pathname.replace(/^\/+/, '')),
  );
  if (
    !target.startsWith(`${directory}${path.sep}`) ||
    !(await stat(target)).isFile()
  )
    throw new Error('Missing script or symlink escape.');
  return target;
}
async function probe(entry) {
  const result = {
    entry,
    scripts: [],
    errors: [],
    rejections: [],
    consoleErrors: [],
    network: [],
    unexpectedNetwork: [],
    chromeCalls: [],
    unexpectedMessages: [],
    constructors: null,
    pass: false,
  };
  evidence.entries.push(result);
  let dom;
  const rejected = (reason) => result.rejections.push(safe(reason));
  process.on('unhandledRejection', rejected);
  try {
    const htmlPath = await localFile(entry);
    const html = await readFile(htmlPath, 'utf8');
    result.htmlSha256 = hash(html);
    const scripts = [...JSDOM.fragment(html).querySelectorAll('script')];
    if (!scripts.length) throw new Error('No generated entry scripts.');
    const entries = [];
    for (const script of scripts) {
      if (
        script.type &&
        !['text/javascript', 'application/javascript'].includes(script.type)
      )
        throw new Error('Unexpected module or script loading.');
      if (!script.src || script.textContent.trim())
        throw new Error('Unexpected inline or missing entry script.');
      const file = await localFile(script.getAttribute('src'));
      const bytes = await readFile(file);
      result.scripts.push({
        path: path.relative(directory, file),
        sha256: hash(bytes),
      });
      entries.push(bytes);
    }
    const console = new VirtualConsole();
    console.on('jsdomError', (error) =>
      result.errors.push({ kind: 'jsdom', message: safe(error) }),
    );
    console.on('error', (...values) =>
      result.consoleErrors.push(values.map(safe).join(' ')),
    );
    dom = new JSDOM(html, {
      url: `https://compiled-extension.invalid/${entry}`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: console,
    });
    const w = dom.window;
    for (const name of ['Request', 'Response', 'Headers']) {
      if (typeof globalThis[name] !== 'function')
        throw new Error(`Missing verification runtime ${name} constructor.`);
      w[name] = globalThis[name];
    }
    const event = () => ({
      addListener() {},
      removeListener() {},
      hasListener: () => false,
    });
    const recorded = (method, value) =>
      result.chromeCalls.push({
        method,
        keys: value && typeof value === 'object' ? Object.keys(value) : [],
      });
    const storage = () => {
      const values = {};
      return {
        async get(keys, callback) {
          const answer =
            keys && !Array.isArray(keys) && typeof keys === 'object'
              ? { ...keys }
              : {};
          const names =
            keys == null
              ? Object.keys(values)
              : typeof keys === 'string'
                ? [keys]
                : Array.isArray(keys)
                  ? keys
                  : Object.keys(keys);
          for (const key of names) if (key in values) answer[key] = values[key];
          callback?.(answer);
          return answer;
        },
        async set(data, callback) {
          recorded('storage.set', data);
          Object.assign(values, data);
          callback?.();
        },
        async remove(keys, callback) {
          recorded('storage.remove');
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete values[key];
          callback?.();
        },
        async clear(callback) {
          recorded('storage.clear');
          for (const key of Object.keys(values)) delete values[key];
          callback?.();
        },
      };
    };
    const reply = (value) => async (_options, callback) => {
      callback?.(value);
      return value;
    };
    const mutation = (method) => async (value) => {
      recorded(method, value);
      return {};
    };
    const events = (names) =>
      Object.fromEntries(names.map((name) => [name, event()]));
    const runtime = events(['onMessage', 'onConnect', 'onInstalled']);
    runtime.id = 'compiled-probe';
    runtime.getURL = (name) => `chrome-extension://compiled-probe/${name}`;
    runtime.getManifest = () => ({ version: '0.0.0' });
    runtime.sendMessage = async (message, callback) => {
      result.unexpectedMessages.push(String(message?.event ?? 'unknown'));
      const answer = {
        success: false,
        error: 'Synthetic host has no background state.',
      };
      callback?.(answer);
      return answer;
    };
    runtime.connect = () => ({
      ...events(['onMessage', 'onDisconnect']),
      postMessage: mutation('runtime.postMessage'),
      disconnect() {},
    });
    w.chrome = {
      runtime,
      storage: {
        local: storage(),
        sync: storage(),
        session: storage(),
        onChanged: event(),
      },
      tabs: {
        ...events(['onActivated', 'onUpdated', 'onRemoved']),
        query: reply([]),
        create: mutation('tabs.create'),
      },
      cookies: { get: reply(null), getAll: reply([]) },
      alarms: {
        onAlarm: event(),
        create: mutation('alarms.create'),
        clear: async () => true,
      },
      windows: { WINDOW_ID_CURRENT: -2 },
      sidePanel: { open: mutation('sidePanel.open') },
      action: {},
      identity: {},
    };
    w.matchMedia = (query) => ({
      ...event(),
      media: query,
      matches: false,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    });
    w.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const blocked = (kind) => {
      result.unexpectedNetwork.push({ kind });
      throw new Error(`Synthetic host blocked ${kind}.`);
    };
    w.fetch = async (input, init) => {
      let target;
      if (typeof input === 'string') target = input;
      else if (input instanceof URL || input instanceof w.URL)
        target = input.href;
      else if (input instanceof Request) target = input.url;
      else throw new Error('Unsupported synthetic fetch input.');
      const url = new URL(target, w.location.href);
      const method = String(
        init?.method ?? (input instanceof Request ? input.method : 'GET'),
      ).toUpperCase();
      const request = { method, path: url.pathname };
      result.network.push(request);
      if (method === 'GET' && url.pathname.endsWith('/auth/token'))
        return new Response(JSON.stringify({ error: 'Signed out' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      if (method === 'GET' && url.pathname.endsWith('/auth/get-session'))
        return new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      result.unexpectedNetwork.push(request);
      throw new Error('Unexpected synthetic auth path.');
    };
    w.XMLHttpRequest = class {
      constructor() {
        blocked('XHR');
      }
    };
    w.WebSocket = class {
      constructor() {
        blocked('WebSocket');
      }
    };
    w.navigator.sendBeacon = () => blocked('sendBeacon');
    w.addEventListener('error', (error) =>
      result.errors.push({
        kind: 'window',
        message: safe(error.error ?? error.message),
      }),
    );
    w.addEventListener('unhandledrejection', (error) =>
      result.rejections.push(safe(error.reason)),
    );
    for (const bytes of entries) {
      try {
        w.eval(bytes.toString('utf8'));
      } catch (error) {
        result.errors.push({ kind: 'eval', message: safe(error) });
      }
    }
    const settled = () => {
      const root = w.document.getElementById('__plasmo');
      const buttons = [...(root?.querySelectorAll('button') ?? [])];
      return (
        !!root?.textContent.trim() &&
        !!root.querySelector('[role="alert"]')?.textContent.trim() &&
        ['Retry', 'Open Genfeed'].every((label) =>
          buttons.some(
            (button) =>
              button.textContent.trim() === label &&
              !button.disabled &&
              button.getAttribute('aria-disabled') !== 'true',
          ),
        )
      );
    };
    const deadline = Date.now() + 5000;
    while (!settled() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    result.processType = typeof w.process;
    result.dom = {
      pass: settled(),
      rootText: w.document.getElementById('__plasmo')?.textContent ?? '',
      rootHtml: w.document.getElementById('__plasmo')?.outerHTML ?? '',
    };
    if (entry === 'sidepanel.html') {
      for (const name of Object.keys(w).filter((key) =>
        key.startsWith('parcelRequire'),
      )) {
        const cache = w[name]?.cache;
        for (const module of Object.values(cache ?? {})) {
          const exports = module?.exports;
          if (
            !exports ||
            !['string', 'object', 'number', 'enum'].every(
              (key) => typeof exports[key] === 'function',
            )
          )
            continue;
          const schema = exports.string();
          result.constructors = {
            parcelGlobal: name,
            string: typeof exports.string,
            object: typeof exports.object,
            number: typeof exports.number,
            enum: typeof exports.enum,
            validString: schema.safeParse('startup').success,
            invalidNumber: schema.safeParse(123).success === false,
          };
          break;
        }
        if (result.constructors) break;
      }
    }
    result.pass =
      result.dom.pass &&
      result.processType === 'undefined' &&
      (entry !== 'sidepanel.html' ||
        (!!result.constructors?.validString &&
          !!result.constructors?.invalidNumber)) &&
      !result.errors.length &&
      !result.rejections.length &&
      !result.consoleErrors.length &&
      !result.unexpectedNetwork.length &&
      !result.unexpectedMessages.length;
  } catch (error) {
    result.errors.push({ kind: 'harness', message: safe(error) });
  } finally {
    dom?.window.close();
    process.removeListener('unhandledRejection', rejected);
  }
}
for (const entry of ['popup.html', 'sidepanel.html']) await probe(entry);
evidence.pass = evidence.entries.every((entry) => entry.pass);
await writeFile(options['--output'], `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      pass: evidence.pass,
      entries: evidence.entries.map(
        ({ entry, pass, errors, dom, constructors, unexpectedNetwork }) => ({
          entry,
          pass,
          errors,
          rendered: dom?.pass,
          constructors,
          unexpectedNetwork,
        }),
      ),
    },
    null,
    2,
  ),
);
process.exitCode = evidence.pass ? 0 : 1;
