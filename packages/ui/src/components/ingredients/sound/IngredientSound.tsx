import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IngredientSoundProps } from '@genfeedai/props/content/ingredient.props';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';

export default function IngredientSound({ ingredients }: IngredientSoundProps) {
  return (
    <>
      {ingredients.map((sound: IIngredient) => (
        <Card key={sound.id} data-testid="ingredient-sound-item">
          <div className="flex items-center justify-between">
            <div className="flex flex-col h-full">
              <h3 className="font-medium text-lg">{sound.metadataLabel}</h3>
              <p className="text-muted-foreground">
                {sound.metadataDescription}
              </p>
            </div>

            <AudioPreviewPlayer
              audioUrl={sound.ingredientUrl}
              label={sound.metadataLabel || sound.id}
              stopOnUnmount
            />
          </div>
        </Card>
      ))}
    </>
  );
}
