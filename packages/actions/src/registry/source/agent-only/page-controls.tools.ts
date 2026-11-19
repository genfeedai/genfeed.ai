import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_PAGE_CONTROL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Propose changes to controls on the page the person is looking at, such as turning an email preference on or off. Use the control names listed under "Controls On This Page". This only shows a card: nothing changes until the person approves it, so never say a change is made. Do not use it for anything a control list does not show.',
    name: 'propose_page_changes',
    parameters: {
      properties: {
        changes: {
          description: 'The changes to propose, in order.',
          items: {
            additionalProperties: false,
            properties: {
              action: {
                description:
                  'setChecked for a switch or checkbox, setValue for anything else.',
                enum: ['setChecked', 'setValue'],
                type: 'string',
              },
              label: {
                description: "The control's exact name from the list.",
                type: 'string',
              },
              value: {
                description:
                  'The new value as text: "true" or "false" for setChecked, otherwise the value or label to set.',
                type: 'string',
              },
            },
            required: ['label', 'action', 'value'],
            type: 'object',
          },
          type: 'array',
        },
        summary: {
          description: 'One sentence saying what the changes do.',
          type: 'string',
        },
      },
      required: ['changes'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
