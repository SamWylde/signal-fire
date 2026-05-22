import sharp from 'sharp';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PostingPlatform } from './types.js';

export type PlatformImageSpec = {
  maxWidth: number;
  maxHeight: number;
  maxFileBytes: number;
  /** Optional [minRatio, maxRatio] of width/height. If image is outside this, center-crop. */
  aspectRange?: [number, number];
};

export const PLATFORM_IMAGE_SPECS: Record<PostingPlatform, PlatformImageSpec> = {
  linkedin: { maxWidth: 7680, maxHeight: 4320, maxFileBytes: 5 * 1024 * 1024 },
  x: { maxWidth: 4096, maxHeight: 4096, maxFileBytes: 5 * 1024 * 1024 },
  facebook: { maxWidth: 2048, maxHeight: 2048, maxFileBytes: 30 * 1024 * 1024 },
  instagram: {
    maxWidth: 1080,
    maxHeight: 1350,
    maxFileBytes: 30 * 1024 * 1024,
    aspectRange: [0.8, 1.91],
  },
  tiktok: { maxWidth: 4096, maxHeight: 4096, maxFileBytes: 20 * 1024 * 1024 },
  youtube: { maxWidth: 1920, maxHeight: 1080, maxFileBytes: 2 * 1024 * 1024 },
};

export type ResizedVariant = {
  platform: string;
  path: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
};

/**
 * Generates platform-specific JPEG variants of the input image.
 * Returns one entry per platform. If the original already fits a platform's
 * specs, the variant is still emitted (re-saved as JPEG for consistency).
 */
export async function resizeImageForPlatforms(
  inputPath: string,
  outputDir: string,
  baseName: string,
): Promise<ResizedVariant[]> {
  const results: ResizedVariant[] = [];
  for (const [platform, spec] of Object.entries(PLATFORM_IMAGE_SPECS)) {
    const variant = await resizeOne(inputPath, outputDir, baseName, platform, spec);
    results.push(variant);
  }
  return results;
}

async function resizeOne(
  inputPath: string,
  outputDir: string,
  baseName: string,
  platform: string,
  spec: PlatformImageSpec,
): Promise<ResizedVariant> {
  // Load + rotate (apply EXIF orientation) so we work on the visually-correct image.
  const inputPipeline = () => sharp(inputPath).rotate();

  let pipeline = inputPipeline();
  const meta = await pipeline.metadata();
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;

  // Optional: aspect-ratio center crop (Instagram only via spec.aspectRange).
  if (spec.aspectRange && origW > 0 && origH > 0) {
    const ratio = origW / origH;
    const [minR, maxR] = spec.aspectRange;
    if (ratio < minR) {
      // Too tall — crop top/bottom to bring ratio up to minR.
      const targetH = Math.round(origW / minR);
      pipeline = pipeline.extract({
        left: 0,
        top: Math.max(0, Math.floor((origH - targetH) / 2)),
        width: origW,
        height: targetH,
      });
    } else if (ratio > maxR) {
      const targetW = Math.round(origH * maxR);
      pipeline = pipeline.extract({
        left: Math.max(0, Math.floor((origW - targetW) / 2)),
        top: 0,
        width: targetW,
        height: origH,
      });
    }
  }

  pipeline = pipeline.resize({
    width: spec.maxWidth,
    height: spec.maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Iteratively compress until under maxFileBytes (or quality bottoms out).
  let quality = 85;
  let buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  while (buffer.length > spec.maxFileBytes && quality > 40) {
    quality -= 10;
    // Re-derive pipeline each pass (sharp pipelines are one-shot after toBuffer).
    let p = inputPipeline();
    if (spec.aspectRange && origW > 0 && origH > 0) {
      const ratio = origW / origH;
      const [minR, maxR] = spec.aspectRange;
      if (ratio < minR) {
        const targetH = Math.round(origW / minR);
        p = p.extract({
          left: 0,
          top: Math.max(0, Math.floor((origH - targetH) / 2)),
          width: origW,
          height: targetH,
        });
      } else if (ratio > maxR) {
        const targetW = Math.round(origH * maxR);
        p = p.extract({
          left: Math.max(0, Math.floor((origW - targetW) / 2)),
          top: 0,
          width: targetW,
          height: origH,
        });
      }
    }
    p = p.resize({
      width: spec.maxWidth,
      height: spec.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });
    buffer = await p.jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  const outName = `${baseName}.${platform}.jpg`;
  const outPath = path.join(outputDir, outName);
  await fs.writeFile(outPath, buffer);
  const finalMeta = await sharp(buffer).metadata();
  return {
    platform,
    path: outPath,
    name: outName,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    bytes: buffer.length,
  };
}
