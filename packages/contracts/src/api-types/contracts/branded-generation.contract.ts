/** Shape validation never establishes authority, real evidence or provider eligibility. */
import { z } from 'zod';
import { ContentLearningArm } from '../../enums/content-learning.enum';
import {
  learningContractHashSchema as hash,
  learningContractIdSchema as id,
  learningDescriptorHashSchema,
  learningFormatSchema,
  learningGenerationReceiptSchema,
  learningObjectiveSchema,
  learningContractRevisionSchema as revision,
  learningContractVersionSchema as version,
} from './content-learning-generation.contract';

const label = z.string().min(1).max(512);
const text = z.string().max(16000);
const code = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9_.:-]*$/);
const date = z.iso.datetime();
const ids = z
  .array(id)
  .max(256)
  .refine((v) => new Set(v).size === v.length, 'Duplicate IDs');
const refs = ids.min(1);
function issue(ctx: z.RefinementCtx, message: string) {
  ctx.addIssue({ code: 'custom', message });
}
function bounded<T extends z.ZodType>(schema: T, limit: number) {
  return schema.refine(
    (v) => new TextEncoder().encode(JSON.stringify(v)).byteLength <= limit,
    `Serialized size exceeds ${limit} bytes`,
  );
}
function keyed<T extends z.ZodType<{ id: string }>>(schema: T, max: number) {
  return z
    .array(schema)
    .max(max)
    .refine(
      (v) => new Set(v.map((x) => x.id)).size === v.length,
      'Duplicate keyed IDs',
    );
}
const prompt = z
  .string()
  .refine(
    (v) => new TextEncoder().encode(v).byteLength <= 65536,
    'Prompt exceeds byte limit',
  );
const sourceUrl = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        ['http:', 'https:'].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.hash &&
        !Array.from(u.searchParams.keys()).some((k) =>
          /(token|secret|signature|credential|password|api[-_]?key|authorization|x-amz|x-goog)/i.test(
            k,
          ),
        )
      );
    } catch {
      return false;
    }
  }, 'Unsafe provenance URL');
export const brandGenerationDiagnosticSchema = z.strictObject({
  code,
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string().min(1).max(2000),
  ruleId: id.optional(),
  evidenceIds: ids.optional(),
});
const diagnostics = z.array(brandGenerationDiagnosticSchema).max(128);
export const brandRuleEvidenceV1Schema = z.strictObject({
  id,
  sourceType: z.enum(['manual', 'website', 'knowledge', 'asset', 'system']),
  label,
  sourceId: id.optional(),
  sourceVersion: version.optional(),
  url: sourceUrl.optional(),
  excerpt: z.string().max(4000).optional(),
  contentHash: hash.optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export const brandGenerationMediaKindV1Schema = z.enum([
  'text',
  'image',
  'video',
]);
const applicableMediaKinds = z
  .array(brandGenerationMediaKindV1Schema)
  .min(1)
  .max(3)
  .refine((v) => new Set(v).size === v.length, 'Duplicate media kinds');
export const brandFactRuleV1Schema = z
  .strictObject({
    id,
    kind: z.enum(['statement', 'price', 'metric', 'testimonial']),
    subject: label,
    predicate: label,
    value: z.union([text, z.number(), z.boolean()]),
    unit: label.optional(),
    qualifier: text.optional(),
    attributedTo: label.optional(),
    evidenceIds: refs,
    required: z.boolean(),
    appliesToMediaKinds: applicableMediaKinds.optional(),
    match: z.enum(['literal', 'semantic']),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'testimonial' && !v.attributedTo)
      issue(ctx, 'Testimonial requires attribution');
    if (v.kind === 'price' && !v.unit)
      issue(ctx, 'Price requires currency unit');
  });
export const brandPaletteRuleV1Schema = z.strictObject({
  id,
  color: z.string().regex(/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/),
  usage: label,
  required: z.boolean(),
  appliesToMediaKinds: applicableMediaKinds.optional(),
  evidenceIds: refs,
});
export const brandTypographyRuleV1Schema = z
  .strictObject({
    id,
    role: label,
    family: label,
    weight: z.number().int().min(100).max(900),
    style: z.enum(['normal', 'italic', 'oblique']),
    fontAssetReferenceId: id.optional(),
    runtimeFontId: id.optional(),
    availability: z.enum([
      'owned_asset',
      'verified_runtime',
      'unavailable',
      'unknown',
    ]),
    required: z.boolean(),
    appliesToMediaKinds: applicableMediaKinds.optional(),
    evidenceIds: refs,
  })
  .superRefine((v, ctx) => {
    if (v.availability === 'owned_asset' && !v.fontAssetReferenceId)
      issue(ctx, 'Owned font requires asset reference');
    if (v.availability === 'verified_runtime' && !v.runtimeFontId)
      issue(ctx, 'Verified font requires runtime identity');
  });
export const brandTextRuleV1Schema = z.strictObject({
  id,
  text,
  match: z.enum(['literal', 'semantic']),
  required: z.boolean(),
  appliesToMediaKinds: applicableMediaKinds.optional(),
  evidenceIds: refs,
});
export const brandExampleRuleV1Schema = z.strictObject({
  id,
  polarity: z.enum(['positive', 'negative']),
  text,
  evidenceIds: refs,
});
const literalId = id.refine(
  (value) => value.startsWith('literal:') && value.length > 'literal:'.length,
  'Literal ID requires literal: prefix and nonempty suffix',
);
const literalText = z
  .string()
  .min(1)
  .max(4000)
  .refine(
    (value) =>
      /\S/.test(value) &&
      Array.from(value).every((char) => {
        const point = char.codePointAt(0) ?? 0;
        return (
          [9, 10, 13].includes(point) ||
          (point > 31 && (point < 127 || point > 159))
        );
      }),
    'Wording must contain nonwhitespace and no forbidden controls',
  );
const literalCommon = { id: literalId, text: literalText, evidenceIds: refs };
export const brandApprovedLiteralV1Schema = z.discriminatedUnion('kind', [
  z.strictObject({ ...literalCommon, kind: z.literal('fact'), factRuleId: id }),
  z.strictObject({ ...literalCommon, kind: z.literal('approved_copy') }),
]);
export const brandAssetTextCoverageV1Schema = z
  .strictObject({
    kind: z.enum(['none', 'approved_literals']),
    literalIds: z
      .array(literalId)
      .max(128)
      .refine(
        (values) => new Set(values).size === values.length,
        'Duplicate literal IDs',
      ),
    evidenceIds: refs,
  })
  .superRefine((value, ctx) => {
    if (
      value.kind === 'none'
        ? value.literalIds.length !== 0
        : value.literalIds.length === 0
    )
      issue(ctx, 'Text coverage kind must match literal inventory');
  });
export const brandAssetReferenceV1Schema = z
  .strictObject({
    id,
    assetId: id,
    role: z.enum(['logo', 'banner', 'product', 'style', 'font']),
    contentHash: hash.optional(),
    mimeType: label.optional(),
    required: z.boolean(),
    appliesToMediaKinds: applicableMediaKinds.optional(),
    evidenceIds: refs,
    textCoverage: brandAssetTextCoverageV1Schema.optional(),
  })
  .superRefine((asset, ctx) => {
    if (asset.textCoverage && (asset.role === 'font' || !asset.contentHash))
      issue(
        ctx,
        'Asset text coverage requires a nonfont asset with content hash',
      );
  });
export const brandGenerationRulesV1Schema = bounded(
  z
    .strictObject({
      schemaVersion: z.literal(1),
      evidence: keyed(brandRuleEvidenceV1Schema, 256),
      facts: keyed(brandFactRuleV1Schema, 128),
      palette: keyed(brandPaletteRuleV1Schema, 32),
      typography: keyed(brandTypographyRuleV1Schema, 16),
      mandatory: keyed(brandTextRuleV1Schema, 64),
      avoid: keyed(brandTextRuleV1Schema, 64),
      examples: keyed(brandExampleRuleV1Schema, 32),
      assets: keyed(brandAssetReferenceV1Schema, 64),
      approvedLiterals: keyed(brandApprovedLiteralV1Schema, 128).optional(),
    })
    .superRefine((v, ctx) => {
      const allRules = [
        ...v.facts,
        ...v.palette,
        ...v.typography,
        ...v.mandatory,
        ...v.avoid,
        ...v.examples,
        ...v.assets,
      ];
      if (new Set(allRules.map((rule) => rule.id)).size !== allRules.length)
        issue(ctx, 'Rule IDs must be globally unique');
      const evidence = new Set(v.evidence.map((e) => e.id));
      for (const row of [
        ...v.facts,
        ...v.palette,
        ...v.typography,
        ...v.mandatory,
        ...v.avoid,
        ...v.examples,
        ...v.assets,
        ...(v.approvedLiterals ?? []),
      ])
        for (const ref of row.evidenceIds)
          if (!evidence.has(ref)) issue(ctx, `Unresolved evidence: ${ref}`);
      const literalIds = new Set(
        (v.approvedLiterals ?? []).map((literal) => literal.id),
      );
      const otherIds = new Set([
        ...allRules.map((rule) => rule.id),
        ...evidence,
      ]);
      for (const literal of v.approvedLiterals ?? []) {
        if (otherIds.has(literal.id))
          issue(ctx, 'Literal IDs must not collide with rule or evidence IDs');
        if (literal.kind !== 'fact') continue;
        const fact = v.facts.find((row) => row.id === literal.factRuleId);
        if (!fact) issue(ctx, 'Unresolved literal fact');
        else if (
          fact.evidenceIds.some((ref) => !literal.evidenceIds.includes(ref))
        )
          issue(ctx, 'Literal must retain all linked fact evidence');
      }
      for (const asset of v.assets) {
        for (const ref of asset.textCoverage?.literalIds ?? [])
          if (!literalIds.has(ref)) issue(ctx, 'Unresolved asset text literal');
        for (const ref of asset.textCoverage?.evidenceIds ?? [])
          if (!evidence.has(ref)) issue(ctx, 'Unresolved asset text evidence');
      }
      for (const font of v.typography)
        if (
          font.fontAssetReferenceId &&
          !v.assets.some(
            (a) => a.id === font.fontAssetReferenceId && a.role === 'font',
          )
        )
          issue(ctx, 'Unresolved font asset');
    }),
  250000,
);
export const brandIdentitySnapshotV1Schema = bounded(
  z
    .strictObject({
      schemaVersion: z.literal(1),
      organizationId: id,
      brandId: id,
      revisionId: id,
      revisionVersion: version,
      approval: z.enum(['approved', 'provisional']),
      resolvedAt: date,
      contentHash: hash,
      identity: z.strictObject({
        name: label,
        description: text.optional(),
        positioning: text.optional(),
        language: label.optional(),
      }),
      voice: z.strictObject({
        tone: text.optional(),
        style: text.optional(),
        audience: z.array(label).max(128),
        values: z.array(label).max(128),
        messagingPillars: z.array(text).max(128),
        avoid: z.array(text).max(64),
        sample: text.optional(),
      }),
      generationRules: brandGenerationRulesV1Schema,
      diagnostics,
    })
    .superRefine((v, ctx) => {
      const evidence = new Set(v.generationRules.evidence.map((e) => e.id));
      const rules = new Set(
        [
          ...v.generationRules.facts,
          ...v.generationRules.palette,
          ...v.generationRules.typography,
          ...v.generationRules.mandatory,
          ...v.generationRules.avoid,
          ...v.generationRules.examples,
          ...v.generationRules.assets,
        ].map((r) => r.id),
      );
      for (const d of v.diagnostics) {
        if (d.ruleId && !rules.has(d.ruleId))
          issue(ctx, 'Unresolved diagnostic rule');
        for (const ref of d.evidenceIds ?? [])
          if (!evidence.has(ref)) issue(ctx, 'Unresolved diagnostic evidence');
      }
    }),
  250000,
);
const mode = z.enum(['approved_brand', 'provisional_brand', 'raw']);
const surface = z.enum([
  'onboarding',
  'studio',
  'ui',
  'agent',
  'api',
  'mcp',
  'workflow',
  'schedule',
  'batch',
  'desktop_cloud',
  'desktop_local',
]);
const contentType = z.enum([
  'ad-creative',
  'article',
  'email',
  'image',
  'newsletter',
  'post',
  'reply',
  'script',
  'thread',
  'ugc',
  'video',
  'video-script',
]);
function depth(v: unknown, d = 0): number {
  return v === null || typeof v !== 'object'
    ? d
    : Math.max(d, ...Object.values(v).map((x) => depth(x, d + 1)));
}
const settings = bounded(
  z
    .record(z.string(), z.json())
    .refine((v) => depth(v) <= 8, 'Settings nesting exceeds eight'),
  16384,
);
const requestLinks = {
  parentRequestId: id.optional(),
  runId: id.optional(),
  workflowExecutionId: id.optional(),
  generationId: id.optional(),
};
export const brandedGenerationInputV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    actorId: id,
    organizationId: id,
    brandId: id,
    requestKey: id,
    candidateIndex: revision,
    surface,
    contentType,
    format: learningFormatSchema,
    mode,
    originalPrompt: prompt,
    provider: id,
    model: id,
    generationParameters: settings,
    platform: label.optional(),
    objective: learningObjectiveSchema.optional(),
    destinationCredentialId: id.optional(),
    draftRevisionId: id.optional(),
    knowledgeSourceIds: ids,
    knowledgeSpaceIds: ids,
    ...requestLinks,
  })
  .superRefine((v, ctx) => {
    if (
      v.mode === 'provisional_brand'
        ? !v.draftRevisionId
        : v.draftRevisionId !== undefined
    )
      issue(ctx, 'Draft revision required only for provisional mode');
  });
export const brandGenerationLayerVersionV1Schema = z.union([
  version,
  id.refine((value) => value.trim().length > 0, 'Version must not be blank'),
]);
export const brandGenerationLayerReceiptV1Schema = z
  .strictObject({
    kind: z.enum([
      'identity',
      'facts',
      'knowledge',
      'assets',
      'skill',
      'harness_profile',
      'pack',
      'brand_feedback',
      'global_release',
      'account_policy',
    ]),
    id: id.optional(),
    version: brandGenerationLayerVersionV1Schema.optional(),
    contentHash: hash.optional(),
    status: z.enum([
      'applied',
      'not_applicable',
      'unavailable',
      'skipped',
      'truncated',
      'failed',
      'incompatible',
    ]),
    reasonCode: code.optional(),
    evidenceIds: ids,
    omittedIds: ids,
    usedBytes: revision.optional(),
    budgetBytes: revision.optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.status === 'applied' &&
      (!v.id || (!v.version && !v.contentHash) || v.omittedIds.length)
    )
      issue(
        ctx,
        'Applied layer needs identity and version/hash without omissions',
      );
    if (!['applied', 'not_applicable'].includes(v.status) && !v.reasonCode)
      issue(ctx, 'Inactive layer requires reason');
    if (
      v.status === 'truncated' &&
      (!v.omittedIds.length || v.budgetBytes === undefined)
    )
      issue(ctx, 'Truncation requires omissions and budget');
  });
const layers = z
  .array(brandGenerationLayerReceiptV1Schema)
  .max(256)
  .refine((v) => {
    const keys = v
      .filter((x) => x.id !== undefined)
      .map((x) => `${x.kind}:${x.id}`);
    return new Set(keys).size === keys.length;
  }, 'Duplicate layer identities');
export const brandFeedbackApplicationV1Schema = z
  .strictObject({
    status: z.enum([
      'applied',
      'not_applicable',
      'unavailable',
      'skipped',
      'incompatible',
    ]),
    reasonCode: code.optional(),
    profileId: id.optional(),
    profileVersion: version.optional(),
    sourceIds: ids,
    contributionHash: hash.optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.status === 'applied' &&
      (!v.profileId || !v.profileVersion || !v.contributionHash)
    )
      issue(ctx, 'Applied feedback needs profile contribution');
    if (!['applied', 'not_applicable'].includes(v.status) && !v.reasonCode)
      issue(ctx, 'Inactive feedback requires reason');
  });
export const globalLearningApplicationV1Schema = z
  .strictObject({
    status: z.enum([
      'applied',
      'not_applicable',
      'unavailable',
      'skipped',
      'incompatible',
    ]),
    reasonCode: code.optional(),
    releaseId: id.optional(),
    releaseRevision: version.optional(),
    policyId: id.optional(),
    policyVersion: version.optional(),
    descriptorHash: learningDescriptorHashSchema.optional(),
    contributionHash: hash.optional(),
    brandPreferenceRevision: revision.optional(),
    stage: z.enum(['canary', 'limited', 'stable']).optional(),
    scope: z.strictObject({
      platform: label.optional(),
      format: learningFormatSchema,
      objective: learningObjectiveSchema,
    }),
    revalidatedAt: date.optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.status === 'applied' &&
      (!v.releaseId ||
        !v.releaseRevision ||
        !v.policyId ||
        !v.descriptorHash ||
        !v.contributionHash ||
        v.brandPreferenceRevision === undefined ||
        !v.stage ||
        !v.revalidatedAt ||
        !v.scope.platform)
    )
      issue(
        ctx,
        'Applied global contribution needs immutable scope/release provenance',
      );
    if (!['applied', 'not_applicable'].includes(v.status) && !v.reasonCode)
      issue(ctx, 'Inactive global contribution requires reason');
  });
export const brandLearningApplicationV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    brandFeedback: brandFeedbackApplicationV1Schema,
    global: globalLearningApplicationV1Schema,
    privateAccount: learningGenerationReceiptSchema,
  })
  .superRefine((v, ctx) => {
    if (!v.privateAccount.application)
      issue(ctx, 'New embedding requires explicit application');
    if (
      v.privateAccount.mode === 'no_destination' &&
      (v.privateAccount.application?.status !== 'unavailable' ||
        (v.global.status === 'applied' && v.global.stage !== 'stable'))
    )
      issue(
        ctx,
        'Accountless serving requires unavailable private and stable global',
      );
    if (
      v.privateAccount.application?.sharedReleaseApplied &&
      (v.global.status !== 'applied' ||
        v.privateAccount.sharedReleaseId !== v.global.releaseId ||
        v.privateAccount.sharedReleaseRevision !== v.global.releaseRevision ||
        v.privateAccount.sharedPolicyId !== v.global.policyId)
    )
      issue(ctx, 'Shared attribution must match global proof');
  });
function checkMode(
  v: {
    mode: z.infer<typeof mode>;
    snapshot: z.infer<typeof brandIdentitySnapshotV1Schema> | null;
    layers: z.infer<typeof layers>;
    learning: z.infer<typeof brandLearningApplicationV1Schema> | null;
  },
  ctx: z.RefinementCtx,
  allowMissingSnapshot = false,
) {
  if (v.mode === 'raw') {
    if (
      v.snapshot !== null ||
      v.layers.some(
        (x) =>
          x.status === 'applied' &&
          [
            'identity',
            'brand_feedback',
            'global_release',
            'account_policy',
          ].includes(x.kind),
      ) ||
      (v.learning &&
        (v.learning.brandFeedback.status === 'applied' ||
          v.learning.global.status === 'applied' ||
          v.learning.privateAccount.application?.status === 'applied' ||
          v.learning.privateAccount.application?.sharedReleaseApplied))
    )
      issue(ctx, 'Raw mode cannot apply identity/learning');
  } else if (v.snapshot) {
    if (
      v.snapshot.approval !==
      (v.mode === 'approved_brand' ? 'approved' : 'provisional')
    )
      issue(ctx, 'Branded mode requires matching approval');
  } else {
    if (!allowMissingSnapshot)
      issue(ctx, 'Resolved branded mode requires snapshot');
    if (
      v.layers.some(
        (layer) => layer.kind === 'identity' && layer.status === 'applied',
      ) ||
      (v.learning &&
        (v.learning.brandFeedback.status === 'applied' ||
          v.learning.global.status === 'applied' ||
          v.learning.privateAccount.application?.status === 'applied' ||
          v.learning.privateAccount.application?.privatePolicyApplied ||
          v.learning.privateAccount.application?.sharedReleaseApplied))
    )
      issue(ctx, 'Missing identity cannot claim applied identity/learning');
  }
}
const common = {
  schemaVersion: z.literal(1),
  mode,
  snapshot: brandIdentitySnapshotV1Schema.nullable(),
  layers,
  learning: brandLearningApplicationV1Schema,
  diagnostics,
};
export const brandedGenerationResolutionV1Schema = bounded(
  z
    .discriminatedUnion('status', [
      z.strictObject({
        ...common,
        status: z.literal('resolved'),
        compiledPrompt: prompt,
        originalPromptHash: hash,
      }),
      z.strictObject({
        ...common,
        status: z.literal('blocked'),
        reasonCode: code,
        diagnostics: diagnostics.min(1),
      }),
    ])
    .superRefine((v, ctx) => checkMode(v, ctx, v.status === 'blocked')),
  768000,
);
export const brandGenerationArtifactPartV1Schema = z.strictObject({
  id,
  version: id,
  contentHash: hash,
  role: z.enum(['primary', 'image', 'video', 'text', 'overlay', 'audio']),
});
export const brandGenerationArtifactV1Schema = z.strictObject({
  kind: z.enum(['post', 'ingredient', 'article', 'visual_export']),
  id,
  version: id,
  contentHash: hash,
  mediaKind: brandGenerationMediaKindV1Schema,
  parts: keyed(brandGenerationArtifactPartV1Schema, 256),
});
export const brandArtifactValidationCheckV1Schema = z
  .strictObject({
    ruleId: id,
    category: z.enum([
      'fact',
      'typography',
      'palette',
      'logo',
      'overlay',
      'product_identity',
      'avoid_rule',
      'mandatory_rule',
      'asset_reference',
    ]),
    severity: z.enum(['hard', 'soft']),
    result: z.enum([
      'pass',
      'fail',
      'unknown',
      'unsupported',
      'not_applicable',
    ]),
    method: z.enum([
      'exact_text',
      'deterministic_render',
      'asset_hash',
      'semantic_evaluator',
      'human_review',
      'capability',
    ]),
    evidenceIds: ids,
    evaluatorId: id.optional(),
    evaluatorVersion: version.optional(),
    reasonCode: code.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.result === 'pass') {
      if (!v.evidenceIds.length) issue(ctx, 'Pass requires evidence');
      if (
        v.method === 'semantic_evaluator' &&
        (!v.evaluatorId || !v.evaluatorVersion)
      )
        issue(ctx, 'Semantic pass requires evaluator identity/version');
      if (
        v.severity === 'hard' &&
        [
          'typography',
          'palette',
          'logo',
          'overlay',
          'product_identity',
          'asset_reference',
        ].includes(v.category) &&
        !['deterministic_render', 'asset_hash'].includes(v.method)
      )
        issue(ctx, 'Exact hard visual pass requires deterministic evidence');
    } else if (v.result !== 'not_applicable' && !v.reasonCode)
      issue(ctx, 'Non-pass requires reason');
  });
export const brandArtifactValidationReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  rubricVersion: version,
  snapshotHash: hash,
  artifactHash: hash,
  artifactId: id,
  artifactVersion: id,
  checkedAt: date,
  checks: z
    .array(brandArtifactValidationCheckV1Schema)
    .max(256)
    .refine(
      (v) => new Set(v.map((x) => x.ruleId)).size === v.length,
      'Duplicate check IDs',
    ),
  quality: z
    .strictObject({
      score: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1).nullable(),
      evaluatorId: id,
      evaluatorVersion: version,
      calibrationStatus: z.enum(['verified', 'unverified', 'unavailable']),
    })
    .nullable(),
  diagnostics,
});
export const brandPromptReferenceV1Schema = z
  .strictObject({
    contentHash: hash,
    snapshotId: id.optional(),
    retention: z.enum(['pending', 'retained', 'unavailable']),
    reasonCode: code.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.retention === 'retained' && !v.snapshotId)
      issue(ctx, 'Retained prompt needs snapshot');
    if (v.retention === 'unavailable' && !v.reasonCode)
      issue(ctx, 'Unavailable prompt needs reason');
    if (v.retention !== 'retained' && v.snapshotId)
      issue(ctx, 'Unretained prompt cannot claim snapshot');
  });
export const brandGenerationExecutionV1Schema = z.strictObject({
  provider: id,
  model: id,
  capabilityId: id.optional(),
  capabilityVersion: version.optional(),
  providerAttemptRef: id,
  dispatchClaimedAt: date,
  providerAcceptedAt: date.optional(),
  completedAt: date.optional(),
  result: z.enum(['pending', 'completed', 'failed', 'indeterminate']),
});
export const brandGenerationCostV1Schema = z
  .strictObject({
    id,
    stage: z.enum([
      'enhancement',
      'generation',
      'validation',
      'render',
      'settlement',
    ]),
    status: z.enum(['pending', 'known', 'unavailable']),
    ledgerId: id.optional(),
    credits: z.number().nonnegative().optional(),
    currency: label.optional(),
    amount: z.number().nonnegative().optional(),
    reasonCode: code.optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.status === 'known' &&
      (!v.ledgerId ||
        (v.credits === undefined && (!v.currency || v.amount === undefined)))
    )
      issue(ctx, 'Known cost requires authoritative ledger/amount');
    if (v.status === 'unavailable' && !v.reasonCode)
      issue(ctx, 'Unavailable cost requires reason');
    if (
      v.status !== 'known' &&
      (v.credits !== undefined ||
        v.currency !== undefined ||
        v.amount !== undefined)
    )
      issue(ctx, 'Unknown cost cannot substitute amounts');
  });
export const brandedGenerationReceiptV1Schema = bounded(
  z
    .strictObject({
      schemaVersion: z.literal(1),
      id,
      organizationId: id,
      brandId: id,
      actorId: id,
      requestKey: id,
      candidateIndex: revision,
      requestHash: hash,
      revision,
      state: z.enum([
        'created',
        'resolved',
        'dispatched',
        'checking',
        'ready',
        'needs_review',
        'blocked',
        'failed',
        'cancelled',
      ]),
      mode,
      surface,
      contentType,
      format: learningFormatSchema,
      platform: label.optional(),
      ...requestLinks,
      createdAt: date,
      updatedAt: date,
      snapshot: brandIdentitySnapshotV1Schema.nullable(),
      resolutionHash: hash.nullable(),
      layers,
      learning: brandLearningApplicationV1Schema.nullable(),
      prompts: z.strictObject({
        original: brandPromptReferenceV1Schema,
        enhanced: brandPromptReferenceV1Schema.nullable(),
        compiled: brandPromptReferenceV1Schema.nullable(),
      }),
      execution: brandGenerationExecutionV1Schema.nullable(),
      artifact: brandGenerationArtifactV1Schema.nullable(),
      validation: brandArtifactValidationReportV1Schema.nullable(),
      compliance: z.enum(['not_claimed', 'unverified', 'passed', 'failed']),
      diagnostics,
      costs: keyed(brandGenerationCostV1Schema, 64),
      budget: z.strictObject({
        version: z.literal('brand-enforcement-v1'),
        maximumGenerationAttempts: z.literal(1),
        automaticPaidRetries: z.literal(0),
        generationAttemptsUsed: z.union([z.literal(0), z.literal(1)]),
      }),
      isDeleted: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (
        v.snapshot &&
        (v.snapshot.organizationId !== v.organizationId ||
          v.snapshot.brandId !== v.brandId)
      )
        issue(ctx, 'Snapshot scope must match receipt');
      checkMode(v, ctx, true);
      if (
        v.state === 'created' &&
        (v.snapshot ||
          v.resolutionHash ||
          v.artifact ||
          v.validation ||
          v.execution ||
          v.learning ||
          v.layers.length)
      )
        issue(ctx, 'Created receipt cannot contain resolution/execution');
      if (
        [
          'resolved',
          'dispatched',
          'checking',
          'ready',
          'needs_review',
        ].includes(v.state) &&
        (!v.resolutionHash ||
          !v.learning ||
          !v.prompts.compiled ||
          (v.mode !== 'raw' && !v.snapshot))
      )
        issue(ctx, 'Resolved state requires complete resolution');
      if ((v.execution !== null) !== (v.budget.generationAttemptsUsed === 1))
        issue(ctx, 'Execution and attempt budget must agree');
      if (['created', 'resolved'].includes(v.state) && v.execution)
        issue(ctx, 'Pre-dispatch state cannot contain execution');
      if (
        ['dispatched', 'checking', 'ready', 'needs_review', 'failed'].includes(
          v.state,
        ) &&
        !v.execution
      )
        issue(ctx, 'Dispatched state requires execution');
      if (
        v.mode !== 'raw' &&
        v.execution &&
        (v.prompts.original.retention !== 'retained' ||
          v.prompts.compiled?.retention !== 'retained' ||
          (v.prompts.enhanced && v.prompts.enhanced.retention !== 'retained'))
      )
        issue(ctx, 'Strict branded execution requires retained prompts');
      if (v.artifact && v.execution?.result !== 'completed')
        issue(ctx, 'Artifact requires completed dispatch');
      if (
        ['checking', 'ready', 'needs_review'].includes(v.state) &&
        !v.artifact
      )
        issue(ctx, 'Checking/readiness requires artifact');
      if (
        v.validation &&
        (!v.artifact ||
          !v.snapshot ||
          v.validation.artifactHash !== v.artifact.contentHash ||
          v.validation.artifactId !== v.artifact.id ||
          v.validation.artifactVersion !== v.artifact.version ||
          v.validation.snapshotHash !== v.snapshot.contentHash)
      )
        issue(ctx, 'Validation must bind immutable snapshot/artifact');
      if (v.mode === 'raw' && v.compliance !== 'not_claimed')
        issue(ctx, 'Raw mode cannot claim compliance');
      if (v.state === 'ready' && v.mode === 'provisional_brand')
        issue(ctx, 'Provisional requires owner review');
      if (
        v.state === 'ready' &&
        v.mode !== 'raw' &&
        (!v.validation || v.compliance !== 'passed')
      )
        issue(ctx, 'Branded readiness requires validation');
      if (v.state === 'needs_review' && v.compliance !== 'unverified')
        issue(ctx, 'Review must remain unverified');
      if (
        v.compliance === 'passed' &&
        (v.state !== 'ready' || v.mode !== 'approved_brand' || !v.validation)
      )
        issue(ctx, 'Passed requires approved validated readiness');
      if (v.validation && v.snapshot) {
        const r = v.snapshot.generationRules;
        const mapped = [
          ...r.facts.map((rule) => ({ rule, category: 'fact' })),
          ...r.palette.map((rule) => ({ rule, category: 'palette' })),
          ...r.typography.map((rule) => ({ rule, category: 'typography' })),
          ...r.mandatory.map((rule) => ({ rule, category: 'mandatory_rule' })),
          ...r.avoid.map((rule) => ({ rule, category: 'avoid_rule' })),
          ...r.assets.map((rule) => ({
            rule,
            category:
              rule.role === 'logo'
                ? 'logo'
                : rule.role === 'font'
                  ? 'typography'
                  : rule.role === 'product'
                    ? 'product_identity'
                    : 'asset_reference',
          })),
        ];
        const applicable = (rule: (typeof mapped)[number]['rule']) =>
          rule.appliesToMediaKinds === undefined ||
          (v.artifact !== null &&
            rule.appliesToMediaKinds.includes(v.artifact.mediaKind));
        for (const check of v.validation.checks) {
          const origin = mapped.find((row) => row.rule.id === check.ruleId);
          if (!origin) continue;
          if (check.category !== origin.category)
            issue(ctx, 'Check category must match canonical rule origin');
          if (!v.artifact) {
            issue(ctx, 'Validation must bind immutable snapshot/artifact');
            continue;
          }
          if (!applicable(origin.rule)) {
            if (
              check.result !== 'not_applicable' ||
              check.method !== 'capability' ||
              check.reasonCode !== 'rule_media_not_applicable' ||
              check.severity !== (origin.rule.required ? 'hard' : 'soft')
            )
              issue(
                ctx,
                'Excluded rule requires canonical media applicability check',
              );
            continue;
          }
          if (
            check.severity === 'hard' &&
            check.result === 'pass' &&
            'match' in origin.rule
          ) {
            const methods =
              origin.rule.match === 'literal'
                ? [
                    v.artifact?.mediaKind === 'text'
                      ? 'exact_text'
                      : 'deterministic_render',
                  ]
                : [
                    'exact_text',
                    'deterministic_render',
                    'semantic_evaluator',
                    'human_review',
                  ];
            if (!methods.includes(check.method))
              issue(
                ctx,
                'Hard text-rule method must match literal/semantic rule and artifact medium',
              );
          }
        }
        const fail = v.validation.checks.some(
          (check) => check.severity === 'hard' && check.result === 'fail',
        );
        const unknown = v.validation.checks.some(
          (check) =>
            check.severity === 'hard' &&
            ['unknown', 'unsupported'].includes(check.result),
        );
        const pass = mapped
          .filter((row) => row.rule.required && applicable(row.rule))
          .every((row) =>
            v.validation?.checks.some(
              (check) =>
                check.ruleId === row.rule.id &&
                check.category === row.category &&
                check.severity === 'hard' &&
                check.result === 'pass',
            ),
          );
        if (fail && (v.state !== 'blocked' || v.compliance !== 'failed'))
          issue(ctx, 'Any hard failure blocks');
        if (
          (v.compliance === 'passed' || v.state === 'ready') &&
          (!pass || unknown)
        )
          issue(
            ctx,
            'Missing/unknown required or additional hard checks prevent readiness',
          );
      }
      if (v.compliance === 'failed' && (!v.validation || v.state !== 'blocked'))
        issue(ctx, 'Failed compliance requires blocked report');
      if (v.state === 'failed' && v.execution?.result !== 'failed')
        issue(ctx, 'Failed requires confirmed provider failure');
      if (v.execution?.result === 'indeterminate' && v.state !== 'blocked')
        issue(ctx, 'Unknown provider result blocks without retry');
    }),
  768000,
);
export const learningGenerationResolutionInputV1Schema = z.strictObject({
  scope: z.strictObject({
    organizationId: id,
    brandId: id,
    credentialId: id.optional(),
  }),
  requestIdentity: z.strictObject({
    requestKey: id,
    candidateIndex: revision,
    ...requestLinks,
  }),
  format: learningFormatSchema,
  platform: label.optional(),
  objective: learningObjectiveSchema.optional(),
  originalPromptHash: hash,
  hardConstraints: z.strictObject({
    snapshotHash: hash,
    compatible: z.boolean(),
    excludedArmIds: z
      .array(z.enum(ContentLearningArm))
      .max(3)
      .refine((v) => new Set(v).size === v.length, 'Duplicate excluded arms'),
  }),
});
export type BrandGenerationDiagnostic = z.infer<
  typeof brandGenerationDiagnosticSchema
>;
export type BrandRuleEvidenceV1 = z.infer<typeof brandRuleEvidenceV1Schema>;
export type BrandGenerationMediaKindV1 = z.infer<
  typeof brandGenerationMediaKindV1Schema
>;
export type BrandFactRuleV1 = z.infer<typeof brandFactRuleV1Schema>;
export type BrandPaletteRuleV1 = z.infer<typeof brandPaletteRuleV1Schema>;
export type BrandTypographyRuleV1 = z.infer<typeof brandTypographyRuleV1Schema>;
export type BrandTextRuleV1 = z.infer<typeof brandTextRuleV1Schema>;
export type BrandExampleRuleV1 = z.infer<typeof brandExampleRuleV1Schema>;
export type BrandApprovedLiteralV1 = z.infer<
  typeof brandApprovedLiteralV1Schema
>;
export type BrandAssetTextCoverageV1 = z.infer<
  typeof brandAssetTextCoverageV1Schema
>;
export type BrandAssetReferenceV1 = z.infer<typeof brandAssetReferenceV1Schema>;
export type BrandGenerationRulesV1 = z.infer<
  typeof brandGenerationRulesV1Schema
>;
export type BrandIdentitySnapshotV1 = z.infer<
  typeof brandIdentitySnapshotV1Schema
>;
export type BrandedGenerationInputV1 = z.infer<
  typeof brandedGenerationInputV1Schema
>;
export type BrandGenerationLayerVersionV1 = z.infer<
  typeof brandGenerationLayerVersionV1Schema
>;
export type BrandGenerationLayerReceiptV1 = z.infer<
  typeof brandGenerationLayerReceiptV1Schema
>;
export type BrandFeedbackApplicationV1 = z.infer<
  typeof brandFeedbackApplicationV1Schema
>;
export type GlobalLearningApplicationV1 = z.infer<
  typeof globalLearningApplicationV1Schema
>;
export type BrandLearningApplicationV1 = z.infer<
  typeof brandLearningApplicationV1Schema
>;
export type BrandedGenerationResolutionV1 = z.infer<
  typeof brandedGenerationResolutionV1Schema
>;
export type BrandGenerationArtifactPartV1 = z.infer<
  typeof brandGenerationArtifactPartV1Schema
>;
export type BrandGenerationArtifactV1 = z.infer<
  typeof brandGenerationArtifactV1Schema
>;
export type BrandArtifactValidationCheckV1 = z.infer<
  typeof brandArtifactValidationCheckV1Schema
>;
export type BrandArtifactValidationReportV1 = z.infer<
  typeof brandArtifactValidationReportV1Schema
>;
export type BrandPromptReferenceV1 = z.infer<
  typeof brandPromptReferenceV1Schema
>;
export type BrandGenerationExecutionV1 = z.infer<
  typeof brandGenerationExecutionV1Schema
>;
export type BrandGenerationCostV1 = z.infer<typeof brandGenerationCostV1Schema>;
export type BrandedGenerationReceiptV1 = z.infer<
  typeof brandedGenerationReceiptV1Schema
>;
export type LearningGenerationResolutionInputV1 = z.infer<
  typeof learningGenerationResolutionInputV1Schema
>;
