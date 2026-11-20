import type { ToolParameterSchema } from '../interfaces/tool-definition.interface';

/** Argument that names the organization a call acts in. */
export const MCP_ORGANIZATION_ARGUMENT = 'organization';

export const MCP_ORGANIZATION_DESCRIPTION =
  'Organization this call acts in: its name, slug or id from get_context(action=organizations). Required when the connection covers several organizations (a call without it is refused with the list of organizations and their brands); a connection limited to one organization refuses any other.';

/** The parameters plus the optional organization every MCP tool accepts. */
export function withMcpOrganizationArgument(
  parameters: ToolParameterSchema,
): ToolParameterSchema {
  return {
    ...parameters,
    properties: {
      ...parameters.properties,
      [MCP_ORGANIZATION_ARGUMENT]: {
        description: MCP_ORGANIZATION_DESCRIPTION,
        type: 'string',
      },
    },
  };
}
