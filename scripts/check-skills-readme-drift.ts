#!/usr/bin/env bun
/**
 * Ensures the public root skills README matches root skill frontmatter.
 *
 * Usage:
 *   bun run scripts/check-skills-readme-drift.ts
 *   bun run scripts/check-skills-readme-drift.ts --write
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const README_PATH = join(SKILLS_DIR, 'README.md');

interface ProductSkill {
  description: string;
  name: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(skillPath: string): ProductSkill {
  const content = readFileSync(skillPath, 'utf-8');
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    fail(`${relative(ROOT, skillPath)} is missing YAML frontmatter.`);
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = unquote(line.slice(idx + 1));
    fields[key] = value;
  }

  if (!fields.name) {
    fail(`${relative(ROOT, skillPath)} is missing frontmatter field "name".`);
  }
  if (!fields.description) {
    fail(
      `${relative(ROOT, skillPath)} is missing frontmatter field "description".`,
    );
  }

  const folderName = basename(dirname(skillPath));
  if (fields.name !== folderName) {
    fail(
      `${relative(ROOT, skillPath)} frontmatter name "${fields.name}" does not match folder "${folderName}".`,
    );
  }

  return {
    description: fields.description,
    name: fields.name,
  };
}

function loadProductSkills(): ProductSkill[] {
  if (!existsSync(SKILLS_DIR)) {
    fail('skills/ directory does not exist.');
  }

  const skills: ProductSkill[] = [];
  for (const entry of readdirSync(SKILLS_DIR)) {
    const skillDir = join(SKILLS_DIR, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }

    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      continue;
    }

    skills.push(parseFrontmatter(skillPath));
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function escapeTableCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function renderSkillsSection(skills: ProductSkill[]): string {
  const lines = [
    'Generated from `skills/*/SKILL.md` frontmatter. Run `bun run scripts/check-skills-readme-drift.ts --write` after adding or changing a root product skill.',
    '',
    '| Skill | Description |',
    '| --- | --- |',
  ];

  for (const skill of skills) {
    lines.push(`| \`${skill.name}\` | ${escapeTableCell(skill.description)} |`);
  }

  return `${lines.join('\n')}\n`;
}

function replaceSkillsSection(readme: string, expectedSection: string): string {
  const sectionRe = /(## Skills\r?\n\r?\n)([\s\S]*?)(\r?\n## Adding a skill)/;
  if (!sectionRe.test(readme)) {
    fail(
      'skills/README.md must contain "## Skills" before "## Adding a skill".',
    );
  }

  return readme.replace(sectionRe, `$1${expectedSection}$3`);
}

function parseReadmeSkillNames(section: string): string[] {
  const names: string[] = [];
  for (const line of section.split('\n')) {
    const match = line.match(/^\| `([^`]+)` \| /);
    if (match) {
      names.push(match[1]);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function main(): void {
  const shouldWrite = process.argv.includes('--write');
  const skills = loadProductSkills();
  const expectedSection = renderSkillsSection(skills);
  const readme = readFileSync(README_PATH, 'utf-8');
  const nextReadme = replaceSkillsSection(readme, expectedSection);

  if (nextReadme === readme) {
    console.log(
      `skills/README.md is in sync with ${skills.length} root product skills.`,
    );
    return;
  }

  if (shouldWrite) {
    writeFileSync(README_PATH, nextReadme);
    console.log(
      `Updated skills/README.md from ${skills.length} root product skills.`,
    );
    return;
  }

  const currentSection = readme.match(
    /## Skills\r?\n\r?\n([\s\S]*?)\r?\n## Adding a skill/,
  )?.[1];
  const currentNames = currentSection
    ? parseReadmeSkillNames(currentSection)
    : [];
  const expectedNames = skills.map((skill) => skill.name);
  const missing = expectedNames.filter((name) => !currentNames.includes(name));
  const extra = currentNames.filter((name) => !expectedNames.includes(name));

  console.error('skills/README.md has drifted from skills/*/SKILL.md.');
  if (missing.length > 0) {
    console.error(`Missing from README: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.error(`Extra in README: ${extra.join(', ')}`);
  }
  console.error(
    'Run `bun run scripts/check-skills-readme-drift.ts --write` to regenerate it.',
  );
  process.exit(1);
}

main();
