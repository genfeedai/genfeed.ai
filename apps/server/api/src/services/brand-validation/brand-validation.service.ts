import { randomUUID } from 'node:crypto';
import {
  decodeBrandTextBytes,
  hashBrandArtifactBytes,
} from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  assertBrandValidationMetadata,
  copyBrandValidationMaterial,
} from '@api/services/brand-validation/brand-validation-material.util';
import {
  assertBrandValidationRuleDomain,
  buildBrandValidationChecks,
} from '@api/services/brand-validation/brand-validation-rules.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  brandArtifactValidationReportV1Schema,
  brandGenerationArtifactV1Schema,
  brandIdentitySnapshotV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationInputV1,
  BrandArtifactValidationReportV1,
  BrandCapabilityPreflightInputV1,
  BrandCapabilityPreflightResultV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { BadRequestException } from '@nestjs/common';

const factualMessage =
  'Complete factual coverage is unavailable; review the actual output against approved sources.';
const mediaMessage =
  'This validator has no qualified image or video render evidence; use a qualified export path or review the output.';
const actions: Record<string, string> = {
  fact_grounding_unavailable:
    'Complete approved factual claims are unavailable; use the approved-claim path or review the output.',
  semantic_validation_unavailable:
    'This semantic rule has no qualified evaluator; review the output against the rule.',
  empty_literal_rule:
    'Replace the empty literal rule in a reviewed brand revision.',
  text_coverage_incomplete:
    'Complete rendered text is unavailable; use a qualified text or render path.',
  exact_palette_unavailable:
    'Use a qualified export path with artifact-bound palette regions.',
  exact_font_unavailable:
    'Use a qualified export path that proves the approved font was actually used.',
  exact_logo_unavailable:
    'Use a qualified export path with an artifact-bound approved logo region.',
  exact_product_unavailable:
    'Use a qualified export path with an artifact-bound approved product region.',
  exact_asset_unavailable:
    'Use a qualified export path with artifact-bound approved asset regions.',
};
function invalid(): never {
  throw new BadRequestException('brand_validation_invalid_input');
}
function assertInput(value: unknown, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  )
    invalid();
  for (const descriptor of Object.values(descriptors))
    if (!descriptor.enumerable || !('value' in descriptor)) invalid();
}
function snapshotInput(value: unknown) {
  assertBrandValidationMetadata(value);
  const parsed = brandIdentitySnapshotV1Schema.parse(value);
  assertBrandValidationRuleDomain(parsed);
  return parsed;
}
export class BrandValidationService {
  preflightBrandCapabilities(
    input: BrandCapabilityPreflightInputV1,
  ): BrandCapabilityPreflightResultV1 {
    let snapshot: BrandCapabilityPreflightInputV1['snapshot'];
    let mediaKind: BrandCapabilityPreflightInputV1['mediaKind'];
    try {
      assertInput(input, ['snapshot', 'provider', 'model', 'mediaKind']);
      for (const value of [input.provider, input.model])
        if (
          typeof value !== 'string' ||
          value.length < 1 ||
          value.length > 512 ||
          !value.trim()
        )
          invalid();
      mediaKind = input.mediaKind;
      if (!['text', 'image', 'video'].includes(mediaKind)) invalid();
      snapshot = snapshotInput(input.snapshot);
    } catch {
      invalid();
    }
    if (hashBrandIdentitySnapshotV1(snapshot) !== snapshot.contentHash)
      throw new BadRequestException('brand_validation_snapshot_hash_mismatch');
    const diagnostics: BrandCapabilityPreflightResultV1['diagnostics'] = [
      {
        code: 'factual_coverage_unverified',
        severity: 'warning',
        message: factualMessage,
      },
    ];
    if (mediaKind !== 'text')
      diagnostics.push({
        code: 'artifact_media_unsupported',
        severity: 'error',
        message: mediaMessage,
      });
    const checks = buildBrandValidationChecks(
      snapshot,
      input.mediaKind,
      '',
      true,
    );
    for (const check of checks) {
      if (
        check.ruleId === 'system:factual_coverage' ||
        check.result === 'not_applicable' ||
        check.method === 'exact_text' ||
        !check.reasonCode
      )
        continue;
      const severity = check.severity === 'hard' ? 'error' : 'warning';
      const prior = diagnostics.find(
        (diagnostic) => diagnostic.code === check.reasonCode,
      );
      if (!prior)
        diagnostics.push({
          code: check.reasonCode,
          severity,
          message: actions[check.reasonCode],
          ruleId: check.ruleId,
          evidenceIds: [...check.evidenceIds],
        });
      else if (prior.severity !== 'error' && severity === 'error') {
        prior.severity = 'error';
        prior.ruleId = check.ruleId;
        prior.evidenceIds = [...check.evidenceIds];
      }
    }
    return {
      status: diagnostics.some((diagnostic) => diagnostic.severity === 'error')
        ? 'blocked'
        : 'supported',
      diagnostics,
    };
  }

  async validateBrandArtifact(
    input: BrandArtifactValidationInputV1,
  ): Promise<BrandArtifactValidationReportV1> {
    let snapshot: BrandArtifactValidationInputV1['snapshot'];
    let artifact: BrandArtifactValidationInputV1['artifact'];
    let material: BrandArtifactValidationInputV1['material'];
    try {
      assertInput(input, ['snapshot', 'artifact', 'material']);
      snapshot = snapshotInput(input.snapshot);
      assertBrandValidationMetadata(input.artifact);
      artifact = brandGenerationArtifactV1Schema.parse(input.artifact);
      material = copyBrandValidationMaterial(input.material);
    } catch {
      invalid();
    }
    if (
      material.artifactKind !== artifact.kind ||
      material.artifactId !== artifact.id ||
      material.artifactVersion !== artifact.version ||
      material.parts.length !== artifact.parts.length ||
      new Set(material.parts.map((part) => part.partId)).size !==
        material.parts.length
    )
      invalid();
    for (const descriptor of artifact.parts) {
      const part = material.parts.find(
        (candidate) => candidate.partId === descriptor.id,
      );
      if (!part || part.partVersion !== descriptor.version) invalid();
    }
    if (hashBrandIdentitySnapshotV1(snapshot) !== snapshot.contentHash)
      throw new BadRequestException('brand_validation_snapshot_hash_mismatch');
    for (const descriptor of artifact.parts) {
      const part = material.parts.find(
        (candidate) => candidate.partId === descriptor.id,
      );
      if (!part) invalid();
      if (hashBrandArtifactBytes(part.bytes) !== descriptor.contentHash)
        throw new BadRequestException(
          'brand_validation_artifact_hash_mismatch',
        );
    }
    let text: string | null = null;
    let textHash: string | null = null;
    if (material.textBytes !== null) {
      try {
        text = decodeBrandTextBytes(material.textBytes);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError)
          invalid();
        throw error;
      }
      textHash = hashBrandArtifactBytes(material.textBytes);
      if (
        !Buffer.from(text, 'utf8').equals(Buffer.from(material.textBytes)) ||
        hashBrandedGenerationTextV1(text) !== textHash
      )
        throw new BadRequestException(
          'brand_validation_artifact_hash_mismatch',
        );
    }
    if (artifact.mediaKind === 'text' && text === null) invalid();
    if (
      artifact.mediaKind !== 'text' &&
      !artifact.parts.some((part) =>
        ['primary', 'image', 'video'].includes(part.role),
      )
    )
      invalid();
    if (text === null && artifact.parts.length === 0) invalid();
    if (
      hashBrandedGenerationArtifactManifestV1({
        mediaKind: artifact.mediaKind,
        textHash,
        parts: artifact.parts,
      }) !== artifact.contentHash
    )
      throw new BadRequestException('brand_validation_artifact_hash_mismatch');
    const referenceIds = new Set<string>();
    for (const reference of material.references) {
      const approved = snapshot.generationRules.assets.find(
        (asset) => asset.id === reference.assetReferenceId,
      );
      if (
        referenceIds.has(reference.assetReferenceId) ||
        !approved ||
        reference.assetId !== approved.assetId ||
        !approved.contentHash ||
        hashBrandArtifactBytes(reference.bytes) !== approved.contentHash
      )
        throw new BadRequestException('brand_validation_reference_mismatch');
      referenceIds.add(reference.assetReferenceId);
    }
    const checks = buildBrandValidationChecks(
      snapshot,
      artifact.mediaKind,
      text,
      artifact.mediaKind === 'text' &&
        text !== null &&
        artifact.parts.length === 0,
    );
    const diagnostics: BrandArtifactValidationReportV1['diagnostics'] = [
      {
        code: 'factual_coverage_unverified',
        severity: 'warning',
        message: factualMessage,
      },
    ];
    if (artifact.mediaKind !== 'text')
      diagnostics.push({
        code: 'artifact_media_unsupported',
        severity: 'warning',
        message: mediaMessage,
      });
    if (
      checks.some(
        (check) => check.severity === 'hard' && check.result === 'fail',
      )
    )
      diagnostics.push({
        code: 'brand_rule_failed',
        severity: 'error',
        message:
          'A required literal rule failed; correct the output and request validation again.',
      });
    return brandArtifactValidationReportV1Schema.parse({
      schemaVersion: 1,
      rubricVersion: 1,
      id: randomUUID(),
      checkedAt: new Date().toISOString(),
      snapshotHash: snapshot.contentHash,
      artifactHash: artifact.contentHash,
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      checks,
      quality: null,
      diagnostics,
    });
  }
}
