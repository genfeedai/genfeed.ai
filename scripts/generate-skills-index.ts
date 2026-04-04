#!/usr/bin/env bun

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';

interface SkillFrontmatter {
  description: string;
  name: string;
}

interface SkillIndexEntry {
  description: string;
  path: string;
  slug: string;
}

interface SkillIndex {
  generatedAt: string;
  skills: SkillIndexEntry[];
  total: number;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const OUTPUT_PATH = join(SKILLS_DIR, 'index.json');

function parseFrontmatter(content: string): SkillFrontmatter | null {
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

  if (!fields.name || !fields.description) {
    return null;
  }

  return {
    description: fields.description,
    name: fields.name,
  };
}

function loadSkills(): SkillIndexEntry[] {
  if (!existsSync(SKILLS_DIR)) {
    return [];
  }

  const skills: SkillIndexEntry[] = [];
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
      path: relative(ROOT, skillPath),
      slug: frontmatter?.name ?? basename(skillDir),
    });
  }

  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

const skills = loadSkills();
const index: SkillIndex = {
  generatedAt: new Date().toISOString(),
  skills,
  total: skills.length,
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(index, null, 2)}\n`);

console.log(
  `Generated ${relative(ROOT, OUTPUT_PATH)} with ${skills.length} skills.`,
);
