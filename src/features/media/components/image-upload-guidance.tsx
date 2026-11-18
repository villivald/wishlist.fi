import shell from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import type { MediaTarget } from "../types";

export function ImageUploadGuidance({
  kind,
  id,
  creating = false,
  compact = false,
}: {
  kind: MediaTarget["kind"];
  id: string;
  creating?: boolean;
  compact?: boolean;
}) {
  const t = useText();
  if (compact)
    return (
      <div className={shell["image-guidance"]}>
        <p id={id} className={shell["field-help"]}>
          {t("JPEG, PNG or WebP. Up to 3 MB.")}
        </p>
        <details className={shell["image-limits"]}>
          <summary>{t("Image guidance")}</summary>
          <p className={shell["field-help"]}>
            {t(
              "Images are resized automatically. Without an image, the wish title appears on its cover.",
            )}
          </p>
          <p className={shell["field-help"]}>
            {t(
              "Use a still image up to 20 megapixels and 8,192 pixels per side. If an image is too large, resize it before uploading.",
            )}
          </p>
        </details>
      </div>
    );
  return (
    <div className={shell["image-guidance"]}>
      <p id={id} className={shell["field-help"]}>
        {t("JPEG, PNG, or WebP, up to 3 MB. Images are resized automatically.")}{" "}
        {creating && t("The image is saved when you add the wish.")}
      </p>
      <p className={shell["field-help"]}>
        {t(
          kind === "list"
            ? "Without a cover image, the list shows a stack of wish images, or its title if none are available."
            : kind === "avatar"
              ? "Without an avatar, a simple person icon is shown."
              : "Without an image, the wish title appears on its cover.",
        )}
      </p>
      <details className={shell["image-limits"]}>
        <summary>{t("Image limits")}</summary>
        <p className={shell["field-help"]}>
          {t(
            "Use a still image up to 20 megapixels and 8,192 pixels per side. If an image is too large, resize it before uploading.",
          )}
        </p>
      </details>
    </div>
  );
}
