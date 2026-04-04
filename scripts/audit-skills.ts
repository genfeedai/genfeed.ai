#!/usr/bin/env bun
/**
 * Audit skills and commands against the Anthropic skill spec.
 *
 * Checks:
 *  - SKILL.md presence and casing
 *  - YAML frontmatter with required `name` + `description`
 *  - `name` is kebab-case, no "claude"/"anthropic"
 *  - `description` under 1024 chars, includes trigger phrases
 *  - Body under 5 000 words (else split into references/)
 *  - No README.md inside skill folders
 *  - No XML angle-bracket tags in body
 *
 * Usage:
 *   bun scripts/audit-skills.ts [--json]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

// ── helpers ──────────────────────────────────────────────────────────────────

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FORBIDDEN_NAMES = /claude|anthropic/i;
const XML_TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

interface Issue {
  severity: 'error' | 'warn';
  message: string;
}

interface SkillReport {
  path: string;
  name: string | null;
  description: string | null;
  issues: Issue[];
  compliant: boolean;
}

interface LegacyCommandReport {
  path: string;
  hasFrontmatter: boolean;
  lineCount: number;
  convertible: boolean;
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    // strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    fields[key] = val;
  }
  return fields;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── audit a single skill folder ─────────────────────────────────────────────

function auditSkill(skillDir: string): SkillReport {
  const folderName = basename(skillDir);
  const report: SkillReport = {
    compliant: true,
    description: null,
    issues: [],
    name: null,
    path: skillDir,
  };

  // 1. Check folder name is kebab-case
  if (!KEBAB_RE.test(folderName)) {
    report.issues.push({
      message: `Folder name "${folderName}" is not kebab-case`,
      severity: 'error',
    });
  }

  // 2. Check for SKILL.md (exact casing)
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    report.issues.push({
      message: 'Missing SKILL.md (case-sensitive)',
      severity: 'error',
    });
    report.compliant = false;
    return report;
  }

  const content = readFileSync(skillMdPath, 'utf-8');

  // 3. Check for README.md (forbidden)
  if (existsSync(join(skillDir, 'README.md'))) {
    report.issues.push({
      message: 'README.md found inside skill folder — not part of spec',
      severity: 'warn',
    });
  }

  // 4. Parse YAML frontmatter
  const fm = parseFrontmatter(content);
  if (!fm) {
    report.issues.push({
      message: 'Missing YAML frontmatter (---)',
      severity: 'error',
    });
    report.compliant = false;
    return report;
  }

  // 5. Required fields
  if (!fm.name) {
    report.issues.push({
      message: 'Missing required field "name" in frontmatter',
      severity: 'error',
    });
  } else {
    report.name = fm.name;
    if (!KEBAB_RE.test(fm.name)) {
      report.issues.push({
        message: `name "${fm.name}" is not kebab-case`,
        severity: 'error',
      });
    }
    if (FORBIDDEN_NAMES.test(fm.name)) {
      report.issues.push({
        message: `name "${fm.name}" contains forbidden word (claude/anthropic)`,
        severity: 'error',
      });
    }
    if (fm.name !== folderName) {
      report.issues.push({
        message: `name "${fm.name}" does not match folder "${folderName}"`,
        severity: 'warn',
      });
    }
  }

  if (!fm.description) {
    report.issues.push({
      message: 'Missing required field "description" in frontmatter',
      severity: 'error',
    });
  } else {
    report.description = fm.description;
    if (fm.description.length > 1024) {
      report.issues.push({
        message: `description is ${fm.description.length} chars (max 1024)`,
        severity: 'error',
      });
    }
    // Check for trigger phrases (heuristic: should mention when to use / user says)
    const hasTrigger = /\b(use when|trigger|invoke|say|ask)\b/i.test(
      fm.description,
    );
    if (!hasTrigger) {
      report.issues.push({
        message:
          "description may be missing trigger phrases (e.g. 'Use when...')",
        severity: 'warn',
      });
    }
  }

  // 6. Body checks (after frontmatter)
  const body = content.replace(FRONTMATTER_RE, '').trim();
  const words = wordCount(body);
  if (words > 5000) {
    report.issues.push({
      message: `SKILL.md body is ${words} words (>5000). Consider splitting into references/`,
      severity: 'warn',
    });
  }

  // 7. XML tags
  if (XML_TAG_RE.test(body)) {
    report.issues.push({
      message: 'Body contains XML-like tags (< >), which may confuse Claude',
      severity: 'warn',
    });
  }

  // Set compliance
  report.compliant =
    report.issues.filter((i) => i.severity === 'error').length === 0;
  return report;
}

// ── scan legacy commands ────────────────────────────────────────────────────

function scanCommands(dir: string): LegacyCommandReport[] {
  if (!existsSync(dir)) return [];
  const reports: LegacyCommandReport[] = [];

  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.md')) {
        const content = readFileSync(full, 'utf-8');
        const hasFm = FRONTMATTER_RE.test(content);
        const lines = content.split('\n').length;
        reports.push({
          convertible: lines < 500,
          hasFrontmatter: hasFm,
          lineCount: lines,
          path: full,
        });
      }
    }
  }

  walk(dir);
  return reports;
}

// ── main ────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const PROJECT_CMDS_DIR = join(ROOT, '.claude', 'commands');
const GLOBAL_CMDS_DIR = join(process.env.HOME ?? '~', '.claude', 'commands');
const jsonMode = process.argv.includes('--json');

// Audit skills
const skillReports: SkillReport[] = [];
if (existsSync(SKILLS_DIR)) {
  for (const entry of readdirSync(SKILLS_DIR)) {
    const full = join(SKILLS_DIR, entry);
    if (statSync(full).isDirectory()) {
      skillReports.push(auditSkill(full));
    }
  }
}

// Scan commands
const projectCmds = scanCommands(PROJECT_CMDS_DIR);
const globalCmds = scanCommands(GLOBAL_CMDS_DIR);

// ── output ──────────────────────────────────────────────────────────────────

const result = {
  commands: {
    global: {
      total: globalCmds.length,
      withFrontmatter: globalCmds.filter((c) => c.hasFrontmatter).length,
    },
    project: {
      total: projectCmds.length,
      withFrontmatter: projectCmds.filter((c) => c.hasFrontmatter).length,
    },
  },
  skills: {
    compliant: skillReports.filter((r) => r.compliant).length,
    nonCompliant: skillReports.filter((r) => !r.compliant).length,
    reports: skillReports,
    total: skillReports.length,
  },
  summary: {
    complianceRate: skillReports.length
      ? `${Math.round((skillReports.filter((r) => r.compliant).length / skillReports.length) * 100)}%`
      : 'N/A',
    totalCommands: projectCmds.length + globalCmds.length,
    totalSkills: skillReports.length,
  },
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('\n=== SKILL AUDIT REPORT ===\n');
  console.log(`Skills found: ${result.skills.total}`);
  console.log(`  Compliant:     ${result.skills.compliant}`);
  console.log(`  Non-compliant: ${result.skills.nonCompliant}`);
  console.log(`  Compliance:    ${result.summary.complianceRate}`);

  for (const r of skillReports) {
    const rel = relative(ROOT, r.path);
    const status = r.compliant ? '✅' : '❌';
    console.log(`\n${status} ${rel}`);
    for (const issue of r.issues) {
      const icon = issue.severity === 'error' ? '  ❌' : '  ⚠️';
      console.log(`${icon} ${issue.message}`);
    }
  }

  console.log('\n=== LEGACY COMMANDS ===\n');
  console.log(
    `Project commands: ${result.commands.project.total} (${result.commands.project.withFrontmatter} with frontmatter)`,
  );
  console.log(
    `Global commands:  ${result.commands.global.total} (${result.commands.global.withFrontmatter} with frontmatter)`,
  );

  const unconverted = projectCmds.filter((c) => !c.hasFrontmatter);
  if (unconverted.length > 0) {
    console.log(
      `\nProject commands without frontmatter (${unconverted.length}):`,
    );
    for (const c of unconverted.slice(0, 10)) {
      console.log(`  - ${relative(ROOT, c.path)} (${c.lineCount} lines)`);
    }
    if (unconverted.length > 10) {
      console.log(`  ... and ${unconverted.length - 10} more`);
    }
  }
}
