import { ModalEnum } from '@genfeedai/contracts';
import { CameraMovementsService } from '@genfeedai/services/elements/camera-movements.service';
import { CamerasService } from '@genfeedai/services/elements/cameras.service';
import { FontFamiliesService } from '@genfeedai/services/elements/font-families.service';
import { LensesService } from '@genfeedai/services/elements/lenses.service';
import { LightingsService } from '@genfeedai/services/elements/lightings.service';
import { MoodsService } from '@genfeedai/services/elements/moods.service';
import { ScenesService } from '@genfeedai/services/elements/scenes.service';

const DEFAULT_VALUES = { description: '', key: '', label: '' };
const PLATFORM_DEFAULT_VALUES = {
  ...DEFAULT_VALUES,
  isActive: true,
  sortOrder: 0,
};

export const ELEMENT_CREATE_MODAL_CONFIG = {
  [ModalEnum.CAMERA]: {
    defaultValues: PLATFORM_DEFAULT_VALUES,
    serviceFactory: CamerasService.getInstance,
    titleKey: 'camera',
  },
  [ModalEnum.CAMERA_MOVEMENT]: {
    defaultValues: PLATFORM_DEFAULT_VALUES,
    serviceFactory: CameraMovementsService.getInstance,
    titleKey: 'cameraMovement',
  },
  [ModalEnum.FONT_FAMILY]: {
    defaultValues: DEFAULT_VALUES,
    serviceFactory: FontFamiliesService.getInstance,
    titleKey: 'fontFamily',
  },
  [ModalEnum.LENS]: {
    defaultValues: PLATFORM_DEFAULT_VALUES,
    serviceFactory: LensesService.getInstance,
    titleKey: 'lens',
  },
  [ModalEnum.LIGHTING]: {
    defaultValues: PLATFORM_DEFAULT_VALUES,
    serviceFactory: LightingsService.getInstance,
    titleKey: 'lighting',
  },
  [ModalEnum.MOOD]: {
    defaultValues: PLATFORM_DEFAULT_VALUES,
    serviceFactory: MoodsService.getInstance,
    titleKey: 'mood',
  },
  [ModalEnum.SCENE]: {
    defaultValues: PLATFORM_DEFAULT_VALUES,
    serviceFactory: ScenesService.getInstance,
    titleKey: 'scene',
  },
};
