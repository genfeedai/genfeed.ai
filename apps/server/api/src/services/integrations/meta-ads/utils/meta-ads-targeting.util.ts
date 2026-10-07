import type { MetaAdSetTargeting } from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';

export function buildMetaAdSetTargeting(
  targeting: MetaAdSetTargeting,
  isCreation = false,
): string {
  // v26 requires an explicit audience choice for constrained HEC-F ad sets.
  // Preserve the requested constraints; updates retain existing automation.
  const spec: Record<string, unknown> = isCreation
    ? { targeting_automation: { advantage_audience: 0 } }
    : {};

  if (targeting.geoLocations) {
    spec.geo_locations = targeting.geoLocations;
  }
  if (targeting.ageMin !== undefined) {
    spec.age_min = targeting.ageMin;
  }
  if (targeting.ageMax !== undefined) {
    spec.age_max = targeting.ageMax;
  }
  if (targeting.genders) {
    spec.genders = targeting.genders;
  }
  if (targeting.interests) {
    spec.interests = targeting.interests;
  }
  if (targeting.customAudiences) {
    spec.custom_audiences = targeting.customAudiences;
  }

  return JSON.stringify(spec);
}
