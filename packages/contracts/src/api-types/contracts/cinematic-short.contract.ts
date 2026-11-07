import { z } from 'zod';

const key = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const aspectRatio = z.string().regex(/^[1-9]\d*:[1-9]\d*$/);
const fps = z.number().int().min(12).max(60);

export const cinematicShortDeliveryFormats = ['mp4', 'html'] as const;

export const cinematicShortShotSchema = z
  .object({
    key,
    title: z.string().min(1).max(100),
    startSeconds: z.number().min(0).max(600),
    endSeconds: z.number().positive().max(600),
    // Templates may use {{subject}}, {{setting}}, {{brand}}, {{titleText}} and {{tagline}}.
    camera: z.string().min(1).max(600),
    action: z.string().min(1).max(1200),
    sound: z.string().min(1).max(600),
  })
  .strict();

export const cinematicShortPaletteStopSchema = z
  .object({
    fromSecond: z.number().min(0).max(600),
    name: z.string().min(1).max(100),
    palette: z.string().min(1).max(300),
  })
  .strict();

/** The values a caller fills in. Everything else comes from the preset. */
export const cinematicShortSlotsSchema = z
  .object({
    subject: z.string().trim().min(1).max(400),
    setting: z.string().trim().min(1).max(600),
    titleText: z.string().trim().min(1).max(120),
    tagline: z.string().trim().min(1).max(200).optional(),
    sealText: z.string().trim().min(1).max(20).optional(),
    runtimeSeconds: z.number().positive().max(600).optional(),
    fps: fps.optional(),
    // Feel only. Naming a studio, artist or film is rejected by the compiler.
    styleByFeel: z.string().trim().min(1).max(1200).optional(),
    soundSpec: z.string().trim().min(1).max(1200).optional(),
    paletteArc: z
      .array(cinematicShortPaletteStopSchema)
      .min(1)
      .max(8)
      .optional(),
    shots: z.array(cinematicShortShotSchema).min(1).max(24).optional(),
    extraNegatives: z
      .array(z.string().trim().min(1).max(200))
      .max(20)
      .optional(),
    qaPassLimit: z.number().int().min(1).max(5).optional(),
    deliveryFormat: z.enum(cinematicShortDeliveryFormats).optional(),
  })
  .strict();

export const cinematicShortSchema = z
  .object({
    key: z.string().min(1).max(160),
    label: z.string().min(1).max(160),
    description: z.string().max(1000),
    aspectRatio,
    fps,
    // Hard cap; a caller can shorten a film, never stretch it past this.
    maxRuntimeSeconds: z.number().positive().max(600),
    shots: z.array(cinematicShortShotSchema).min(1).max(24),
    paletteArc: z.array(cinematicShortPaletteStopSchema).min(1).max(8),
    styleByFeel: z.string().min(1).max(1200),
    soundSpec: z.string().min(1).max(1200),
    negativeList: z.array(z.string().min(1).max(200)).min(1).max(40),
    titleCard: z
      .object({
        treatment: z.string().min(1).max(600),
        hasSeal: z.boolean(),
      })
      .strict(),
    delivery: z
      .object({
        format: z.enum(cinematicShortDeliveryFormats),
        hasSound: z.boolean(),
      })
      .strict(),
    qaPassLimit: z.number().int().min(1).max(5),
    example: cinematicShortSlotsSchema,
  })
  .strict()
  .superRefine((preset, context) => {
    const issue = (message: string, path: string) =>
      context.addIssue({ code: 'custom', message, path: [path] });
    if (
      new Set(preset.shots.map((shot) => shot.key)).size !== preset.shots.length
    )
      issue('Shot keys must be unique', 'shots');
    const first = preset.shots[0];
    const last = preset.shots[preset.shots.length - 1];
    if (first?.startSeconds !== 0) issue('The first shot starts at 0', 'shots');
    if (preset.shots.some((shot) => shot.endSeconds <= shot.startSeconds))
      issue('Every shot must end after it starts', 'shots');
    if (
      preset.shots.some(
        (shot, index) =>
          index > 0 &&
          shot.startSeconds !== preset.shots[index - 1]?.endSeconds,
      )
    )
      issue('Shots must follow each other with no gap or overlap', 'shots');
    if (last && last.endSeconds > preset.maxRuntimeSeconds)
      issue('Shots run past maxRuntimeSeconds', 'shots');
  });

export type CinematicShort = z.infer<typeof cinematicShortSchema>;
export type CinematicShortShot = z.infer<typeof cinematicShortShotSchema>;
export type CinematicShortSlots = z.infer<typeof cinematicShortSlotsSchema>;
export type CinematicShortPaletteStop = z.infer<
  typeof cinematicShortPaletteStopSchema
>;
