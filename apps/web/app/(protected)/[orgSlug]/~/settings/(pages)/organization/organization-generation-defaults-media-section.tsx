import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { MediaSectionProps } from '@/features/settings/props/organization-generation-defaults-media-section.props';

export default function OrganizationGenerationDefaultsMediaSection({
  imageModels,
  videoModels,
  musicModels,
  defaultImageModel,
  defaultVideoModel,
  defaultImageToVideoModel,
  defaultMusicModel,
  onDefaultImageModelChange,
  onDefaultVideoModelChange,
  onDefaultImageToVideoModelChange,
  onDefaultMusicModelChange,
}: MediaSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Media
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the organization-level baseline models for image, video,
          image-to-video, and music generation. Brands can inherit them or
          override them in brand settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-default-image-model">Default Image Model</Label>
          <Select
            onValueChange={(value) =>
              onDefaultImageModelChange(value === 'none' ? '' : value)
            }
            value={defaultImageModel || 'none'}
          >
            <SelectTrigger id="org-default-image-model" className="w-full">
              <SelectValue placeholder="Select an image model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {imageModels.map((model) => (
                <SelectItem key={model.id} value={model.key}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-default-video-model">Default Video Model</Label>
          <Select
            onValueChange={(value) =>
              onDefaultVideoModelChange(value === 'none' ? '' : value)
            }
            value={defaultVideoModel || 'none'}
          >
            <SelectTrigger id="org-default-video-model" className="w-full">
              <SelectValue placeholder="Select a video model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {videoModels.map((model) => (
                <SelectItem key={model.id} value={model.key}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-default-image-to-video-model">
            Default Image-to-Video Model
          </Label>
          <Select
            onValueChange={(value) =>
              onDefaultImageToVideoModelChange(value === 'none' ? '' : value)
            }
            value={defaultImageToVideoModel || 'none'}
          >
            <SelectTrigger
              id="org-default-image-to-video-model"
              className="w-full"
            >
              <SelectValue placeholder="Select an image-to-video model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {videoModels.map((model) => (
                <SelectItem key={model.id} value={model.key}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-default-music-model">Default Music Model</Label>
          <Select
            onValueChange={(value) =>
              onDefaultMusicModelChange(value === 'none' ? '' : value)
            }
            value={defaultMusicModel || 'none'}
          >
            <SelectTrigger id="org-default-music-model" className="w-full">
              <SelectValue placeholder="Select a music model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use system default</SelectItem>
              {musicModels.map((model) => (
                <SelectItem key={model.id} value={model.key}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
