export interface IFeatureBadgeProps {
  feature: string;
  status?: 'todo' | 'in-progress' | 'blocked' | 'testing';
  priority?: 'low' | 'medium' | 'high';
  tasks?: IFeatureTask[];
  className?: string;
}

export interface IFeatureTask {
  id: string;
  description: string;
  completed: boolean;
  notes?: string;
}
