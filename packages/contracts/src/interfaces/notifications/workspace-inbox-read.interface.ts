export interface IWorkspaceInboxRead {
  taskId: string;
  seenUpdatedAt: string;
}

export interface IWorkspaceInboxReadState {
  id: string;
  reads: IWorkspaceInboxRead[];
  unreadCount: number;
}
