export interface McpConfiguration {
  mcpServers: {
    [key: string]: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
}
