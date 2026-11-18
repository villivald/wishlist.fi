import sharp from "sharp";
import { MAX_IMAGE_BYTES, MediaError } from "../types";

// Preserve ordinary uploads byte-for-byte until the normal save pipeline encodes
// them. This avoids a second lossy WebP generation just for the preview.
export const validateRemoteImage = async (
  input: Buffer,
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted();
  if (!input.length || input.length > MAX_IMAGE_BYTES)
    throw new MediaError("Choose an image up to 3 MB.");
  const image = sharp(input, {
    limitInputPixels: 20_000_000,
    failOn: "warning",
  });
  const metadata = await image.metadata();
  const ordinary = ["jpeg", "png", "webp"].includes(metadata.format ?? "");
  const avif = metadata.format === "heif" && metadata.compression === "av1";
  const gif = metadata.format === "gif";
  if (
    (!ordinary && !avif && !gif) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > 8192 ||
    metadata.height > 8192 ||
    metadata.width * metadata.height > 20_000_000
  ) {
    throw new MediaError("Unsupported product image");
  }
  if (ordinary && (metadata.pages ?? 1) === 1) {
    // Decode before displaying untrusted remote bytes, without re-encoding them.
    await image.clone().resize(1, 1).raw().timeout({ seconds: 5 }).toBuffer();
    signal?.throwIfAborted();
    const contentType =
      metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
    return {
      data: input,
      contentType,
      width: metadata.width,
      height: metadata.height,
      bytes: input.length,
    };
  }
  // Convert AVIF and the first animation frame losslessly to an upload type.
  // Bound the intermediate file as well as the source and decoded pixel count.
  for (const size of [1600, 1200, 800, 400]) {
    signal?.throwIfAborted();
    const { data, info } = await image
      .clone()
      .rotate()
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ lossless: true, effort: 2 })
      .timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    if (data.length <= MAX_IMAGE_BYTES)
      return {
        data,
        contentType: "image/webp",
        width: info.width,
        height: info.height,
        bytes: data.length,
      };
  }
  throw new MediaError("Choose an image up to 3 MB.");
};
