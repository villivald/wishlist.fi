import { previewImageUrls } from "./product-image-urls";
import { validateRemoteImage } from "./remote-image-validation";
import { publicRemoteUrl, readRemoteResource } from "./remote-resource";

export const suggestRemoteImage = async (
  input: string,
  signal: AbortSignal,
) => {
  const page = await readRemoteResource(publicRemoteUrl(input), false, signal);
  if (page.image) return validateRemoteImage(page.body, signal);
  let failure: unknown;
  for (const url of previewImageUrls(page.body.toString("utf8"), page.url)) {
    try {
      const image = await readRemoteResource(
        url,
        true,
        AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
        page.url,
      );
      return await validateRemoteImage(image.body, signal);
    } catch (error) {
      signal.throwIfAborted();
      failure = error;
    }
  }
  if (failure) throw failure;
  return null;
};
