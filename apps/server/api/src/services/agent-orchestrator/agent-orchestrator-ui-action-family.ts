export type ThreadUiActionFamily = 'brand-identity' | 'confirmed-tool' | 'plan';
export type SupportedThreadUiAction =
  | 'approve_plan'
  | 'revise_plan'
  | 'confirm_create_brand'
  | 'confirm_agent_transfer'
  | 'confirm_rename_brand'
  | 'confirm_install_official_workflow'
  | 'confirm_publish_post'
  | 'confirm_generate_media'
  | 'confirm_outreach_sequence'
  | 'confirm_save_brand_voice_profile';

const THREAD_UI_ACTION_FAMILIES = {
  approve_plan: 'plan',
  revise_plan: 'plan',
  confirm_create_brand: 'brand-identity',
  confirm_agent_transfer: 'confirmed-tool',
  confirm_rename_brand: 'brand-identity',
  confirm_install_official_workflow: 'confirmed-tool',
  confirm_publish_post: 'confirmed-tool',
  confirm_generate_media: 'confirmed-tool',
  confirm_outreach_sequence: 'confirmed-tool',
  confirm_save_brand_voice_profile: 'confirmed-tool',
} as const satisfies Record<SupportedThreadUiAction, ThreadUiActionFamily>;

export function isSupportedThreadUiAction(
  action: string,
): action is SupportedThreadUiAction {
  return Object.hasOwn(THREAD_UI_ACTION_FAMILIES, action);
}

export function resolveThreadUiActionFamily(
  action: string,
): ThreadUiActionFamily | null {
  return isSupportedThreadUiAction(action)
    ? THREAD_UI_ACTION_FAMILIES[action]
    : null;
}
