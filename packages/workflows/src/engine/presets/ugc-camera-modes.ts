export const UGC_CAMERA_MODES = [
  'selfie-handheld',
  'tripod-vlog',
  'filmed-by-another-person',
] as const;

export type UgcCameraMode = (typeof UGC_CAMERA_MODES)[number];

export type UgcCameraModeCopy = {
  cameraImperfection: string;
  description: string;
  framingAnchor: string;
  id: string;
  name: string;
};

export const UGC_CAMERA_MODE_COPY: Record<UgcCameraMode, UgcCameraModeCopy> = {
  'filmed-by-another-person': {
    cameraImperfection:
      'Amateur phone clip filmed by another person standing nearby: rear camera at eye level, slight operator sway, no gimbal smoothness, no zoom.',
    description:
      'Someone else holds the phone at eye level. Slight operator sway, no gimbal smoothness.',
    framingAnchor:
      'Framing anchors: keep consistent medium shot as filmed by another person, same camera height, clothing, accessories, light, exposure, and white balance throughout. Only visible anchors; never inferred traits.',
    id: 'ugc_filmed_by_another',
    name: 'Filmed by Another Person',
  },
  'selfie-handheld': {
    cameraImperfection:
      'Amateur phone selfie: front-facing smartphone, handheld selfie sway and breathing motion, no jitter, no zoom, no gimbal smoothness.',
    description:
      'Front-facing phone selfie with handheld sway and breathing motion. No jitter, no zoom.',
    framingAnchor:
      'Framing anchors: keep consistent selfie framing, eyes near the upper third, same camera height, clothing, accessories, light, exposure, and white balance throughout. Only visible anchors; never inferred traits.',
    id: 'ugc_selfie_handheld',
    name: 'Selfie Handheld',
  },
  'tripod-vlog': {
    cameraImperfection:
      'Amateur phone vlog: smartphone mounted on a tripod, static locked-off frame, no pan, no tilt, no zoom.',
    description:
      'Phone on a tripod, static locked-off talking-head vlog. No pan, tilt, or zoom.',
    framingAnchor:
      'Framing anchors: keep consistent framing with the phone-on-tripod in shot, locked talking-head crop, same camera height, clothing, accessories, light, exposure, and white balance throughout. Only visible anchors; never inferred traits.',
    id: 'ugc_tripod_vlog',
    name: 'Tripod Vlog',
  },
};
