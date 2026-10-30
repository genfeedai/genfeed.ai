import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperClipEditService } from '@api/collections/clipper-projects/services/clipper-clip-edit.service';
import { ClipperProjectIngestionService } from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  readOptionalNumber,
  readOptionalString,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { HttpException, Injectable } from '@nestjs/common';

function toClipperUser(ctx: ToolExecutionContext): AuthenticatedUser {
  return {
    brandId: ctx.brandId ?? ctx.validatedScope?.brandId ?? '',
    id: ctx.userId,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  };
}

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
 * `start_clip_analysis`: starts a free analysis of a YouTube video (audio,
 * transcript, highlights); `get_clip_highlights` reads what it found.
 */
@Injectable()
export class AgentClipperToolHandler {
  constructor(
    private readonly clipEditService: ClipperClipEditService,
    private readonly ingestionService: ClipperProjectIngestionService,
    private readonly projectsService: ClipperProjectsService,
  ) {}

  async analyzeProject(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const youtubeUrl = readOptionalString(params.youtubeUrl);
    if (!youtubeUrl) return failure('youtubeUrl is required');

    try {
      const maxClips = readOptionalNumber(params.maxClips);
      const minViralityScore = readOptionalNumber(params.minViralityScore);
      const language = readOptionalString(params.language);
      const name = readOptionalString(params.name);
      const result = await this.ingestionService.analyzeYoutube(
        toClipperUser(ctx),
        {
          youtubeUrl,
          ...(language ? { language } : {}),
          ...(maxClips !== undefined
            ? { maxClips: Math.min(30, Math.max(1, Math.round(maxClips))) }
            : {}),
          ...(minViralityScore !== undefined
            ? {
                minViralityScore: Math.min(100, Math.max(0, minViralityScore)),
              }
            : {}),
          ...(name ? { name } : {}),
        },
      );
      return {
        creditsUsed: 0,
        data: { projectId: result.projectId, status: result.status },
        success: true,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) return failure(error.message);
      throw error;
    }
  }

  async getHighlights(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const projectId = readOptionalString(params.projectId);
    if (!projectId) return failure('projectId is required');

    const project = await this.projectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId: ctx.organizationId,
    });
    if (!project) return failure('Clip project not found');

    return {
      creditsUsed: 0,
      data: {
        highlights: (project.highlights ?? []).map((highlight) => ({
          clipType: highlight.clip_type,
          endTime: highlight.end_time,
          id: highlight.id,
          script: highlight.script ?? null,
          startTime: highlight.start_time,
          title: highlight.title,
          viralityScore: highlight.virality_score,
        })),
        projectId,
        status: project.status,
      },
      success: true,
    };
  }

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
