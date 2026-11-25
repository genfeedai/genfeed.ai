import type {
  BrandArtifactValidationReportV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type {
  GenerationBrandPaletteColor,
  GenerationBrandPaletteReceipt,
} from '@genfeedai/contracts/interfaces/content/generation-harness.interface';

const UNMEASURED_REASON = 'palette_unmeasured';

/**
 * The palette half of a media validation report, shaped for the generation
 * details. A colour the pixels could not decide (translucent, undecodable
 * output, a layer over the base) is never listed as found or absent: when no
 * colour could be measured the result says why instead. Null when the brand
 * has no palette to check.
 */
export function projectMediaPaletteReceipt(
  report: BrandArtifactValidationReportV1,
  snapshot: BrandIdentitySnapshotV1,
): GenerationBrandPaletteReceipt | null {
  const checks = report.checks.filter((check) => check.category === 'palette');
  if (checks.length === 0) return null;
  const colors: GenerationBrandPaletteColor[] = [];
  for (const check of checks) {
    const { proof } = check;
    if (
      (check.result !== 'pass' && check.result !== 'fail') ||
      proof?.kind !== 'palette'
    )
      continue;
    const rule = snapshot.generationRules.palette.find(
      (candidate) => candidate.id === check.ruleId,
    );
    colors.push({
      id: check.ruleId,
      hex: proof.target,
      ...(rule?.usage ? { usage: rule.usage } : {}),
      isRequired: rule?.required ?? check.severity === 'hard',
      coverage: proof.coverage,
      result: check.result === 'pass' ? 'found' : 'absent',
    });
  }
  if (colors.length > 0) return { status: 'measured', colors };
  return {
    status: 'not_measured',
    reasonCode:
      checks.find((check) => check.reasonCode)?.reasonCode ?? UNMEASURED_REASON,
  };
}
