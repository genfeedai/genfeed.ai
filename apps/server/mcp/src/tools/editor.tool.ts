import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ClientService } from '@mcp/services/client.service';

/** Matches CreateEditorProjectDto's per-create source-video bound. */
const MAX_SOURCE_VIDEOS = 50;
const MAX_NAME_LENGTH = 120;

export const EDITOR_TOOL_NAMES = new Set(['open_in_editor']);

/**
 * Editor MCP handler (issue #5461). Creates the seeded project the Studio
 * "Open in Editor" action creates, then returns the project and its path.
 */
export async function handleEditorTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  if (!EDITOR_TOOL_NAMES.has(name)) {
    throw new Error(`Unknown Editor tool: ${name}`);
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
    content: [
      {
        text: `Opened in Editor:\n\n${JSON.stringify({ editorPath, id, project }, null, 2)}`,
        type: 'text' as const,
      },
    ],
  };
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
