import {
  type B2bPlaybook,
  type B2bPlaybookAttachment,
  type B2bReferenceRole,
  b2bPlaybookAttachmentSchema,
  b2bPlaybookSchema,
} from '../api-types/contracts/b2b-playbook.contract';

export type B2bPlaybookCompileErrorCode =
  | 'INVALID_PLAYBOOK'
  | 'INVALID_ATTACHMENT'
  | 'MODEL_NOT_ALLOWED'
  | 'MISSING_REQUIRED_SLOT';

export class B2bPlaybookCompileError extends Error {
  constructor(
    public readonly code: B2bPlaybookCompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'B2bPlaybookCompileError';
  }
}

export type CompileB2bPlaybookInput = {
  playbook: B2bPlaybook;
  attachments: readonly B2bPlaybookAttachment[];
  model: string;
  topic: string;
  brandName?: string;
  /** Hooks from the pattern playbook, so text and media agree on the angle. */
  patternHooks?: readonly string[];
};

export type CompiledB2bReferenceRole = {
  token: string;
  slotKey: string;
  role: B2bReferenceRole;
  ingredientId?: string;
};

export type CompiledB2bPlaybook = {
  prompt: string;
  aspectRatio: string;
  mediaType: B2bPlaybook['mediaType'];
  durationSeconds?: number;
  referenceRoles: CompiledB2bReferenceRole[];
};

const MAX_PATTERN_HOOKS = 5;
const TOKEN_PREFIX = {
  audio: 'Audio',
  image: 'Image',
  video: 'Video',
} as const;

/**
 * Pure compilation. Each attached asset becomes an `@ImageN` / `@VideoN` /
 * `@AudioN` token with the role of the slot it fills, so the provider payload
 * names what every reference is for.
 */
export function compileB2bPlaybook(
  input: CompileB2bPlaybookInput,
): CompiledB2bPlaybook {
  const parsed = b2bPlaybookSchema.safeParse(input.playbook);
  if (!parsed.success) {
    throw new B2bPlaybookCompileError(
      'INVALID_PLAYBOOK',
      'The playbook does not match its schema.',
    );
  }
  const playbook = parsed.data;
  if (!playbook.allowedModels.includes(input.model)) {
    throw new B2bPlaybookCompileError(
      'MODEL_NOT_ALLOWED',
      `${input.model} is not allowed for ${playbook.key}.`,
    );
  }
  const attachments = b2bPlaybookAttachmentSchema
    .array()
    .safeParse(input.attachments);
  if (!attachments.success) {
    throw new B2bPlaybookCompileError(
      'INVALID_ATTACHMENT',
      'An attachment does not match its schema.',
    );
  }

  const filled = new Set<string>();
  const counts = { audio: 0, image: 0, video: 0 };
  const referenceRoles: CompiledB2bReferenceRole[] = [];
  for (const attachment of attachments.data) {
    const slot = playbook.referenceSlots.find(
      (candidate) => candidate.key === attachment.slotKey,
    );
    if (!slot || slot.kind !== attachment.kind || filled.has(slot.key)) {
      throw new B2bPlaybookCompileError(
        'INVALID_ATTACHMENT',
        `${attachment.slotKey} is not an open ${attachment.kind} slot.`,
      );
    }
    filled.add(slot.key);
    counts[slot.kind] += 1;
    referenceRoles.push({
      ...(attachment.ingredientId
        ? { ingredientId: attachment.ingredientId }
        : {}),
      role: slot.role,
      slotKey: slot.key,
      token: `@${TOKEN_PREFIX[slot.kind]}${counts[slot.kind]}`,
    });
  }
  const missing = playbook.referenceSlots
    .filter((slot) => slot.isRequired && !filled.has(slot.key))
    .map((slot) => slot.key);
  if (missing.length > 0) {
    throw new B2bPlaybookCompileError(
      'MISSING_REQUIRED_SLOT',
      `Fill the required reference slots: ${missing.join(', ')}.`,
    );
  }

  const hooks = (input.patternHooks ?? [])
    .map((hook) => hook.trim())
    .filter(Boolean)
    .slice(0, MAX_PATTERN_HOOKS);
  const durationSeconds = playbook.shots.reduce(
    (total, shot) => total + (shot.durationSeconds ?? 0),
    0,
  );
  const sections = [
    `## Format\n${playbook.label}${input.brandName ? ` for ${input.brandName}` : ''}: ${input.topic.trim()}`,
    `## Hook\n${playbook.hookFormula}${
      hooks.length > 0
        ? `\nHook patterns that work for this audience:\n${hooks.map((hook) => `- ${hook}`).join('\n')}`
        : ''
    }`,
    `## Shots\n${playbook.shots
      .map(
        (shot, index) =>
          `${index + 1}. ${shot.title}${shot.durationSeconds ? ` (${shot.durationSeconds}s)` : ''}: ${shot.direction}`,
      )
      .join('\n')}`,
  ];
  if (referenceRoles.length > 0) {
    sections.push(
      `## Reference Material Roles\n${referenceRoles
        .map((reference) => `${reference.token}: ${reference.role}`)
        .join('\n')}`,
    );
  }
  sections.push(
    `## Check\n${playbook.evaluationCriteria.map((criterion) => `- ${criterion}`).join('\n')}`,
  );

  return {
    aspectRatio: playbook.aspectRatio,
    mediaType: playbook.mediaType,
    ...(durationSeconds > 0 ? { durationSeconds } : {}),
    prompt: sections.join('\n\n'),
    referenceRoles,
  };
}
