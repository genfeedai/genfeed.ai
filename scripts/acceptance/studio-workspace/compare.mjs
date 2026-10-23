import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export const observedComponents = [
  'StudioPlaygroundWorkspace',
  'StudioPlaygroundComposer',
  'StudioPlaygroundResults',
];
export const captureStates = ['idle', 'pending', 'complete'];

// PerformedWork (1) survives commit on function fibers. Count committed renders,
// not scheduling attempts or StrictMode's discarded invocation. Keep the named
// observation boundaries identical when the workspace gains extracted children.
export const renderCounterScript = `(() => {
  const names = ${JSON.stringify(observedComponents)};
  let renders = Object.fromEntries(names.map(name => [name, 0]));
  const errors = [];
  const renderers = new Map();
  window.__studioSplitCounter = {
    reset() { renders = Object.fromEntries(names.map(name => [name, 0])); },
    read() { return { renders: {...renders}, errors: [...errors], rendererCount: renderers.size }; }
  };
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    errors.push('A pre-existing DevTools hook prevents isolated measurement');
    return;
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers,
    inject(renderer) { const id = renderers.size + 1; renderers.set(id, renderer); return id; },
    onCommitFiberRoot(_id, root) {
      try {
        const pending = [root.current];
        while (pending.length) {
          const fiber = pending.pop();
          if (!fiber) continue;
          const type = fiber.type;
          const name = type && (type.displayName || type.name || type.type?.name || type.render?.name);
          if (names.includes(name) && (fiber.flags & 1)) renders[name]++;
          if (fiber.child) pending.push(fiber.child);
          if (fiber.sibling) pending.push(fiber.sibling);
        }
      } catch (error) { errors.push(String(error)); }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {}
  };
})();`;

export function compareEvidence(before, after) {
  const errors = [];
  for (const key of ['browser', 'fixture', 'viewport']) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      errors.push(`${key} differs`);
  }
  for (const [label, receipt] of [
    ['before', before],
    ['after', after],
  ]) {
    if (typeof receipt.browser !== 'string' || !receipt.browser.trim())
      errors.push(`${label}: browser missing`);
    if (receipt.fixture !== 'workspace-split-v1')
      errors.push(`${label}: fixture missing or unsupported`);
    if (
      ![375, 1440].includes(receipt.viewport?.width) ||
      receipt.viewport?.height !== 1000
    )
      errors.push(`${label}: viewport missing or unsupported`);
    if (!/^[a-f0-9]{40}$/.test(receipt.sourceHead ?? ''))
      errors.push(`${label}: source head missing`);
    if (receipt.generationRequests !== 1)
      errors.push(`${label}: generation request count is not one`);
    if (
      !Array.isArray(receipt.blockedRequests) ||
      receipt.blockedRequests.length
    )
      errors.push(`${label}: blocked requests recorded`);
    if (!Array.isArray(receipt.counterErrors) || receipt.counterErrors.length)
      errors.push(`${label}: render counter errors recorded`);
  }
  for (const state of captureStates) {
    const previous = before.screenshots?.[state];
    const current = after.screenshots?.[state];
    if (
      !/^[a-f0-9]{64}$/.test(previous ?? '') ||
      !/^[a-f0-9]{64}$/.test(current ?? '')
    ) {
      errors.push(`${state} capture missing`);
    } else if (previous !== current) errors.push(`${state} pixels differ`);
  }
  for (const name of observedComponents) {
    const previous = before.renders?.[name];
    const current = after.renders?.[name];
    if (
      !Number.isInteger(previous) ||
      previous <= 0 ||
      !Number.isInteger(current) ||
      current <= 0
    ) {
      errors.push(`${name} render counter missing or empty`);
    } else if (current > previous)
      errors.push(`${name} renders increased: ${previous} -> ${current}`);
  }
  return errors;
}

async function readEvidence(directory, width) {
  const receipt = JSON.parse(
    await readFile(resolve(directory, `workspace-${width}.json`), 'utf8'),
  );
  if (receipt.viewport?.width !== width)
    throw new Error(`${width}: receipt width differs from filename`);
  for (const state of captureStates) {
    const filename = `workspace-${width}-${state}.png`;
    const bytes = await readFile(resolve(directory, filename));
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error(`${filename}: PNG signature missing`);
    if (
      createHash('sha256').update(bytes).digest('hex') !==
      receipt.screenshots?.[state]
    )
      throw new Error(`${filename}: bytes do not match receipt hash`);
  }
  return receipt;
}

async function main() {
  const [beforeDir, afterDir] = process.argv.slice(2);
  if (!beforeDir || !afterDir)
    throw new Error(
      'Usage: node compare.mjs <before-directory> <after-directory>',
    );
  const failures = [];
  for (const width of [375, 1440]) {
    const before = await readEvidence(beforeDir, width);
    const after = await readEvidence(afterDir, width);
    failures.push(
      ...compareEvidence(before, after).map(
        (message) => `${width}: ${message}`,
      ),
    );
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      '375/1440 pixels identical; observed component committed renders did not increase.',
    );
}

if (process.argv[1] && basename(process.argv[1]) === 'compare.mjs') {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
