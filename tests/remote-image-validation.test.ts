import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateRemoteImage } from "@/features/media/service/remote-image-validation";
import { prepareImage } from "@/features/media/service/validation";
import { MAX_IMAGE_BYTES } from "@/features/media/types";
import {
  retryDelay,
  suggestionUrl,
} from "@/features/media/utils/image-suggestion";

const image = () =>
  sharp({
    create: { width: 96, height: 64, channels: 3, background: "#1264aa" },
  });
afterEach(() => vi.useRealTimers());

describe("remote image preparation", () => {
  it("does not process a cancelled import", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      validateRemoteImage(Buffer.from("unused"), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it.each(["jpeg", "png", "webp"] as const)(
    "keeps %s source bytes unchanged and applies lossy compression only on save",
    async (format) => {
      const source = await image().withMetadata().toFormat(format).toBuffer();
      const preview = await validateRemoteImage(source);
      expect(preview.data.equals(source)).toBe(true);
      expect(preview.contentType).toBe(`image/${format}`);
      const directSave = await prepareImage(source, false);
      const importedSave = await prepareImage(preview.data, false);
      expect(importedSave.data.equals(directSave.data)).toBe(true);
      expect((await sharp(importedSave.data).metadata()).exif).toBeUndefined();
    },
  );

  it.each(["avif", "gif"] as const)(
    "converts %s to a lossless supported upload and keeps decoded colours",
    async (format) => {
      const source = await image().toFormat(format).toBuffer();
      const preview = await validateRemoteImage(source);
      expect(preview.contentType).toBe("image/webp");
      const sourcePixels = await sharp(source).ensureAlpha().raw().toBuffer();
      const previewPixels = await sharp(preview.data)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(previewPixels.equals(sourcePixels)).toBe(true);
      expect((await prepareImage(preview.data, false)).width).toBe(96);
    },
  );

  it("uses the first frame of an animated GIF", async () => {
    const pixels = Buffer.alloc(20 * 40 * 3);
    for (let index = 0; index < 20 * 40; index += 1)
      pixels[index * 3 + (index < 400 ? 0 : 2)] = 255;
    const source = await sharp(pixels, {
      raw: { width: 20, height: 40, channels: 3, pageHeight: 20 },
    })
      .gif({ delay: [100, 100] })
      .toBuffer();
    expect((await sharp(source).metadata()).pages).toBe(2);
    const preview = await validateRemoteImage(source);
    expect(preview).toMatchObject({ width: 20, height: 20 });
    expect((await sharp(preview.data).metadata()).pages ?? 1).toBe(1);
    const animatedWebp = await sharp(source, { animated: true })
      .webp()
      .toBuffer();
    expect((await sharp(animatedWebp).metadata()).pages).toBe(2);
    expect((await validateRemoteImage(animatedWebp)).height).toBe(20);
  });

  it.each([
    Buffer.from("not an image"),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    ),
    Buffer.alloc(MAX_IMAGE_BYTES + 1),
  ])("rejects corrupt, vector or oversized sources", async (source) => {
    await expect(validateRemoteImage(source)).rejects.toThrow();
  });
});

describe("lookup input and retry state", () => {
  it("normalizes fragments but preserves product variants and query parameters", () => {
    expect(
      suggestionUrl(" https://shop.example/item?variant=blue#details "),
    ).toBe("https://shop.example/item?variant=blue");
    for (const input of [
      "",
      "file:///etc/passwd",
      "https://user:password@shop.example/item",
      "https://shop.example:8080/item",
      "https://shop.example/\nitem",
    ])
      expect(suggestionUrl(input)).toBe("");
  });
  it("respects retry delays and HTTP dates without overflowing browser timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T00:00:00Z"));
    expect(retryDelay("60")).toBe(60_000);
    expect(retryDelay("0")).toBe(0);
    expect(retryDelay("Wed, 18 Nov 2026 00:01:00 GMT")).toBe(60_000);
    expect(retryDelay("Wed, 18 Nov 2026 00:00:00 GMT")).toBe(0);
    expect(retryDelay("999999999999")).toBe(2_147_483_647);
    expect(retryDelay("invalid")).toBe(60_000);
  });
});
