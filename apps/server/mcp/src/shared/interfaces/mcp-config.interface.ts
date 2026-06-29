export interface McpConfiguration {
  mcpServers: {
    [key: string]:
      | {
          args: string[];
          command: string;
          env?: Record<string, string>;
        }
      | {
          headers?: Record<string, string>;
          transport?: string;
          type: 'http';
          url: string;
        };
  };
}

export interface McpClientExamples {
  claudeCode: {
    command: string;
  };
  codex: {
    command: string;
    configToml: string;
  };
  mcpServers: {
    [key: string]: {
      env?: Record<string, string>;
      headers?: Record<string, string>;
      transport?: string;
      type: 'http';
      url: string;
    };
  };
}
