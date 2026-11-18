"use client";
import { Check, Info, Trash2, Upload } from "lucide-react";
import {
  type ChangeEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import shell from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import { MAX_IMAGE_BYTES, type MediaImage as ImageDetails } from "../types";
import { suggestionUrl } from "../utils/image-suggestion";
import { ImagePreview } from "./image-preview";
import { ImageSuggestion } from "./image-suggestion";
import { ImageUploadGuidance } from "./image-upload-guidance";
import styles from "./media.module.css";
import { MediaImage } from "./media-image";

export type SelectedImage = {
  file: File;
  alt: string;
  previewUrl: string;
  source?: "link";
};
const subscribe = () => () => {};

export function ImagePicker({
  value,
  onChange,
  resetKey,
  productUrl,
  listId,
  creating = true,
  currentImage = null,
  removing = false,
  onToggleRemoval,
}: {
  value: SelectedImage | null;
  onChange: (image: SelectedImage | null) => void;
  resetKey: number;
  productUrl: string;
  listId: string;
  creating?: boolean;
  currentImage?: ImageDetails | null;
  removing?: boolean;
  onToggleRemoval?: () => void;
}) {
  const t = useText();

  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const focusSelection = useRef(false);
  const [error, setError] = useState("");
  const [skippedUrl, setSkippedUrl] = useState("");
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const file = value?.file;
  const url = suggestionUrl(productUrl);

  useEffect(() => {
    // Restore the native selection after React resets a form with validation errors.
    if (file && input.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.current.files = transfer.files;
      input.current.setCustomValidity("");
      if (focusSelection.current) {
        selectedHeading.current?.focus();
        focusSelection.current = false;
      }
    } else if (input.current) {
      input.current.value = "";
    }
  }, [file, resetKey]);

  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    const message = file
      ? file.size > MAX_IMAGE_BYTES
        ? "Choose an image up to 3 MB."
        : !["image/jpeg", "image/png", "image/webp"].includes(file.type)
          ? "Choose a JPEG, PNG, or WebP image."
          : ""
      : "";

    event.currentTarget.setCustomValidity(t.message(message));
    setError(message);
    if (file && !message) {
      setSkippedUrl(url);
      focusSelection.current = true;
    }
    onChange(
      file && !message
        ? { file, alt: value?.alt ?? "", previewUrl: URL.createObjectURL(file) }
        : null,
    );
  };

  const clear = () => {
    if (input.current) {
      input.current.value = "";
      input.current.setCustomValidity("");
    }
    setError("");
    onChange(null);
    uploadButton.current?.focus();
  };

  return (
    <div className={styles.picker}>
      <div className={styles["panel-header"]}>
        <h2 className={styles["panel-heading"]}>{t("Image (optional)")}</h2>
        <p className={styles.hint}>
          {creating
            ? t("The image is saved when you add the wish.")
            : t("Image changes are saved with the wish details.")}
        </p>
      </div>
      {currentImage && (
        <div className={styles["current-row"]} data-removing={removing}>
          <div className={styles["current-preview"]}>
            <MediaImage image={currentImage} compact sizes="72px" />
          </div>
          <div className={styles["current-copy"]}>
            <p className={styles["image-label"]}>{t("Current image")}</p>
            {!value && onToggleRemoval && (
              <button
                type="button"
                className={
                  removing ? shell["secondary-button"] : styles["quiet-button"]
                }
                onClick={onToggleRemoval}
              >
                {!removing && <Trash2 size={16} aria-hidden="true" />}
                {removing ? t("Keep current image") : t("Remove image")}
              </button>
            )}
          </div>
        </div>
      )}
      {removing && (
        <p className={styles["change-note"]} role="status">
          <Info size={17} aria-hidden="true" />
          <span>
            {t("The current image will be removed when you save changes.")}
          </span>
        </p>
      )}
      {!value && url && skippedUrl !== url && (
        <ImageSuggestion
          key={url}
          url={url}
          listId={listId}
          onDismiss={() => {
            setSkippedUrl(url);
            uploadButton.current?.focus();
          }}
          onSelect={(image) => {
            setError("");
            setSkippedUrl(url);
            focusSelection.current = true;
            onChange(image);
          }}
        />
      )}
      {value && (
        <section
          className={styles["selected-image"]}
          aria-labelledby={`${id}-selected`}
        >
          <div className={styles["selection-header"]}>
            <h3
              id={`${id}-selected`}
              ref={selectedHeading}
              tabIndex={-1}
              className={styles["selection-heading"]}
            >
              <Check size={18} aria-hidden="true" />
              {t("Selected image")}
            </h3>
            <button
              type="button"
              className={styles["quiet-button"]}
              onClick={clear}
            >
              {t("Remove selected image")}
            </button>
          </div>
          <ImagePreview
            src={value.previewUrl}
            alt={value.alt || t("Selected image preview")}
          />
          <p className={styles.filename}>
            {value.source === "link"
              ? t("Image from product link")
              : value.file.name}
          </p>
          {currentImage && (
            <p className={styles["change-note"]} role="status">
              <Info size={17} aria-hidden="true" />
              <span>
                {t(
                  "The selected image will replace the current one when you save changes.",
                )}
              </span>
            </p>
          )}
          <div className={shell.field}>
            <label htmlFor={`${id}-alt`}>
              {t("Image description (optional)")}
            </label>
            <input
              id={`${id}-alt`}
              name="imageAlt"
              maxLength={300}
              value={value.alt}
              onChange={(event) =>
                onChange({ ...value, alt: event.currentTarget.value })
              }
              aria-describedby={`${id}-alt-help`}
            />
            <p id={`${id}-alt-help`} className={shell["field-help"]}>
              {t(
                "Describe the image for people using screen readers. If blank, your wish title is used.",
              )}
            </p>
          </div>
        </section>
      )}
      <div className={styles["upload-area"]}>
        <label htmlFor={`${id}-file`} className={shell["visually-hidden"]}>
          {t("Image (optional)")}
        </label>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className={shell["visually-hidden"]}
          tabIndex={-1}
          disabled={!ready}
          onChange={select}
          onInvalid={(event) => {
            event.preventDefault();
            uploadButton.current?.focus();
          }}
          aria-invalid={!!error}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        />
        <button
          ref={uploadButton}
          type="button"
          className={`${shell["secondary-button"]} ${styles["upload-button"]}`}
          disabled={!ready}
          onClick={() => input.current?.click()}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        >
          <Upload size={18} aria-hidden="true" />
          {t("Choose image")}
        </button>
        <ImageUploadGuidance kind="wish" id={`${id}-help`} compact />
        {error && (
          <p id={`${id}-error`} role="alert" className={shell["error-text"]}>
            {t.message(error)}
          </p>
        )}
        {!value && error && (
          <button
            type="button"
            className={styles["quiet-button"]}
            onClick={clear}
          >
            {t("Remove selected image")}
          </button>
        )}
      </div>
    </div>
  );
}
