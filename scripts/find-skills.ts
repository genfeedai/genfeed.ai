#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

interface SkillRecord {
  description: string;
  name: string;
  path: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const EXTERNAL_SEARCH_TIMEOUT_MS = 15_000;

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  return fields;
}

function loadSkills(): SkillRecord[] {
  if (!existsSync(SKILLS_DIR)) {
    return [];
  }

  const skills: SkillRecord[] = [];
  for (const entry of readdirSync(SKILLS_DIR)) {
    const skillDir = join(SKILLS_DIR, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }

    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      continue;
    }

    const content = readFileSync(skillPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    skills.push({
      description: frontmatter?.description ?? '',
      name: frontmatter?.name ?? basename(skillDir),
      path: skillPath,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function formatSkill(skill: SkillRecord): string {
  return [`- ${skill.name}`, `  ${skill.description}`, `  ${skill.path}`].join(
    '\n',
  );
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const localOnly = args.includes('--local-only');
const externalOnly = args.includes('--external-only');
const searchTerms = args
  .filter(
    (arg) =>
      arg !== '--json' && arg !== '--local-only' && arg !== '--external-only',
  )
  .join(' ')
  .trim();
const skills = loadSkills();

function runExternalSearch(query: string): {
  ok: boolean;
  output: string;
  reason?: string;
} {
  const result = spawnSync('npx', ['skills', 'find', query], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: EXTERNAL_SEARCH_TIMEOUT_MS,
  });

  if (result.error) {
    return {
      ok: false,
      output: '',
      reason: result.error.message,
    };
  }

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();
  if (result.status !== 0) {
    return {
      ok: false,
      output,
      reason: `exit code ${result.status ?? 'unknown'}`,
    };
  }

  return { ok: true, output };
}

if (!searchTerms) {
  if (jsonMode) {
    console.log(JSON.stringify(skills, null, 2));
  } else {
    console.log(`Repo skills (${skills.length})\n`);
    console.log(skills.map(formatSkill).join('\n\n'));
  }
  process.exit(0);
}

const query = searchTerms.toLowerCase();
const matches = skills.filter((skill) => {
  const haystack =
    `${skill.name} ${skill.description} ${skill.path}`.toLowerCase();
  return haystack.includes(query);
});

if (jsonMode) {
  const payload: Record<string, unknown> = {
    localMatches: matches,
    query: searchTerms,
  };
  if (!localOnly && matches.length === 0) {
    payload.externalSearch = runExternalSearch(searchTerms);
  }
  console.log(JSON.stringify(payload, null, 2));
} else if (matches.length > 0 && !externalOnly) {
  console.log(
    `Repo-local skill matches for "${searchTerms}" (${matches.length})\n`,
  );
  console.log(matches.map(formatSkill).join('\n\n'));
} else if (!localOnly) {
  console.log(`No repo-local skills matched "${searchTerms}".`);
  console.log('\nFalling back to external skills search...\n');
  const external = runExternalSearch(searchTerms);
  if (external.ok) {
    console.log(external.output || 'External search returned no output.');
  } else {
    console.log(
      `External search unavailable${external.reason ? ` (${external.reason})` : ''}.`,
    );
    if (external.output) {
      console.log(`\n${external.output}`);
    }
  }
} else {
  console.log(`No repo-local skills matched "${searchTerms}".`);
}
