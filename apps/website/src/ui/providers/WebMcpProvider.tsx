'use client';

import { useEffect } from 'react';

const destinations = {
  developers: '/developers',
  documentation: 'https://docs.genfeed.ai',
  pricing: '/pricing',
  skills: '/skills',
} as const;

type Destination = keyof typeof destinations;

interface WebMcpTool {
  annotations: { readOnlyHint: boolean };
  description: string;
  execute: (input: { destination: Destination }) => Promise<{
    content: Array<{ text: string; type: 'text' }>;
  }>;
  inputSchema: {
    additionalProperties: false;
    properties: {
      destination: {
        description: string;
        enum: Destination[];
        type: 'string';
      };
    };
    required: ['destination'];
    type: 'object';
  };
  name: string;
  title: string;
}

interface LegacyModelContext {
  provideContext?: (context: { tools: WebMcpTool[] }) => void;
}

interface CurrentModelContext {
  registerTool?: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
}

function createNavigationTool(): WebMcpTool {
  return {
    annotations: { readOnlyHint: true },
    description:
      'Navigate to a public Genfeed product, pricing, developer, or skills page selected by the user.',
    execute: async ({ destination }) => {
      const target = destinations[destination];
      if (!target) {
        throw new Error('Unknown Genfeed destination.');
      }

      window.location.assign(target);
      return {
        content: [
          {
            text: `Navigating to Genfeed ${destination}.`,
            type: 'text',
          },
        ],
      };
    },
    inputSchema: {
      additionalProperties: false,
      properties: {
        destination: {
          description: 'The public Genfeed destination to open.',
          enum: Object.keys(destinations) as Destination[],
          type: 'string',
        },
      },
      required: ['destination'],
      type: 'object',
    },
    name: 'navigate_genfeed',
    title: 'Navigate Genfeed',
  };
}

export default function WebMcpProvider() {
  useEffect(() => {
    const tool = createNavigationTool();
    const abortController = new AbortController();
    const legacyContext = (
      navigator as Navigator & { modelContext?: LegacyModelContext }
    ).modelContext;
    const currentContext = (
      document as Document & { modelContext?: CurrentModelContext }
    ).modelContext;

    legacyContext?.provideContext?.({ tools: [tool] });
    void currentContext
      ?.registerTool?.(tool, { signal: abortController.signal })
      .catch(() => undefined);

    return () => abortController.abort();
  }, []);

  return null;
}
