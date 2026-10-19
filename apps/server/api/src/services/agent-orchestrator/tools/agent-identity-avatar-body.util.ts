import type { CreateAvatarVideoDto } from '@api/collections/videos/dto/create-avatar-video.dto';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  isAvatarVideoAspectRatio,
  resolveAvatarVideoAspectRatio,
} from '@genfeedai/contracts/constants';

/**
 * The format comes from the tool call, then the composer setting, then the
 * target platform, and defaults to portrait, so the agent never silently
 * renders a talking-head clip in the wrong frame.
 */
export function buildIdentityAvatarVideoBody(
  text: string,
  params: Record<string, unknown>,
  ctx: Pick<ToolExecutionContext, 'generationSettings'>,
): Pick<CreateAvatarVideoDto, 'aspectRatio' | 'text' | 'useIdentity'> {
  return {
    aspectRatio: resolveAvatarVideoAspectRatio({
      aspectRatio: [
        params.aspectRatio,
        ctx.generationSettings?.aspectRatio,
      ].find(isAvatarVideoAspectRatio),
      platform: params.platform,
    }),
    text,
    useIdentity: true,
  };
}
