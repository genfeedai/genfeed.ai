import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Contract for OSS issue intake (#2998, ADR-EARS-ON-EVERY-ISSUE):
// every public form requires identical EARS acceptance criteria, auto-applies
// needs:triage, and never bounces for syntax. Contact links keep questions
// and vulnerabilities off the issue tracker.

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function readRepoFile(relativePath) {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

const FORM_FILES = [
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/task.yml',
];

const EARS_DESCRIPTION =
  'Use testable outcomes. Prefer WHEN, WHILE, WHERE, or IF ... THE SYSTEM SHALL ... Imperfect syntax is fine — triage rewrites, it never closes for phrasing.';

const EARS_PLACEHOLDER = [
  '        - [ ] WHEN ... THE SYSTEM SHALL ...',
  '        - [ ] IF ... THEN THE SYSTEM SHALL ...',
].join('\n');

function acceptanceBlock(source, fileName) {
  const match = source.match(
    / {2}- type: textarea\n {4}id: acceptance\n {4}attributes:\n {6}label: Acceptance criteria\n {6}description: ([^\n]+)\n {6}placeholder: \|\n([\s\S]*?)\n {4}validations:\n {6}required: true\n/,
  );
  assert.ok(match, `${fileName} must require an Acceptance criteria textarea`);
  return { description: match[1], placeholder: match[2] };
}

test('every issue form requires identical EARS acceptance criteria', () => {
  const blocks = FORM_FILES.map((fileName) => ({
    fileName,
    ...acceptanceBlock(readRepoFile(fileName), fileName),
  }));

  for (const block of blocks) {
    assert.equal(
      block.description,
      EARS_DESCRIPTION,
      `${block.fileName} must use the shared EARS description`,
    );
    assert.equal(
      block.placeholder,
      EARS_PLACEHOLDER,
      `${block.fileName} must use the shared EARS placeholder`,
    );
  }
});

test('every issue form auto-applies needs:triage', () => {
  for (const fileName of FORM_FILES) {
    const source = readRepoFile(fileName);
    assert.match(
      source,
      /^labels: \[.*needs:triage.*\]$/m,
      `${fileName} must default the needs:triage label`,
    );
  }
});

test('issue chooser points questions and vulnerabilities off the tracker', () => {
  const config = readRepoFile('.github/ISSUE_TEMPLATE/config.yml');

  assert.match(config, /^blank_issues_enabled: false$/m);
  assert.match(
    config,
    /url: https:\/\/github\.com\/genfeedai\/genfeed\.ai\/discussions\/categories\/q-a/,
  );
  assert.match(
    config,
    /url: https:\/\/github\.com\/genfeedai\/genfeed\.ai\/discussions\/categories\/ideas/,
  );
  assert.match(
    config,
    /url: https:\/\/github\.com\/genfeedai\/genfeed\.ai\/security\/advisories\/new/,
  );
});

test('Community Profile has a valid Markdown issue-intake fallback', () => {
  // GitHub's community/profile API only detects ISSUE_TEMPLATE.md at
  // .github/, repo root, or docs/ — not inside .github/ISSUE_TEMPLATE/.
  const fallback = readRepoFile('.github/ISSUE_TEMPLATE.md');
  const template = fallback.match(
    /^---\n(?<metadata>[\s\S]*?)\n---\n(?<body>[\s\S]+)$/,
  );

  assert.ok(
    template?.groups,
    'the fallback must include GitHub Markdown-template metadata',
  );

  const { metadata, body } = template.groups;

  assert.match(metadata, /^name: General issue$/m);
  assert.match(metadata, /^about: \S.+$/m);
  assert.match(metadata, /^title: ""$/m);
  assert.match(metadata, /^labels: "needs:triage"$/m);
  assert.match(metadata, /^assignees: ""$/m);

  assert.match(body, /template=bug\.yml/);
  assert.match(body, /template=feature\.yml/);
  assert.match(body, /template=task\.yml/);
  assert.match(body, /issues\/new\/choose/);
  assert.match(body, /## Acceptance criteria/);
  assert.match(body, /WHEN .* THE SYSTEM SHALL/);
  assert.match(body, /IF .* THEN THE SYSTEM SHALL/);
  assert.match(body, /triage rewrites.*never closes for phrasing/i);
});

test('README and CONTRIBUTING make Portless the default contributor path', () => {
  const readme = readRepoFile('README.md');
  const contributing = readRepoFile('CONTRIBUTING.md');

  for (const [fileName, source] of [
    ['README.md', readme],
    ['CONTRIBUTING.md', contributing],
  ]) {
    assert.match(source, /bun run dev:setup/);
    assert.match(source, /bun run dev:backend:min/);
    assert.match(source, /bun run dev:app/);
    assert.match(source, /https:\/\/app\.genfeed\.localhost\//);
    assert.match(
      source,
      /optional debugging path/i,
      `${fileName} must identify fixed ports as optional debugging`,
    );
  }
});

test('CONTRIBUTING documents intake labels and the rewrite-not-bounce rule', () => {
  const contributing = readRepoFile('CONTRIBUTING.md');

  assert.match(contributing, /## Opening an issue/);
  assert.match(contributing, /needs:triage/);
  assert.match(contributing, /needs:ears/);
  assert.match(contributing, /needs:info/);
  assert.match(contributing, /good first issue/);
  assert.match(contributing, /help wanted/);
  assert.match(contributing, /Internal automation — do not apply/);
  assert.match(contributing, /You will not be bounced for imperfect syntax/);
  assert.match(
    contributing,
    /Priority is a native organization Issue Field surfaced on Project #12, never a label/,
  );
});
