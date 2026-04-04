#!/usr/bin/env bun
/**
 * Convert a .claude/commands/*.md file into a repo-local skills/<name>/SKILL.md
 *
 * Usage:
 *   bun scripts/convert-command-to-skill.ts <command-file> [--name override-name] [--delete]
 *
 * Options:
 *   --name <n>   Override the skill name (default: derived from filename)
 *   --delete     Remove the original command file after conversion
 *
 * Example:
 *   bun scripts/convert-command-to-skill.ts .claude/commands/deploy.md --name deploy
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const MAX_BODY_LINES = 200;

function toKebab(name: string): string {
  return name
    .replace(/\.md$/, '')
    .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractTitle(content: string): string {
  const stripped = content.replace(FRONTMATTER_RE, '').trim();
  const firstLine = stripped.split('\n')[0] ?? '';
  return firstLine.replace(/^#+\s*/, '').trim();
}

function extractPurpose(content: string): string {
  const stripped = content.replace(FRONTMATTER_RE, '').trim();
  const lines = stripped.split('\n');
  // Look for a Purpose line, a "When to Use" section, or the first non-heading paragraph
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim();
    if (/^\*\*Purpose:\*\*/i.test(line)) {
      return line.replace(/^\*\*Purpose:\*\*\s*/i, '').trim();
    }
  }
  // Fallback: first paragraph after title
  for (let i = 1; i < Math.min(lines.length, 15); i++) {
    const line = lines[i].trim();
    if (
      line &&
      !line.startsWith('#') &&
      !line.startsWith('```') &&
      !line.startsWith('-') &&
      !line.startsWith('|')
    ) {
      return line;
    }
  }
  return '';
}

// ── main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags: Record<string, string | boolean> = {};
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) {
    flags.name = args[++i];
  } else if (args[i] === '--delete') {
    flags.delete = true;
  } else {
    positional.push(args[i]);
  }
}

const inputPath = positional[0];
if (!inputPath) {
  console.error(
    'Usage: bun scripts/convert-command-to-skill.ts <command-file> [--name name] [--delete]',
  );
  process.exit(1);
}

const resolvedInput = join(process.cwd(), inputPath);
if (!existsSync(resolvedInput)) {
  console.error(`File not found: ${resolvedInput}`);
  process.exit(1);
}

const content = readFileSync(resolvedInput, 'utf-8');
const skillName = (flags.name as string) || toKebab(basename(inputPath));

if (!KEBAB_RE.test(skillName)) {
  console.error(`Invalid skill name: "${skillName}" — must be kebab-case`);
  process.exit(1);
}

const title = extractTitle(content);
const purpose = extractPurpose(content);

// Strip existing frontmatter if any
const body = content.replace(FRONTMATTER_RE, '').trim();
const lines = body.split('\n');

// Determine if we need progressive disclosure (split into references/)
const needsSplit = lines.length > MAX_BODY_LINES;

const ROOT = process.cwd();
const skillDir = join(ROOT, 'skills', skillName);
mkdirSync(skillDir, { recursive: true });

// Build description with trigger phrases
const triggerPart = `Use when user says "${skillName}", "${skillName.replace(/-/g, ' ')}"`;
const desc = purpose
  ? `${purpose}. ${triggerPart}.`
  : `${title}. ${triggerPart}.`;
const clampedDesc = desc.slice(0, 1024);

if (needsSplit) {
  // Core SKILL.md: frontmatter + first ~150 lines
  const coreLines = lines.slice(0, 150);
  const refLines = lines.slice(150);

  const skillMd = `---
name: ${skillName}
description: "${clampedDesc}"
---

${coreLines.join('\n')}

## References

See \`references/details.md\` for the full workflow documentation.
`;

  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);

  // references/details.md
  const refsDir = join(skillDir, 'references');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(
    join(refsDir, 'details.md'),
    `# ${title} — Detailed Reference\n\n${refLines.join('\n')}\n`,
  );

  console.log(`✅ Created ${skillName}/ with SKILL.md + references/details.md`);
  console.log(
    `   Core: ${coreLines.length} lines | Reference: ${refLines.length} lines`,
  );
} else {
  const skillMd = `---
name: ${skillName}
description: "${clampedDesc}"
---

${body}
`;

  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
  console.log(`✅ Created ${skillName}/SKILL.md (${lines.length} lines)`);
}

if (flags.delete) {
  unlinkSync(resolvedInput);
  console.log(`🗑️  Deleted original: ${inputPath}`);
}

console.log(`\nValidation:`);
console.log(`  name: ${skillName} ${KEBAB_RE.test(skillName) ? '✅' : '❌'}`);
console.log(
  `  description: ${clampedDesc.length} chars ${clampedDesc.length <= 1024 ? '✅' : '❌'}`,
);
console.log(
  `  progressive disclosure: ${needsSplit ? 'split' : 'single file'}`,
);
