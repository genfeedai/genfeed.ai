import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAudioPlayer } from '@genfeedai/hooks/media/use-audio-player/use-audio-player';
import type { IIngredient } from '@genfeedai/interfaces';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import type { IngredientSoundProps } from '@genfeedai/props/content/ingredient.props';
import { logger } from '@genfeedai/services/core/logger.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { HiPause, HiPlay } from 'react-icons/hi2';

export default function IngredientSound({
  ingredients,
  setIngredients,
}: IngredientSoundProps) {
  const { play, stop } = useAudioPlayer();

  function playVoice(sound: IIngredient, onEnded: () => void) {
    logger.info('playVoice', sound.ingredientUrl);

    if (sound.isPlaying) {
      return stopAll();
    }

    setIngredients((prev: IIngredient[]) =>
      prev.map(
        (item: IIngredient) =>
          new Ingredient({
            ...item,
            isPlaying: item.id === sound.id,
          }),
      ),
    );

    if (sound.ingredientUrl) {
      play(sound.ingredientUrl, onEnded);
    }
  }

  function stopAll() {
    stop();

    setIngredients((prev: IIngredient[]) =>
      prev.map(
        (item: IIngredient) => new Ingredient({ ...item, isPlaying: false }),
      ),
    );
  }

  return (
    <>
      {ingredients.map((sound: IIngredient, index: number) => (
        <Card key={index}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col h-full">
              <h3 className="font-medium text-lg">{sound.metadataLabel}</h3>
              <p className="text-muted-foreground">
                {sound.metadataDescription}
              </p>
            </div>

            <Button
              label={
                sound.isPlaying ? (
                  <HiPause className="text-2xl" />
                ) : (
                  <HiPlay className="text-2xl" />
                )
              }
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.ICON}
              className="transition-all duration-300"
              onClick={() => playVoice(sound, stopAll)}
            />
          </div>
        </Card>
      ))}
    </>
  );
}
