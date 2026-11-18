"use client";
import { Link2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import shell from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import { MAX_IMAGE_BYTES } from "../types";
import { retryDelay } from "../utils/image-suggestion";
import type { SelectedImage } from "./image-picker";
import { ImagePreview } from "./image-preview";
import styles from "./media.module.css";

type Suggestion =
  | { status: "loading" | "unavailable" | "blocked" | "limited" | "failed" }
  | { status: "available"; file: File; previewUrl: string };

export function ImageSuggestion({
  url,
  listId,
  onSelect,
  onDismiss,
}: {
  url: string;
  listId: string;
  onSelect: (image: SelectedImage) => void;
  onDismiss: () => void;
}) {
  const t = useText();
  const id = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [suggestion, setSuggestion] = useState<Suggestion>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const [retryReady, setRetryReady] = useState(true);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let previewUrl: string | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      async () => {
        try {
          const response = await fetch("/api/media/suggestion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, listId }),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(30_000),
            ]),
          });
          if (controller.signal.aborted) return;
          if (response.status === 204) {
            setSuggestion({ status: "unavailable" });
            return;
          }
          const contentType = response.headers
            .get("content-type")
            ?.split(";")[0];
          if (contentType === "application/json") {
            const result = await response.json();
            if (controller.signal.aborted) return;
            const status =
              result.reason === "blocked"
                ? "blocked"
                : result.reason === "rate_limited"
                  ? "limited"
                  : "failed";
            setSuggestion({ status });
            if (status === "blocked" || status === "limited") {
              const delay = retryDelay(
                result.retryAfter ?? response.headers.get("retry-after"),
              );
              setRetryReady(delay === 0);
              if (delay)
                retryTimer = setTimeout(() => setRetryReady(true), delay);
            }
            return;
          }
          if (
            !response.ok ||
            !["image/jpeg", "image/png", "image/webp"].includes(
              contentType ?? "",
            )
          )
            throw new Error("Image lookup failed");
          const blob = await response.blob();
          if (!blob.size || blob.size > MAX_IMAGE_BYTES)
            throw new Error("Invalid preview size");
          const extension =
            contentType === "image/jpeg"
              ? "jpg"
              : contentType === "image/png"
                ? "png"
                : "webp";
          const file = new File([blob], `product-image.${extension}`, {
            type: contentType,
          });
          if (controller.signal.aborted) return;
          previewUrl = URL.createObjectURL(file);
          setSuggestion({ status: "available", file, previewUrl });
        } catch {
          if (!controller.signal.aborted) setSuggestion({ status: "failed" });
        }
      },
      attempt ? 0 : 800,
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [attempt, listId, url]);

  const previewing =
    suggestion.status === "loading" || suggestion.status === "available";
  const statusText = () => {
    if (suggestion.status === "available" && !imageReady)
      return t("Preparing image preview…");
    switch (suggestion.status) {
      case "loading":
        return t("Looking for an image…");
      case "unavailable":
        return t(
          "No image found. You can upload your own or continue without one.",
        );
      case "blocked":
        return t(
          "This shop did not allow an image preview. You can upload your own or continue without one.",
        );
      case "limited":
        return t(
          "Image lookup is temporarily limited. You can upload your own or try again later.",
        );
      case "failed":
        return t(
          "The image could not be loaded. You can upload your own or continue without one.",
        );
      default:
        return t("Choose this image or upload your own.");
    }
  };

  return (
    <section className={styles.suggestion} aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className={styles["suggestion-heading"]}>
        <Link2 size={17} aria-hidden="true" />
        {t("Image from product link")}
      </h3>
      {previewing && (
        <ImagePreview
          src={
            suggestion.status === "available"
              ? suggestion.previewUrl
              : undefined
          }
          alt={t("Suggested product image")}
          loading={!imageReady}
          onLoad={() => setImageReady(true)}
          onError={() => setSuggestion({ status: "failed" })}
        />
      )}
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        className={styles["suggestion-status"]}
      >
        {statusText()}
      </p>
      <div className={`${shell.actions} ${styles["image-actions"]}`}>
        {previewing ? (
          <button
            type="button"
            disabled={suggestion.status !== "available" || !imageReady}
            className={`${shell["secondary-button"]} ${styles["accept-button"]}`}
            onClick={() => {
              if (suggestion.status === "available")
                onSelect({
                  file: suggestion.file,
                  alt: "",
                  source: "link",
                  previewUrl: URL.createObjectURL(suggestion.file),
                });
            }}
          >
            {t("Use this image")}
          </button>
        ) : (
          <button
            type="button"
            className={shell["secondary-button"]}
            disabled={!retryReady}
            onClick={() => {
              setSuggestion({ status: "loading" });
              setImageReady(false);
              setRetryReady(true);
              setAttempt((value) => value + 1);
              statusRef.current?.focus();
            }}
          >
            {retryReady ? t("Try again") : t("Try again later")}
          </button>
        )}
        <button
          type="button"
          className={styles["quiet-button"]}
          onClick={onDismiss}
        >
          {t("Dismiss")}
        </button>
      </div>
    </section>
  );
}
