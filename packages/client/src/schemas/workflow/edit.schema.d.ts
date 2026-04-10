import { IngredientFormat } from '@genfeedai/enums';
import { z } from 'zod';
export declare const editFormSchema: z.ZodObject<
  {
    enhanceModel: z.ZodOptional<
      z.ZodEnum<{
        'Standard V2': 'Standard V2';
        'Low Resolution V2': 'Low Resolution V2';
        CGI: 'CGI';
        'High Fidelity V2': 'High Fidelity V2';
        'Text Refine': 'Text Refine';
      }>
    >;
    faceEnhancement: z.ZodOptional<z.ZodBoolean>;
    faceEnhancementCreativity: z.ZodOptional<z.ZodNumber>;
    faceEnhancementStrength: z.ZodOptional<z.ZodNumber>;
    format: z.ZodOptional<
      z.ZodEnum<{
        landscape: IngredientFormat.LANDSCAPE;
        portrait: IngredientFormat.PORTRAIT;
        square: IngredientFormat.SQUARE;
      }>
    >;
    fps: z.ZodOptional<
      z.ZodUnion<
        readonly [
          z.ZodLiteral<15>,
          z.ZodLiteral<30>,
          z.ZodLiteral<45>,
          z.ZodLiteral<60>,
        ]
      >
    >;
    height: z.ZodOptional<z.ZodNumber>;
    model: z.ZodString;
    outputFormat: z.ZodOptional<
      z.ZodEnum<{
        jpg: 'jpg';
        png: 'png';
      }>
    >;
    resolution: z.ZodOptional<
      z.ZodEnum<{
        '720p': '720p';
        '1080p': '1080p';
        '4k': '4k';
      }>
    >;
    subjectDetection: z.ZodOptional<
      z.ZodEnum<{
        None: 'None';
        All: 'All';
        Foreground: 'Foreground';
        Background: 'Background';
      }>
    >;
    text: z.ZodString;
    upscaleFactor: z.ZodOptional<
      z.ZodEnum<{
        '2x': '2x';
        '4x': '4x';
        '6x': '6x';
      }>
    >;
    width: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strip
>;
//# sourceMappingURL=edit.schema.d.ts.map
