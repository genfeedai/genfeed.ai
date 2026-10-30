export type MediaModel = {
  id: string;
  key: string;
  label: string;
};

export type MediaSectionProps = {
  imageModels: MediaModel[];
  videoModels: MediaModel[];
  musicModels: MediaModel[];
  defaultImageModel: string;
  defaultVideoModel: string;
  defaultImageToVideoModel: string;
  defaultMusicModel: string;
  onDefaultImageModelChange: (value: string) => void;
  onDefaultVideoModelChange: (value: string) => void;
  onDefaultImageToVideoModelChange: (value: string) => void;
  onDefaultMusicModelChange: (value: string) => void;
};
