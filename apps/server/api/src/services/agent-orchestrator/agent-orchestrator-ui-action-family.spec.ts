import type {
  SupportedThreadUiAction,
  ThreadUiActionFamily,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-family';
import { resolveThreadUiActionFamily } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-family';

const EXPECTED_ACTION_FAMILIES = {
  approve_plan: 'plan',
  revise_plan: 'plan',
  confirm_create_brand: 'brand-identity',
  confirm_agent_transfer: 'confirmed-tool',
  confirm_rename_brand: 'brand-identity',
  confirm_install_official_workflow: 'confirmed-tool',
  confirm_publish_post: 'confirmed-tool',
  confirm_generate_media: 'confirmed-tool',
  confirm_save_brand_voice_profile: 'confirmed-tool',
} as const satisfies Record<SupportedThreadUiAction, ThreadUiActionFamily>;

describe('thread UI action family ownership', () => {
  it.each(Object.entries(EXPECTED_ACTION_FAMILIES))(
    'assigns %s to exactly the %s owner',
    (action, family) => {
      expect(resolveThreadUiActionFamily(action)).toBe(family);
    },
  );

  it('leaves unsupported actions unowned', () => {
    expect(resolveThreadUiActionFamily('unsupported_action')).toBeNull();
  });

  it('does not inherit action ownership from the object prototype', () => {
    expect(resolveThreadUiActionFamily('toString')).toBeNull();
  });
});
