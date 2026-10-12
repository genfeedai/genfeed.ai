import {
  decodeBrandTextBytes,
  hashBrandArtifactBytes,
} from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandArtifactValidationInputV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { BadRequestException } from '@nestjs/common';

export function invalidBrandValidationInput(): never {
  throw new BadRequestException('brand_validation_invalid_input');
}

/** The decoded text of an artifact and its hash, once every binding has been verified. */
export interface VerifiedBrandValidationText {
  text: string | null;
  textHash: string | null;
}

/**
 * Proves the supplied material is exactly the artifact the snapshot governs:
 * ids, versions, part and text hashes, the manifest hash and every approved
 * reference. Any mismatch throws before a rule is evaluated.
 */
export function verifyBrandValidationInput(
  snapshot: BrandArtifactValidationInputV1['snapshot'],
  artifact: BrandArtifactValidationInputV1['artifact'],
  material: BrandArtifactValidationInputV1['material'],
): VerifiedBrandValidationText {
  const invalid: () => never = invalidBrandValidationInput;
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
      throw new BadRequestException('brand_validation_artifact_hash_mismatch');
  }
  let text: string | null = null;
  let textHash: string | null = null;
  if (material.textBytes !== null) {
    try {
      text = decodeBrandTextBytes(material.textBytes);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) invalid();
      throw error;
    }
    textHash = hashBrandArtifactBytes(material.textBytes);
    if (
      !Buffer.from(text, 'utf8').equals(Buffer.from(material.textBytes)) ||
      hashBrandedGenerationTextV1(text) !== textHash
    )
      throw new BadRequestException('brand_validation_artifact_hash_mismatch');
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
  return { text, textHash };
}
