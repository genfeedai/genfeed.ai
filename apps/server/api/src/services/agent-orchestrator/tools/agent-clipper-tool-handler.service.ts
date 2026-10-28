import { ClipperClipEditService } from '@api/collections/clipper-projects/services/clipper-clip-edit.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  readOptionalNumber,
  readOptionalString,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { HttpException, Injectable } from '@nestjs/common';

function failure(error: string): AgentToolResult {
  return { creditsUsed: 0, error, success: false };
}

/** A time the caller sent but that is not a number is refused, not ignored. */
function readTime(
  value: unknown,
  name: string,
): { error?: string; value?: number } {
  if (value === undefined || value === null) return {};
  const time = readOptionalNumber(value);
  return time === undefined
    ? { error: `${name} must be a number of seconds` }
    : { value: time };
}

/**
 * `edit_clip`: re-cuts a finished raw-cut clip to a new window of its source
 * video. The original stays; the edit is queued as a new version, with its
 * captions rebuilt from the transcript for the new window.
 * `get_clip_context`: the read the agent does first, a clip and the transcript
 * around it, or the clips of a project.
 */
@Injectable()
export class AgentClipperToolHandler {
  constructor(private readonly clipEditService: ClipperClipEditService) {}

  async getClipContext(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const clipperResultId = readOptionalString(params.clipperResultId);
    const projectId = readOptionalString(params.projectId);
    if (Boolean(clipperResultId) === Boolean(projectId)) {
      return failure('Pass exactly one of clipperResultId or projectId');
    }

    try {
      const data = clipperResultId
        ? await this.clipEditService.getClipContext(
            ctx.organizationId,
            clipperResultId,
          )
        : await this.clipEditService.listProjectClips(
            ctx.organizationId,
            projectId ?? '',
          );
      return { creditsUsed: 0, data: { ...data }, success: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) return failure(error.message);
      throw error;
    }
  }

  async editClip(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const clipperResultId = readOptionalString(params.clipperResultId);
    if (!clipperResultId) return failure('clipperResultId is required');

    const start = readTime(params.startTime, 'startTime');
    const end = readTime(params.endTime, 'endTime');
    if (start.error) return failure(start.error);
    if (end.error) return failure(end.error);

    const title = readOptionalString(params.title);
    if (start.value === undefined && end.value === undefined && !title) {
      return failure('Say what to change: startTime, endTime or title');
    }

    try {
      const edit = await this.clipEditService.editClip(
        ctx.organizationId,
        ctx.userId,
        {
          clipperResultId,
          ...(end.value !== undefined ? { endTime: end.value } : {}),
          ...(start.value !== undefined ? { startTime: start.value } : {}),
          ...(title ? { title } : {}),
        },
      );
      return {
        creditsUsed: 0,
        data: { ...edit },
        success: true,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) return failure(error.message);
      throw error;
    }
  }
}
