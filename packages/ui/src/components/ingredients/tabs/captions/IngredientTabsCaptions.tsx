'use client';

import { useAuth } from '@clerk/nextjs';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  CaptionFormat,
} from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@genfeedai/hooks/data/resource/use-resource/use-resource';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { ICaption, IFieldOption, IMetadata } from '@genfeedai/interfaces';
import type { Caption } from '@genfeedai/models/content/caption.model';
import type { IngredientTabsCaptionsProps } from '@genfeedai/props/content/ingredient.props';
import { CaptionsService } from '@genfeedai/services/content/captions.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import Card from '@ui/card/Card';
import Alert from '@ui/feedback/alert/Alert';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { SelectField } from '@ui/primitives/select';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { HiArrowDownTray, HiPlus, HiSparkles } from 'react-icons/hi2';

const languageOptions: IFieldOption[] = [
  { label: 'English', value: 'en' },
  // { value: 'es', label: 'Spanish' },
  // { value: 'fr', label: 'French' },
  // { value: 'de', label: 'German' },
  // { value: 'it', label: 'Italian' },
  // { value: 'pt', label: 'Portuguese' },
  // { value: 'zh', label: 'Chinese' },
  // { value: 'ja', label: 'Japanese' },
  // { value: 'ko', label: 'Korean' },
];

const formatOptions: IFieldOption[] = [{ label: 'SRT (SubRip)', value: 'srt' }];

export default function IngredientTabsCaptions({
  ingredient,
  // onReload,
}: IngredientTabsCaptionsProps) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { href } = useOrgUrl();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getCaptionsService = useAuthedService((token: string) =>
    CaptionsService.getInstance(token),
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const [language, setLanguage] = useState('en');
  const [format, setFormat] = useState<CaptionFormat>(CaptionFormat.SRT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState<ICaption | null>(null);

  // Load captions using useResource (handles AbortController cleanup properly)
  const {
    data: captions,
    isLoading,
    refresh: refreshCaptions,
  } = useResource(
    async () => {
      const service = await getVideosService();
      return service.findCaptions(ingredient.id);
    },
    {
      defaultValue: [] as Caption[],
      dependencies: [ingredient.id],
      enabled: !!isSignedIn,
    },
  );

  // Set selectedCaption when captions load
  useEffect(() => {
    if (captions.length > 0 && !selectedCaption) {
      setSelectedCaption(captions[0]);
    }
  }, [captions, selectedCaption]);

  const handleGenerateCaption = async () => {
    setIsGenerating(true);

    try {
      const service = await getCaptionsService();
      const data = await service.post({
        format,
        ingredient: ingredient.id,
        language,
      });

      notificationsService.success('Caption generated successfully');
      await refreshCaptions();

      setSelectedCaption(data);
    } catch (error) {
      logger.error('Failed to generate caption', error);
      notificationsService.error('Failed to generate caption');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideoWithCaption = async () => {
    if (!selectedCaption) {
      return;
    }

    setIsGeneratingVideo(true);

    try {
      const service = await getVideosService();

      // Generate video with captions burned in
      const data = await service.postCaptions(
        ingredient.id,
        selectedCaption.id,
      );

      notificationsService.success('Video with captions is being generated...');

      logger.info('Video generated', data);

      // Redirect to videos page
      router.push(href(`/videos/${data.id}`));
    } catch (error) {
      logger.error('Failed to generate video with captions', error);
      notificationsService.error('Failed to generate video with captions');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleDownloadCaption = (caption: ICaption) => {
    // Create a blob with the caption text
    const blob = new Blob([caption.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const metadata = ingredient.metadata as IMetadata;

    link.download = `${metadata.label || 'caption'}_${caption.language}.${caption.format || 'srt'}`;
    link.click();
    URL.revokeObjectURL(url);

    notificationsService.success('Caption downloaded');
  };

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <div className="space-y-4">
      {/* Generate New Caption */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Generate Caption</h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <SelectField
            name="language"
            label="Language"
            placeholder="Select language"
            value={language}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setLanguage(e.target.value)
            }
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            name="format"
            label="Format"
            placeholder="Select format"
            value={format}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setFormat(e.target.value as CaptionFormat)
            }
          >
            {formatOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>

        <Button
          label="Generate Caption"
          icon={<HiPlus className="text-xl" />}
          onClick={handleGenerateCaption}
          isLoading={isGenerating}
          variant={ButtonVariant.DEFAULT}
          className="w-full"
        />
      </Card>

      {/* Existing Captions */}
      {captions.length > 0 ? (
        <Card>
          <h3 className="text-lg font-semibold mb-4">
            Existing Captions ({captions.length})
          </h3>

          <div className="space-y-2 mb-4">
            {captions.map((caption: ICaption) => (
              <div
                key={caption.id}
                onClick={() => setSelectedCaption(caption)}
                className={`p-3 border cursor-pointer transition-colors ${
                  selectedCaption?.id === caption.id
                    ? 'border-primary bg-primary/10'
                    : 'border-white/[0.08] hover:bg-background'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {caption.language?.toUpperCase()} -{' '}
                      {caption.format?.toUpperCase() || 'SRT'}
                    </p>

                    <p className="text-sm text-foreground/60">
                      Created {new Date(caption.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    icon={<HiArrowDownTray className="text-xl" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadCaption(caption);
                    }}
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                    tooltip="Download Caption"
                  />
                </div>
              </div>
            ))}
          </div>

          {selectedCaption && (
            <>
              <div className="p-4 bg-background mb-4">
                <p className="text-sm font-semibold mb-2">Caption Preview</p>
                <p className="text-sm whitespace-pre-wrap line-clamp-6">
                  {selectedCaption.content || 'Caption content available'}
                </p>
              </div>

              <Button
                label="Generate Video"
                icon={<HiSparkles className="text-xl" />}
                onClick={handleGenerateVideoWithCaption}
                isLoading={isGeneratingVideo}
                variant={ButtonVariant.DEFAULT}
                className="w-full"
              />
            </>
          )}
        </Card>
      ) : (
        <Alert type={AlertCategory.INFO}>
          No captions generated yet. Use the form above to generate your first
          caption.
        </Alert>
      )}
    </div>
  );
}
