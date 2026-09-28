/** The user-turn line a thread timeline shows for a ui-action. */
export function describeThreadUiAction(
  action: string,
  payload?: Record<string, unknown>,
): string {
  if (action === 'approve_plan') {
    const planId =
      typeof payload?.planId === 'string' && payload.planId.trim()
        ? payload.planId.trim()
        : 'current plan';
    return `Approved plan ${planId}.`;
  }
  if (action === 'revise_plan') {
    const note =
      typeof payload?.revisionNote === 'string' && payload.revisionNote.trim()
        ? payload.revisionNote.trim()
        : 'with requested changes';
    return `Requested plan changes: ${note}.`;
  }
  if (action === 'confirm_install_official_workflow') {
    const sourceName =
      typeof payload?.sourceName === 'string' && payload.sourceName.trim()
        ? payload.sourceName.trim()
        : 'official workflow';
    return `Confirmed install for ${sourceName}.`;
  }
  if (action === 'confirm_create_brand' || action === 'confirm_rename_brand') {
    const label =
      typeof payload?.label === 'string' && payload.label.trim()
        ? payload.label.trim()
        : 'brand';
    return action === 'confirm_create_brand'
      ? `Confirmed brand creation for ${label}.`
      : `Confirmed brand rename to ${label}.`;
  }
  if (action === 'confirm_publish_post') {
    const contentId =
      typeof payload?.contentId === 'string' && payload.contentId.trim()
        ? payload.contentId.trim()
        : 'selected content';
    return `Confirmed publish for ${contentId}.`;
  }
  if (action === 'confirm_generate_media') {
    return `Confirmed ${payload?.generationType === 'video' ? 'video' : 'image'} generation.`;
  }
  if (action === 'confirm_outreach_sequence') {
    const transition = payload?.transition === 'pause' ? 'pause' : 'start';
    return `Confirmed outreach sequence ${transition}.`;
  }
  if (action === 'confirm_save_brand_voice_profile') {
    const brandId =
      typeof payload?.brandId === 'string' && payload.brandId.trim()
        ? payload.brandId.trim()
        : 'selected brand';
    return `Approved brand voice draft for ${brandId}.`;
  }
  return `Triggered thread UI action: ${action}`;
}
