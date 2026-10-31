export type AgentMediaArtifactKind = 'audio' | 'image' | 'video';

export interface AgentMediaArtifact {
  alt?: string;
  width?: number;
  height?: number;
  kind: AgentMediaArtifactKind;
  title?: string;
  url: string;
}

export interface AgentMediaArtifactPreviewProps {
  assets: AgentMediaArtifact[];
  className?: string;
  displayMode?: 'featured' | 'grid';
  title?: string;
}

export interface AgentMediaExpandedAssetProps {
  asset: AgentMediaArtifact;
  title: string;
}

export interface AgentMediaImageAssetProps {
  alt: string;
  className?: string;
  src: string;
}

export interface AgentMediaInlineAssetProps {
  asset: AgentMediaArtifact;
  displayMode: 'featured' | 'grid';
  index: number;
  onOpen: (index: number) => void;
}

export interface AgentMediaDimensions {
  width: number;
  height: number;
}
