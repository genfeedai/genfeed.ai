export interface ToolRow {
  description: string;
  enabled: boolean;
  key: string;
}

export interface ProvidersToolListProps {
  localToolRows: ToolRow[];
}
