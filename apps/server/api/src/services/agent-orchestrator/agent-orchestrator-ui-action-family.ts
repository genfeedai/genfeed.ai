export type ThreadUiActionFamily = 'brand-identity' | 'confirmed-tool' | 'plan';

const THREAD_UI_ACTION_FAMILIES = {
  approve_plan: 'plan',
  confirm_create_brand: 'brand-identity',
  confirm_generate_media: 'confirmed-tool',
  confirm_install_official_workflow: 'confirmed-tool',
  confirm_publish_post: 'confirmed-tool',
  confirm_rename_brand: 'brand-identity',
  confirm_save_brand_voice_profile: 'confirmed-tool',
  revise_plan: 'plan',
} as const satisfies Record<string, ThreadUiActionFamily>;

export type SupportedThreadUiAction = keyof typeof THREAD_UI_ACTION_FAMILIES;

export function resolveThreadUiActionFamily(
  action: string,
): ThreadUiActionFamily | null {
  return action in THREAD_UI_ACTION_FAMILIES
    ? THREAD_UI_ACTION_FAMILIES[action as SupportedThreadUiAction]
    : null;
}
