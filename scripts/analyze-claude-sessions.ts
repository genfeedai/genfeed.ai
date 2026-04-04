#!/usr/bin/env bun

import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

type CounterMap = Map<string, number>;

type CategoryName =
  | 'coding_backend'
  | 'coding_frontend'
  | 'debugging_testing'
  | 'devops_ops'
  | 'docs_content'
  | 'marketing_growth'
  | 'agent_skilling'
  | 'product_strategy'
  | 'security'
  | 'presentation_media';

interface AnalysisOptions {
  includeSubagents: boolean;
  jsonOutFile: string | null;
  outFile: string;
}

interface AnalysisResult {
  assistantMessages: number;
  categoryCounts: Map<CategoryName, number>;
  cwdCounts: CounterMap;
  firstTimestamp: string | null;
  jsonlFiles: number;
  lastTimestamp: string | null;
  modelCounts: CounterMap;
  otherEvents: number;
  progressEvents: number;
  projectCounts: CounterMap;
  roots: string[];
  toolCounts: CounterMap;
  uniqueSessions: number;
  userMessages: number;
}

interface ClaudeRecord {
  cwd?: string;
  message?: ClaudeMessage;
  sessionId?: string;
  timestamp?: string;
  type?: string;
}

interface ClaudeMessage {
  content?: string | ClaudeContentItem[];
  model?: string;
  role?: string;
}

interface ClaudeContentItem {
  content?: string;
  name?: string;
  text?: string;
  type?: string;
}

const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  'docs',
  'claude-session-analysis.md',
);
const DEFAULT_JSON_OUTPUT = DEFAULT_OUTPUT.replace(/\.md$/u, '.json');

const CATEGORY_PATTERNS: Record<CategoryName, RegExp[]> = {
  agent_skilling: [
    /\bskill\b/i,
    /\bagent\b/i,
    /\bworkflow\b/i,
    /\.agents\b/i,
    /\bclaude\b/i,
    /\bcodex\b/i,
    /\bprompt\b/i,
    /\bmcp\b/i,
    /\bplugin\b/i,
  ],
  coding_backend: [
    /\bapi\b/i,
    /\bbackend\b/i,
    /\bnestjs\b/i,
    /\bexpress\b/i,
    /\bserver\b/i,
    /\bdatabase\b/i,
    /\bprisma\b/i,
    /\bmongo/i,
    /\bpostgres\b/i,
    /\bquery\b/i,
    /\bserializer\b/i,
    /\bmigration\b/i,
  ],
  coding_frontend: [
    /\bui\b/i,
    /\bux\b/i,
    /\bfrontend\b/i,
    /\breact\b/i,
    /\bnext(?:\.js|js)?\b/i,
    /\bcss\b/i,
    /\btailwind\b/i,
    /\bcomponent\b/i,
    /\bdesign\b/i,
    /\blanding page\b/i,
  ],
  debugging_testing: [
    /\bbug\b/i,
    /\bdebug\b/i,
    /\bfix\b/i,
    /\bfailing\b/i,
    /\btest\b/i,
    /\bci\b/i,
    /\blint\b/i,
    /\btype-check\b/i,
    /\bregression\b/i,
  ],
  devops_ops: [
    /\bdocker\b/i,
    /\bdeploy\b/i,
    /\bkubernetes\b/i,
    /\bvercel\b/i,
    /\bec2\b/i,
    /\baws\b/i,
    /\binfra\b/i,
    /\bmonitor\b/i,
    /\bsentry\b/i,
  ],
  docs_content: [
    /\bdocument\b/i,
    /\bdoc\b/i,
    /\breadme\b/i,
    /\bwriteup\b/i,
    /\bchangelog\b/i,
    /\bproposal\b/i,
    /\bspec\b/i,
    /\bprd\b/i,
    /\bsummary\b/i,
  ],
  marketing_growth: [
    /\btweet\b/i,
    /\bx\//i,
    /\bthread\b/i,
    /\bcontent\b/i,
    /\bseo\b/i,
    /\blanding\b/i,
    /\bfunnel\b/i,
    /\bcopy\b/i,
    /\bcampaign\b/i,
    /\bemail\b/i,
  ],
  presentation_media: [
    /\bslides\b/i,
    /\bpresentation\b/i,
    /\byoutube\b/i,
    /\bthumbnail\b/i,
    /\bvideo\b/i,
    /\bimage\b/i,
  ],
  product_strategy: [
    /\broadmap\b/i,
    /\bpricing\b/i,
    /\bmarket\b/i,
    /\bcompetitor\b/i,
    /\bicp\b/i,
    /\blaunch\b/i,
    /\bstrategy\b/i,
  ],
  security: [
    /\bsecurity\b/i,
    /\bauth\b/i,
    /\bpermission\b/i,
    /\bvulnerability\b/i,
    /\bowasp\b/i,
    /\bencrypt\b/i,
    /\bsecret\b/i,
  ],
};

const FILTERED_USER_PREFIXES = [
  '[request interrupted by user',
  '[suggestion mode:',
  '<task-notification>',
  '<command-name>',
  '<command-message>',
  '<local-command',
  '# session documenter',
  '# start:',
  '# end -',
  'this session is being continued from a previous conversation',
  '<teammate-message',
];

function parseArgs(argv: string[]): AnalysisOptions {
  let includeSubagents = false;
  let jsonOutFile: string | null = DEFAULT_JSON_OUTPUT;
  let outFile = DEFAULT_OUTPUT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--include-subagents') {
      includeSubagents = true;
      continue;
    }

    if (arg === '--json-out' && argv[i + 1]) {
      jsonOutFile = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--no-json') {
      jsonOutFile = null;
      continue;
    }

    if (arg === '--out' && argv[i + 1]) {
      outFile = path.resolve(argv[i + 1]);
      if (jsonOutFile === DEFAULT_JSON_OUTPUT) {
        jsonOutFile = outFile.replace(/\.md$/u, '.json');
      }
      i += 1;
    }
  }

  return { includeSubagents, jsonOutFile, outFile };
}

function increment(map: CounterMap, key: string, value = 1): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function safeParseJson(line: string): ClaudeRecord | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    return parsed as ClaudeRecord;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractUserText(content: ClaudeMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const chunks: string[] = [];
  for (const item of content) {
    if (!isRecord(item)) {
      continue;
    }

    const typed = item as ClaudeContentItem;
    if (typed.type === 'text' && typeof typed.text === 'string') {
      chunks.push(typed.text);
      continue;
    }

    if (typed.type !== 'tool_result' && typeof typed.content === 'string') {
      chunks.push(typed.content);
    }
  }

  return chunks.join('\n');
}

function shouldFilterUserMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  return FILTERED_USER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

async function discoverClaudeRoots(): Promise<string[]> {
  const home = homedir();
  const entries = await readdir(home, { withFileTypes: true });
  const roots: string[] = [];

  for (const entry of entries) {
    if (!entry.name.startsWith('.claude')) {
      continue;
    }

    const absolutePath = path.join(home, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }

    const projectsDir = path.join(absolutePath, 'projects');
    if (!existsSync(projectsDir)) {
      continue;
    }

    const projectsStat = await stat(projectsDir);
    if (projectsStat.isDirectory()) {
      roots.push(absolutePath);
    }
  }

  return roots.sort();
}

async function walkJsonlFiles(
  root: string,
  includeSubagents: boolean,
): Promise<string[]> {
  const projectsDir = path.join(root, 'projects');
  if (!existsSync(projectsDir)) {
    return [];
  }

  const results: string[] = [];
  const stack: string[] = [projectsDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!includeSubagents && entry.name === 'subagents') {
          continue;
        }

        stack.push(absolutePath);
        continue;
      }

      if (entry.isFile() && absolutePath.endsWith('.jsonl')) {
        results.push(absolutePath);
      }
    }
  }

  return results;
}

function parseProjectName(claudeRoot: string, filePath: string): string {
  const projectsPrefix = `${path.join(claudeRoot, 'projects')}${path.sep}`;
  if (!filePath.startsWith(projectsPrefix)) {
    return 'unknown';
  }

  const relative = filePath.slice(projectsPrefix.length);
  const project = relative.split(path.sep)[0];
  return project || 'unknown';
}

async function analyzeFile(
  filePath: string,
  claudeRoot: string,
  result: AnalysisResult,
  sessionIds: Set<string>,
): Promise<void> {
  const projectName = parseProjectName(claudeRoot, filePath);
  increment(result.projectCounts, projectName);

  const rl = createInterface({
    crlfDelay: Number.POSITIVE_INFINITY,
    input: createReadStream(filePath, { encoding: 'utf8' }),
  });

  for await (const line of rl) {
    const record = safeParseJson(line);
    if (!record) {
      continue;
    }

    if (typeof record.sessionId === 'string') {
      sessionIds.add(record.sessionId);
    }

    if (typeof record.timestamp === 'string') {
      if (!result.firstTimestamp || record.timestamp < result.firstTimestamp) {
        result.firstTimestamp = record.timestamp;
      }

      if (!result.lastTimestamp || record.timestamp > result.lastTimestamp) {
        result.lastTimestamp = record.timestamp;
      }
    }

    if (typeof record.cwd === 'string') {
      increment(result.cwdCounts, record.cwd);
    }

    if (record.type === 'assistant') {
      result.assistantMessages += 1;
    } else if (record.type === 'progress') {
      result.progressEvents += 1;
    } else if (record.type === 'user') {
      result.userMessages += 1;

      const message = record.message;
      if (message?.role === 'user') {
        const text = extractUserText(message.content);
        if (!shouldFilterUserMessage(text)) {
          for (const [category, patterns] of Object.entries(
            CATEGORY_PATTERNS,
          ) as [CategoryName, RegExp[]][]) {
            if (patterns.some((pattern) => pattern.test(text))) {
              result.categoryCounts.set(
                category,
                (result.categoryCounts.get(category) ?? 0) + 1,
              );
            }
          }
        }
      }
    } else {
      result.otherEvents += 1;
    }

    const message = record.message;
    if (!message) {
      continue;
    }

    if (typeof message.model === 'string') {
      increment(result.modelCounts, message.model);
    }

    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (!isRecord(item)) {
          continue;
        }

        const typed = item as ClaudeContentItem;
        if (typed.type === 'tool_use' && typeof typed.name === 'string') {
          increment(result.toolCounts, typed.name);
        }
      }
    }
  }
}

async function runAnalysis(options: AnalysisOptions): Promise<AnalysisResult> {
  const roots = await discoverClaudeRoots();
  const result: AnalysisResult = {
    assistantMessages: 0,
    categoryCounts: new Map<CategoryName, number>(),
    cwdCounts: new Map<string, number>(),
    firstTimestamp: null,
    jsonlFiles: 0,
    lastTimestamp: null,
    modelCounts: new Map<string, number>(),
    otherEvents: 0,
    progressEvents: 0,
    projectCounts: new Map<string, number>(),
    roots,
    toolCounts: new Map<string, number>(),
    uniqueSessions: 0,
    userMessages: 0,
  };

  const sessionIds = new Set<string>();

  for (const root of roots) {
    const files = await walkJsonlFiles(root, options.includeSubagents);
    result.jsonlFiles += files.length;

    for (const filePath of files) {
      await analyzeFile(filePath, root, result, sessionIds);
    }
  }

  result.uniqueSessions = sessionIds.size;
  return result;
}

function formatTopRows(counter: CounterMap, limit: number): string {
  const rows = Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(
      ([label, count]) =>
        `| ${escapePipe(label)} | ${count.toLocaleString()} |`,
    );

  if (rows.length === 0) {
    return '| (none) | 0 |';
  }

  return rows.join('\n');
}

function escapePipe(value: string): string {
  return value.replaceAll('|', '\\|');
}

function buildRecommendationsMarkdown(result: AnalysisResult): string {
  const category = (name: CategoryName) => result.categoryCounts.get(name) ?? 0;

  const agentCount = category('agent_skilling');
  const contentCount =
    category('marketing_growth') + category('presentation_media');
  const debugCount = category('debugging_testing');
  const docsCount = category('docs_content');
  const securityCount = category('security');

  return `## Productization Recommendations\n\n### Skills (Human-in-the-loop reusable workflows)\n1. **Monorepo Test-Fix Loop** (${debugCount.toLocaleString()} related prompts)\n   - Standardize your repeated cycle: isolate failing package -> minimal fix -> targeted retest -> suite retest.\n2. **Plan-to-Execution Runbook** (${agentCount.toLocaleString()} agent/skill prompts)\n   - Your sessions frequently start from prewritten plans. Turn this into a deterministic execution checklist skill.\n3. **Session Handoff Summarizer** (${docsCount.toLocaleString()} doc/summary prompts)\n   - You repeatedly request context summaries and continuation handoffs; capture one canonical format.\n4. **API Security Preflight** (${securityCount.toLocaleString()} security prompts)\n   - Enforce a repeatable auth/multi-tenancy/serializer gate before merge.\n5. **Content Ops Workflow** (${contentCount.toLocaleString()} content/media prompts)\n   - Convert your recurring content/presentation requests into a reusable brief -> outputs pattern.\n\n### Plugins (System/API integrations)\n1. **Session Analytics Plugin**\n   - Query local Claude history with filters ('repo', 'time', 'category', 'tool') without custom ad-hoc scripts.\n2. **GitHub Workflow Plugin**\n   - One surface for PR checks, failing workflow logs, review comments, and fix task creation.\n3. **Genfeed Workflow Ops Plugin**\n   - Trigger/inspect content pipeline runs and node outputs directly from agent sessions.\n\n### Agents (Autonomous multi-step loops)\n1. **CI Triage Agent**\n   - Detects failing checks, proposes fixes, runs validation, and loops until pass or explicit blocker.\n2. **Daily Pattern Miner Agent**\n   - Mines prior day sessions, flags repeated prompt patterns, and suggests new skill candidates.\n3. **Policy Guard Agent**\n   - Scans active branches for cloud invariants (multi-tenancy, serializers, user ID policy, TS strictness).\n\n### codex.md (Always-on guardrails, not workflows)\n1. Keep only cross-cutting invariants and done criteria.\n2. Keep repo architecture constraints and identity/security rules.\n3. Keep mandatory pre-push checks and evidence requirements.\n4. Do **not** put task-specific playbooks here (those belong in skills/agents).\n`;
}

function buildReportMarkdown(
  result: AnalysisResult,
  options: AnalysisOptions,
): string {
  const now = new Date().toISOString();
  const includeSubagentsLabel = options.includeSubagents ? 'yes' : 'no';

  const categoryRows = Array.from(result.categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `| ${label} | ${count.toLocaleString()} |`)
    .join('\n');

  return `# Claude Session Analysis\n\nGenerated: ${now}\n\n## Scope\n- Claude roots scanned: ${result.roots.length}\n- Roots:\n${result.roots.map((root) => `  - ${root}`).join('\n')}\n- Included subagent transcripts: ${includeSubagentsLabel}\n- JSONL files scanned: ${result.jsonlFiles.toLocaleString()}\n- Unique sessions: ${result.uniqueSessions.toLocaleString()}\n- Time range: ${result.firstTimestamp ?? 'n/a'} -> ${result.lastTimestamp ?? 'n/a'}\n\n## Event Volume\n- User messages: ${result.userMessages.toLocaleString()}\n- Assistant messages: ${result.assistantMessages.toLocaleString()}\n- Progress events: ${result.progressEvents.toLocaleString()}\n- Other events: ${result.otherEvents.toLocaleString()}\n\n## Top Categories (User Prompt Intent)\n| Category | Count |\n|---|---:|\n${categoryRows || '| (none) | 0 |'}\n\n## Top Models\n| Model | Count |\n|---|---:|\n${formatTopRows(result.modelCounts, 10)}\n\n## Top Tool Uses\n| Tool | Count |\n|---|---:|\n${formatTopRows(result.toolCounts, 15)}\n\n## Top Projects\n| Project | File Count |\n|---|---:|\n${formatTopRows(result.projectCounts, 12)}\n\n## Top Working Directories\n| CWD | Event Count |\n|---|---:|\n${formatTopRows(result.cwdCounts, 12)}\n\n${buildRecommendationsMarkdown(result)}\n\n## How to Run\n\`\`\`bash\nbun run analyze:claude-sessions\nbun run analyze:claude-sessions -- --include-subagents\nbun run analyze:claude-sessions -- --out docs/custom-claude-analysis.md\nbun run analyze:claude-sessions -- --json-out docs/custom-claude-analysis.json\nbun run analyze:claude-sessions -- --no-json\n\`\`\`\n`;
}

function topEntries(
  counter: CounterMap,
  limit: number,
): Array<{ count: number; key: string }> {
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ count, key }));
}

function toPlainObject<T extends string>(
  map: Map<T, number>,
): Record<string, number> {
  return Object.fromEntries(map.entries());
}

function buildJsonPayload(
  result: AnalysisResult,
  options: AnalysisOptions,
): Record<string, unknown> {
  return {
    counts: {
      categories: toPlainObject(new Map(result.categoryCounts.entries())),
      cwds: toPlainObject(result.cwdCounts),
      models: toPlainObject(result.modelCounts),
      projects: toPlainObject(result.projectCounts),
      tools: toPlainObject(result.toolCounts),
    },
    events: {
      assistantMessages: result.assistantMessages,
      otherEvents: result.otherEvents,
      progressEvents: result.progressEvents,
      userMessages: result.userMessages,
    },
    generatedAt: new Date().toISOString(),
    options: {
      includeSubagents: options.includeSubagents,
      jsonOut: options.jsonOutFile,
      markdownOut: options.outFile,
    },
    scope: {
      firstTimestamp: result.firstTimestamp,
      jsonlFiles: result.jsonlFiles,
      lastTimestamp: result.lastTimestamp,
      roots: result.roots,
      uniqueSessions: result.uniqueSessions,
    },
    top: {
      categories: topEntries(new Map(result.categoryCounts.entries()), 10),
      cwds: topEntries(result.cwdCounts, 12),
      models: topEntries(result.modelCounts, 10),
      projects: topEntries(result.projectCounts, 12),
      tools: topEntries(result.toolCounts, 15),
    },
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runAnalysis(options);

  const markdown = buildReportMarkdown(result, options);

  const outDir = path.dirname(options.outFile);
  await mkdir(outDir, { recursive: true });
  await writeFile(options.outFile, markdown, 'utf8');

  if (options.jsonOutFile) {
    const jsonOutDir = path.dirname(options.jsonOutFile);
    await mkdir(jsonOutDir, { recursive: true });
    const payload = buildJsonPayload(result, options);
    await writeFile(
      options.jsonOutFile,
      JSON.stringify(payload, null, 2),
      'utf8',
    );
  }

  console.log(`Claude session analysis written to ${options.outFile}`);
  if (options.jsonOutFile) {
    console.log(`Claude session JSON written to ${options.jsonOutFile}`);
  }
  console.log(
    `Scanned ${result.jsonlFiles.toLocaleString()} JSONL files across ${result.roots.length} roots.`,
  );
}

await main();
