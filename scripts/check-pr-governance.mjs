import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredSections = [
  {
    heading: 'Optimization Target',
    allowPhrases: ['not an optimization task'],
  },
  {
    heading: 'Alternatives Considered',
  },
  {
    heading: 'Why This Fits This Repo',
  },
  {
    heading: 'Testing',
    requireEvidence: true,
  },
];

const releaseSummaryPhrases = [
  'promote the latest',
  'staging for integrated release validation',
  'production release validation',
  'keeps staging aligned',
  'keeps master aligned',
];

const requiredReleaseSections = ['Summary', 'Validation'];

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

function cleanSectionContent(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function getSectionContent(markdown, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    'im',
  );
  const match = markdown.match(pattern);

  return match ? match[1] : null;
}

function hasMeaningfulContent(lines, allowPhrases = []) {
  const normalizedLines = lines.map((line) => line.toLowerCase());

  if (
    allowPhrases.some((phrase) =>
      normalizedLines.some((line) => line.includes(phrase.toLowerCase())),
    )
  ) {
    return true;
  }

  return normalizedLines.some((line) => {
    if (line === 'n/a' || line === 'na') {
      return false;
    }

    if (line.startsWith('<!--')) {
      return false;
    }

    if (line === '```' || line === '``') {
      return false;
    }

    return line.replace(/[`*_#>-]/g, '').trim().length > 3;
  });
}

function validateTestingSection(lines) {
  const joined = lines.join('\n').toLowerCase();

  const hasVerificationEvidence =
    joined.includes('verification evidence actually run') &&
    !joined.includes('verification evidence actually run:\n- ``');

  const hasMeasurementEvidence =
    joined.includes('measurement evidence') &&
    !joined.includes('measurement evidence (required only for performance, cost, or bundle-size claims):\n- ``');

  return hasVerificationEvidence && hasMeasurementEvidence;
}

export function validatePullRequestBody(body) {
  const markdown = normalize(body);
  const failures = [];

  for (const section of requiredSections) {
    const content = getSectionContent(markdown, section.heading);

    if (content === null) {
      failures.push(`Missing required section: "${section.heading}"`);
      continue;
    }

    const lines = cleanSectionContent(content);

    if (section.requireEvidence) {
      if (!validateTestingSection(lines)) {
        failures.push(
          'Testing section must include concrete verification evidence and a measurement evidence line.',
        );
      }
      continue;
    }

    if (!hasMeaningfulContent(lines, section.allowPhrases)) {
      failures.push(`Section "${section.heading}" is present but incomplete.`);
    }
  }

  return failures;
}

function isReleasePromotionPullRequest(event) {
  const title = event.pull_request?.title ?? '';
  const headRef = event.pull_request?.head?.ref ?? '';
  const baseRef = event.pull_request?.base?.ref ?? '';

  if (!title.startsWith('Release:')) {
    return false;
  }

  return (
    (headRef === 'develop' && baseRef === 'staging') ||
    (headRef === 'staging' && baseRef === 'master')
  );
}

function validateReleasePullRequestBody(body) {
  const markdown = normalize(body);
  const lines = cleanSectionContent(markdown);

  if (lines.length === 0) {
    return ['Release PR body must explain the promotion scope.'];
  }

  const sectionFailures = [];

  for (const heading of requiredReleaseSections) {
    const content = getSectionContent(markdown, heading);

    if (content === null) {
      sectionFailures.push(`Missing required release section: "${heading}"`);
      continue;
    }

    const cleaned = cleanSectionContent(content);
    if (!hasMeaningfulContent(cleaned)) {
      sectionFailures.push(
        `Release section "${heading}" is present but incomplete.`,
      );
    }
  }

  if (sectionFailures.length > 0) {
    return sectionFailures;
  }

  const joined = lines.join('\n').toLowerCase();
  const hasLegacySummary = releaseSummaryPhrases.some((phrase) =>
    joined.includes(phrase),
  );

  return hasLegacySummary || requiredReleaseSections.every((heading) => getSectionContent(markdown, heading) !== null)
    ? []
    : [
        'Release PR body must summarize the promotion scope and validation performed.',
      ];
}

function parseArgs(argv) {
  const args = {
    bodyFile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--body-file' && argv[i + 1]) {
      args.bodyFile = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function loadBody({ bodyFile }) {
  if (bodyFile) {
    return readFileSync(bodyFile, 'utf8');
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    throw new Error('Provide --body-file <path> or set GITHUB_EVENT_PATH.');
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  return event.pull_request?.body ?? '';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const body = loadBody(args);
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath
    ? JSON.parse(readFileSync(eventPath, 'utf8'))
    : undefined;
  const failures =
    event && isReleasePromotionPullRequest(event)
      ? validateReleasePullRequestBody(body)
      : validatePullRequestBody(body);

  if (failures.length > 0) {
    console.error('PR governance check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('PR governance check passed.');
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(process.argv[1]).href;
  if (import.meta.url === entryUrl) {
    main();
  }
}
