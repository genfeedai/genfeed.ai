import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCENARIO_PATH = fileURLToPath(
  new URL('./scenarios/brand-os-review.json', import.meta.url),
);

const REQUIRED_RUN_RECORD_FIELDS = [
  'artifactPath',
  'generatedAt',
  'guidanceCommitSha',
  'guidanceMode',
  'inputsDigest',
  'modelProvider',
  'modelVersion',
  'promptDigest',
  'scenarioId',
  'scenarioVersion',
  'screenshotPath',
  'viewport',
] as const;

type DesignEvalComparison = {
  attemptsPerVariant: number;
  firstAttemptOnly: boolean;
  guidanceOnlyVariable: boolean;
  inputMutation: string;
  reviewOrder: string;
  sameModel: boolean;
  samePromptAndInputs: boolean;
  sameViewport: boolean;
};

type DesignEvalRubricCriterion = {
  blockingFailures: string[];
  id: string;
  label: string;
  scoreAnchors: Record<string, string>;
  weight: number;
};

export type DesignEvalScenario = {
  comparison: DesignEvalComparison;
  frozenPrompt: string;
  generator: {
    modelVersionField: string;
    providerField: string;
    selection: string;
  };
  guidance: {
    baseline: { mode: string; version: string };
    candidate: { mode: string; path: string; versionField: string };
  };
  id: string;
  mockInputs: Record<string, unknown>;
  objective: string;
  requiredRunRecordFields: string[];
  rubric: DesignEvalRubricCriterion[];
  scenarioVersion: string;
  schemaVersion: number;
  title: string;
  viewport: {
    colorScheme: string;
    deviceScaleFactor: number;
    height: number;
    width: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  failures: string[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    failures.push(`${path} must be a non-empty string`);
  }
}

function validateComparison(comparison: unknown, failures: string[]): void {
  if (!isRecord(comparison)) {
    failures.push('comparison must be an object');
    return;
  }

  const trueInvariants = [
    'firstAttemptOnly',
    'guidanceOnlyVariable',
    'sameModel',
    'samePromptAndInputs',
    'sameViewport',
  ] as const;

  for (const invariant of trueInvariants) {
    if (comparison[invariant] !== true) {
      failures.push(`comparison.${invariant} must be true`);
    }
  }

  if (comparison.attemptsPerVariant !== 1) {
    failures.push('comparison.attemptsPerVariant must be 1');
  }
  if (comparison.inputMutation !== 'forbidden') {
    failures.push('comparison.inputMutation must be forbidden');
  }
  if (comparison.reviewOrder !== 'blind-shuffled') {
    failures.push('comparison.reviewOrder must be blind-shuffled');
  }
}

function validateRunRecordFields(value: unknown, failures: string[]): void {
  if (!Array.isArray(value)) {
    failures.push('requiredRunRecordFields must be an array');
    return;
  }

  for (const field of REQUIRED_RUN_RECORD_FIELDS) {
    if (!value.includes(field)) {
      failures.push(`requiredRunRecordFields must include ${field}`);
    }
  }
}

function validateRubric(value: unknown, failures: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push('rubric must contain at least one criterion');
    return;
  }

  const ids = new Set<string>();
  let totalWeight = 0;

  value.forEach((criterion, index) => {
    const prefix = `rubric[${index}]`;
    if (!isRecord(criterion)) {
      failures.push(`${prefix} must be an object`);
      return;
    }

    requireNonEmptyString(criterion.id, `${prefix}.id`, failures);
    requireNonEmptyString(criterion.label, `${prefix}.label`, failures);

    if (typeof criterion.id === 'string') {
      if (ids.has(criterion.id)) {
        failures.push(`${prefix}.id must be unique`);
      }
      ids.add(criterion.id);
    }

    if (
      typeof criterion.weight !== 'number' ||
      !Number.isFinite(criterion.weight) ||
      criterion.weight <= 0
    ) {
      failures.push(`${prefix}.weight must be a positive number`);
    } else {
      totalWeight += criterion.weight;
    }

    if (!isRecord(criterion.scoreAnchors)) {
      failures.push(`${prefix}.scoreAnchors must be an object`);
    } else {
      for (const score of ['0', '1', '2']) {
        requireNonEmptyString(
          criterion.scoreAnchors[score],
          `${prefix}.scoreAnchors.${score}`,
          failures,
        );
      }
    }

    if (
      !Array.isArray(criterion.blockingFailures) ||
      criterion.blockingFailures.some(
        (failure) => typeof failure !== 'string' || failure.trim().length === 0,
      )
    ) {
      failures.push(
        `${prefix}.blockingFailures must contain non-empty strings`,
      );
    }
  });

  if (totalWeight !== 100) {
    failures.push(`rubric weights must total 100, received ${totalWeight}`);
  }
}

export function validateDesignEvalScenario(input: unknown): string[] {
  const failures: string[] = [];
  if (!isRecord(input)) {
    return ['scenario must be an object'];
  }

  if (input.schemaVersion !== 1) {
    failures.push('schemaVersion must be 1');
  }
  for (const field of [
    'id',
    'scenarioVersion',
    'title',
    'objective',
    'frozenPrompt',
  ]) {
    requireNonEmptyString(input[field], field, failures);
  }

  if (
    !isRecord(input.mockInputs) ||
    Object.keys(input.mockInputs).length === 0
  ) {
    failures.push('mockInputs must be a non-empty object');
  }

  if (!isRecord(input.viewport)) {
    failures.push('viewport must be an object');
  } else {
    for (const dimension of ['width', 'height', 'deviceScaleFactor']) {
      const value = input.viewport[dimension];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        failures.push(`viewport.${dimension} must be a positive number`);
      }
    }
    requireNonEmptyString(
      input.viewport.colorScheme,
      'viewport.colorScheme',
      failures,
    );
  }

  if (!isRecord(input.generator)) {
    failures.push('generator must be an object');
  } else {
    if (input.generator.selection !== 'record-at-run-time') {
      failures.push('generator.selection must be record-at-run-time');
    }
    if (input.generator.providerField !== 'modelProvider') {
      failures.push('generator.providerField must be modelProvider');
    }
    if (input.generator.modelVersionField !== 'modelVersion') {
      failures.push('generator.modelVersionField must be modelVersion');
    }
  }

  if (!isRecord(input.guidance)) {
    failures.push('guidance must be an object');
  } else {
    const baseline = input.guidance.baseline;
    const candidate = input.guidance.candidate;
    if (
      !isRecord(baseline) ||
      baseline.mode !== 'none' ||
      baseline.version !== 'none'
    ) {
      failures.push('guidance.baseline must use mode and version none');
    }
    if (
      !isRecord(candidate) ||
      candidate.mode !== 'file' ||
      candidate.path !== 'DESIGN.md' ||
      candidate.versionField !== 'guidanceCommitSha'
    ) {
      failures.push(
        'guidance.candidate must load DESIGN.md and record guidanceCommitSha',
      );
    }
  }

  validateComparison(input.comparison, failures);
  validateRunRecordFields(input.requiredRunRecordFields, failures);
  validateRubric(input.rubric, failures);

  return failures;
}

export function loadDesignEvalScenario(
  filePath = DEFAULT_SCENARIO_PATH,
): DesignEvalScenario {
  return JSON.parse(readFileSync(filePath, 'utf8')) as DesignEvalScenario;
}
