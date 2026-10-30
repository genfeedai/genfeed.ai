import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getPublicAppUrl } from '@mcp/mcp/setup-page';
import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';

/** Matches CreateEditorProjectDto's per-create source-video bound. */
const MAX_SOURCE_VIDEOS = 50;
const MAX_NAME_LENGTH = 120;

export const EDITOR_TOOL_NAMES = new Set([
  'get_editor_project',
  'list_editor_projects',
  'open_in_editor',
  'start_editor_render',
]);
const MAX_LIST_LIMIT = 100;

/**
 * Editor MCP handler (issue #5461). `open_in_editor` creates the seeded project
 * the Studio "Open in Editor" action creates and returns its path; the list and
 * get reads return the organization's Editor projects; `start_editor_render`
 * queues the same export the Editor's Export button runs.
 */
export async function handleEditorTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  if (!EDITOR_TOOL_NAMES.has(name)) {
    throw new Error(`Unknown Editor tool: ${name}`);
  }

  if (name === 'list_editor_projects') {
    const projects = await client.listEditorProjects({
      limit: readCount(args.limit, 1, MAX_LIST_LIMIT),
      page: readCount(args.page, 1, Number.MAX_SAFE_INTEGER),
    });
    return {
      structuredContent: { data: projects },
      content: [
        {
          text:
            projects.length > 0
              ? `Found ${projects.length} Editor projects:\n\n${formatToolData(projects)}`
              : 'No Editor projects found.',
          type: 'text' as const,
        },
      ],
    };
  }

  if (name === 'start_editor_render') {
    const projectId = readProjectIdArg(args);
    const job = await client.startEditorRender(projectId);
    const status = readRenderStatus(job);
    const editorPath = `${APP_ROUTES.STUDIO.EDITOR}/${projectId}`;
    return {
      structuredContent: { data: { editorPath, projectId, status } },
      content: [
        {
          text: `Render queued for Editor project ${projectId} (status: ${status}). Check progress with get_editor_project; the finished video appears as renderedVideo. Or [open it in the Editor](${getPublicAppUrl()}${editorPath}).`,
          type: 'text' as const,
        },
      ],
    };
  }

  if (name === 'get_editor_project') {
    const projectId = readProjectIdArg(args);
    const project = await client.getEditorProject(projectId);
    const editorPath = `${APP_ROUTES.STUDIO.EDITOR}/${projectId}`;
    return {
      structuredContent: { data: { editorPath, project } },
      content: [
        {
          text: `Editor project:\n\n${formatToolData(project)}\n\n[Open in Editor](${getPublicAppUrl()}${editorPath})`,
          type: 'text' as const,
        },
      ],
    };
  }

  const sourceVideoIds = readSourceVideoIds(args);
  const projectName = readOptionalName(args);
  const project = await client.openInEditor({
    ...(projectName ? { name: projectName } : {}),
    sourceVideoIds,
  });
  const id = readProjectId(project);
  const editorPath = `${APP_ROUTES.STUDIO.EDITOR}/${id}`;

  return {
    structuredContent: { data: { editorPath, id, project } },
    content: [
      {
        text: `Editor project ready. [Open in Editor](${getPublicAppUrl()}${editorPath})`,
        type: 'text' as const,
      },
    ],
  };
}

function readProjectIdArg(args: Record<string, unknown>): string {
  const projectId = args.projectId;
  if (typeof projectId !== 'string' || projectId.trim().length === 0) {
    throw new Error('projectId is required');
  }
  return projectId.trim();
}

function readRenderStatus(job: Record<string, unknown>): string {
  const attributes = job.attributes;
  const status =
    typeof attributes === 'object' && attributes !== null
      ? (attributes as Record<string, unknown>).status
      : undefined;
  return typeof status === 'string' && status.length > 0 ? status : 'rendering';
}

function readCount(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

function readSourceVideoIds(args: Record<string, unknown>): string[] {
  const value = args.sourceVideoIds;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('sourceVideoIds must be a non-empty array of strings');
  }
  if (value.length > MAX_SOURCE_VIDEOS) {
    throw new Error(
      `sourceVideoIds accepts at most ${MAX_SOURCE_VIDEOS} videos`,
    );
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`sourceVideoIds[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function readOptionalName(args: Record<string, unknown>): string | undefined {
  if (args.name === undefined) {
    return undefined;
  }
  if (typeof args.name !== 'string') {
    throw new Error('name must be a string');
  }
  const name = args.name.trim();
  if (name.length === 0) {
    return undefined;
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

function readProjectId(project: Record<string, unknown>): string {
  const id = project.id;
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Editor project create did not return an id');
  }
  return id;
}
