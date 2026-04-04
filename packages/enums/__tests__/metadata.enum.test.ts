import { describe, expect, it } from 'vitest';
import { MetadataExtension, MetadataStyle } from '../src/metadata.enum';

describe('metadata.enum', () => {
  describe('MetadataStyle', () => {
    it('should have 41 members', () => {
      expect(Object.values(MetadataStyle)).toHaveLength(41);
    });

    it('should have correct values', () => {
      expect(MetadataStyle._3D_MODEL).toBe('3d-model');
      expect(MetadataStyle.ANALOG_FILM).toBe('analog-film');
      expect(MetadataStyle.ANIME).toBe('anime');
      expect(MetadataStyle.ASMR).toBe('asmr');
      expect(MetadataStyle.AUTHENTIC).toBe('authentic');
      expect(MetadataStyle.BOLD).toBe('bold');
      expect(MetadataStyle.BRANDED).toBe('branded');
      expect(MetadataStyle.CINEMATIC).toBe('cinematic');
      expect(MetadataStyle.COMIC_BOOK).toBe('comic-book');
      expect(MetadataStyle.COMMERCIAL).toBe('commercial');
      expect(MetadataStyle.CORPORATE).toBe('corporate');
      expect(MetadataStyle.CYBERPUNK).toBe('cyberpunk');
      expect(MetadataStyle.DIGITAL_ART).toBe('digital-art');
      expect(MetadataStyle.DOCUMENTARY).toBe('documentary');
      expect(MetadataStyle.EDITORIAL).toBe('editorial');
      expect(MetadataStyle.EDUCATIONAL).toBe('educational');
      expect(MetadataStyle.FANTASY_ART).toBe('fantasy-art');
      expect(MetadataStyle.FASHION).toBe('fashion');
      expect(MetadataStyle.INFOGRAPHIC).toBe('infographic');
      expect(MetadataStyle.ISOMETRIC).toBe('isometric');
      expect(MetadataStyle.LIFESTYLE).toBe('lifestyle');
      expect(MetadataStyle.LINE_ART).toBe('line-art');
      expect(MetadataStyle.LOWPOLY).toBe('lowpoly');
      expect(MetadataStyle.MEME).toBe('meme');
      expect(MetadataStyle.METAL).toBe('metal');
      expect(MetadataStyle.MINIMAL).toBe('minimal');
      expect(MetadataStyle.MODELING_COMPOUND).toBe('modeling-compound');
      expect(MetadataStyle.NEONPUNK).toBe('neonpunk');
      expect(MetadataStyle.ORIGAMI).toBe('origami');
      expect(MetadataStyle.PHOTOGRAPHIC).toBe('photographic');
      expect(MetadataStyle.PIXEL_ART).toBe('pixel-art');
      expect(MetadataStyle.PORTRAIT).toBe('portrait');
      expect(MetadataStyle.PROMOTIONAL).toBe('promotional');
      expect(MetadataStyle.SOCIAL_MEDIA).toBe('social-media');
      expect(MetadataStyle.SPACE).toBe('space');
      expect(MetadataStyle.STEAMPUNK).toBe('steampunk');
      expect(MetadataStyle.SURREALISM).toBe('surrealism');
      expect(MetadataStyle.THUMBNAIL).toBe('thumbnail');
      expect(MetadataStyle.TRANSFORMATION).toBe('transformation');
      expect(MetadataStyle.VINTAGE).toBe('vintage');
      expect(MetadataStyle.WATERCOLOR).toBe('watercolor');
    });
  });

  describe('MetadataExtension', () => {
    it('should have 11 members', () => {
      expect(Object.values(MetadataExtension)).toHaveLength(11);
    });

    it('should have correct values', () => {
      expect(MetadataExtension.JPEG).toBe('jpeg');
      expect(MetadataExtension.JPG).toBe('jpg');
      expect(MetadataExtension.PNG).toBe('png');
      expect(MetadataExtension.GIF).toBe('gif');
      expect(MetadataExtension.WEBP).toBe('webp');
      expect(MetadataExtension.MP4).toBe('mp4');
      expect(MetadataExtension.WEBM).toBe('webm');
      expect(MetadataExtension.MOV).toBe('mov');
      expect(MetadataExtension.AVI).toBe('avi');
      expect(MetadataExtension.MP3).toBe('mp3');
      expect(MetadataExtension.WAV).toBe('wav');
    });
  });
});
