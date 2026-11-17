// Image sizes and quality for the store, in one place (1.8.4).
// Uploads keep a high-quality master once; every page then receives a copy sized for it,
// so loading speed depends on the delivered copy, not on the stored master.

/** Longest side of the stored master, and its WebP quality (0–1). */
export const UPLOAD_MAX_SIZE = 2048;
export const UPLOAD_QUALITY = 0.9;
// Uploads are always re-encoded in the browser: that also strips EXIF data (GPS location, device) from phone photos.

/** Widths the thumbnail service produces. 256/384/640 are the card sizes and are unchanged from before 1.8.4. */
export const THUMBNAIL_WIDTHS = [256, 384, 640, 1080, 1280];
export const CARD_QUALITY = 75;
export const LARGE_QUALITY = 82;
export const LARGE_AVIF_QUALITY = 60;

/** Requested display width → produced width. Cards keep their old sizes; product pages get 1080/1280. */
export function thumbnailWidth(requested: number) {
  return requested <= 320 ? 256 : requested <= 480 ? 384 : requested <= 640 ? 640 : requested <= 1080 ? 1080 : 1280;
}

/** Output format and quality for a width. AVIF only for large product-page sizes, and only when asked for. */
export function thumbnailFormat(width: number, requested: string | null) {
  const large = width >= 1080, avif = large && requested === "avif";
  return {
    mime: avif ? "image/avif" : "image/webp",
    extension: avif ? "avif" : "webp",
    suffix: avif ? "-avif" : large ? "-q82" : "",
    quality: avif ? LARGE_AVIF_QUALITY : large ? LARGE_QUALITY : CARD_QUALITY,
  };
}
