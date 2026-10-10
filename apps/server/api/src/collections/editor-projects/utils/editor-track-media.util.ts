import { EditorTrackType } from '@genfeedai/contracts';
import type { IEditorTrack } from '@genfeedai/contracts/interfaces';

export function editorTrackIngredientIds(tracks: IEditorTrack[]): string[] {
  return Array.from(
    new Set(
      tracks
        .filter((track) => track.type !== EditorTrackType.TEXT)
        .flatMap((track) => track.clips.map((clip) => clip.ingredientId))
        .filter((ingredientId) => Boolean(ingredientId)),
    ),
  );
}

export function relinkEditorTracks(
  tracks: IEditorTrack[],
  urlByIngredientId: ReadonlyMap<string, string>,
): IEditorTrack[] {
  return tracks.map((track) =>
    track.type === EditorTrackType.TEXT
      ? track
      : {
          ...track,
          clips: track.clips.map((clip) => {
            const ingredientUrl = urlByIngredientId.get(clip.ingredientId);
            return ingredientUrl ? { ...clip, ingredientUrl } : clip;
          }),
        },
  );
}
