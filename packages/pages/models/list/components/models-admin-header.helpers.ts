import { ModelCategory } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { IconType } from 'react-icons';
import {
  HiDocumentText,
  HiFilm,
  HiMusicalNote,
  HiPhoto,
} from 'react-icons/hi2';

export type DefaultModelMap = {
  image?: IModel;
  video?: IModel;
  music?: IModel;
  text?: IModel;
};

export type DefaultModelCard = {
  cardClassName?: string;
  colorClass: string;
  count: number;
  description: string;
  icon: IconType;
  label: string;
};

export function buildDefaultModelMap(models: IModel[]): DefaultModelMap {
  const defaults: DefaultModelMap = {};
  for (const model of models) {
    if (model.isDefault) {
      if (model.category === ModelCategory.IMAGE) {
        defaults.image = model;
      } else if (model.category === ModelCategory.VIDEO) {
        defaults.video = model;
      } else if (model.category === ModelCategory.MUSIC) {
        defaults.music = model;
      } else if (model.category === ModelCategory.TEXT) {
        defaults.text = model;
      }
    }
  }
  return defaults;
}

export function buildDefaultModelCards(
  defaultModels: DefaultModelMap,
  category: string | undefined,
): DefaultModelCard[] {
  const allCards = [
    {
      categoryMatch: 'image',
      colorClass: 'bg-purple-500/20 text-purple-400',
      count: 0,
      description: defaultModels.image?.label || 'Not set',
      icon: HiPhoto as IconType,
      label: 'Image',
    },
    {
      categoryMatch: 'video',
      colorClass: 'bg-blue-500/20 text-blue-400',
      count: 0,
      description: defaultModels.video?.label || 'Not set',
      icon: HiFilm as IconType,
      label: 'Video',
    },
    {
      categoryMatch: 'music',
      colorClass: 'bg-amber-500/20 text-amber-400',
      count: 0,
      description: defaultModels.music?.label || 'Not set',
      icon: HiMusicalNote as IconType,
      label: 'Music',
    },
    {
      categoryMatch: 'text',
      colorClass: 'bg-green-500/20 text-green-400',
      count: 0,
      description: defaultModels.text?.label || 'Not set',
      icon: HiDocumentText as IconType,
      label: 'Text',
    },
  ];

  return allCards.map((card) => {
    const isActiveCategory =
      category === 'all' ||
      category === card.categoryMatch ||
      (category === 'other' && card.categoryMatch === 'text');

    return {
      cardClassName: isActiveCategory ? undefined : 'opacity-50',
      colorClass: card.colorClass,
      count: card.count,
      description: card.description,
      icon: card.icon,
      label: card.label,
    };
  });
}
