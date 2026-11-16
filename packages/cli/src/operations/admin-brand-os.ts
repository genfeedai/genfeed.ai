import { adminPost } from '@/api/admin-client';

export interface OrganizationBrandOsKit {
  description?: string;
  promptGuidelines?: string;
  voiceAudience?: string[];
  voiceDoNotSoundLike?: string[];
  voiceMessagingPillars?: string[];
  voiceSampleOutput?: string;
  voiceStyle?: string;
  voiceTone?: string;
  voiceValues?: string[];
}

export interface OrganizationBrandOsApproval {
  appliedFields: string[];
  approvedAt: string | null;
  brandId: string;
  organizationId: string;
  preservedFields: string[];
  revisionId: string;
  status: string;
  version: number;
}

/** Apply voice and guideline fields to a brand in any organization and approve its Brand OS. */
export async function approveOrganizationBrandOs(
  organizationId: string,
  brandId: string,
  kit: OrganizationBrandOsKit
): Promise<OrganizationBrandOsApproval> {
  const response = await adminPost<{ data: OrganizationBrandOsApproval }>(
    `/admin/organizations/${encodeURIComponent(organizationId)}/brands/${encodeURIComponent(brandId)}/brand-os/approve`,
    kit
  );
  return response.data;
}
