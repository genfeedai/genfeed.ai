import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// `.node-version` is the single Node.js pin. Docker cannot read a file before
// FROM, so the images take it as a build ARG and every builder feeds it in.
const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const NODE_DOCKERFILES = [
  'docker/Dockerfile.server',
  'docker/Dockerfile.selfhosted',
  'docker/Dockerfile.visual-code',
];

function* ymlFiles(directory) {
  for (const entry of readdirSync(path.join(root, directory))) {
    const relative = `${directory}/${entry}`;
    if (statSync(path.join(root, relative)).isDirectory()) {
      yield* ymlFiles(relative);
    } else if (/\.ya?ml$/.test(entry)) {
      yield relative;
    }
  }
}

test('.node-version holds one exact version', () => {
  assert.match(read('.node-version'), /^\d+\.\d+\.\d+\n?$/);
});

test('Node Dockerfiles take the version as a build ARG, never a literal', () => {
  for (const file of NODE_DOCKERFILES) {
    const lines = read(file).split('\n');
    const nodeStages = lines.filter((line) => /^FROM node:/.test(line));
    assert.ok(nodeStages.length > 0, `${file} has no node stage`);
    for (const stage of nodeStages) {
      assert.match(
        stage,
        /^FROM node:\$\{NODE_VERSION\}-/,
        `${file}: ${stage}`,
      );
    }
    const argLine = lines.indexOf('ARG NODE_VERSION');
    const firstFrom = lines.findIndex((line) => /^FROM /.test(line));
    assert.ok(
      argLine !== -1 && argLine < firstFrom,
      `${file} must declare ARG NODE_VERSION (no default) before its first FROM`,
    );
  }
});

test('every workflow that builds a Node image passes NODE_VERSION from the file', () => {
  const dockerfile = /docker\/Dockerfile\.(?:server|selfhosted|visual-code)/;
  let builders = 0;
  for (const file of [
    ...ymlFiles('.github/workflows'),
    ...ymlFiles('.github/actions'),
  ]) {
    const lines = read(file).split('\n');
    const dockerBuilds = lines.filter(
      (line) => /docker build /.test(line) && dockerfile.test(line),
    );
    for (const line of dockerBuilds) {
      builders += 1;
      assert.match(
        line,
        /--build-arg NODE_VERSION="\$\(cat \.node-version\)"/,
        `${file}: ${line.trim()}`,
      );
    }
    const actionBuilds = lines.filter((line) =>
      new RegExp(`^\\s*file: ${dockerfile.source}\\s*$`).test(line),
    );
    builders += actionBuilds.length;
    const passed = lines.filter((line) =>
      line.includes('NODE_VERSION=${{ steps.node.outputs.version }}'),
    );
    assert.equal(passed.length, actionBuilds.length, file);
    if (actionBuilds.length > 0) {
      assert.match(
        read(file),
        /uses: \.\/\.github\/actions\/node-version/,
        `${file} must read the version through the node-version action`,
      );
    }
  }
  assert.ok(builders > 0, 'found no Dockerfile builders to check');
});

test('the Node version change rebuilds the server image', () => {
  const inputs = JSON.parse(read('scripts/ci/server-image-inputs.json'));
  assert.ok(inputs.includes('.node-version'));
  assert.ok(inputs.includes('.github/actions/node-version/**'));
});
