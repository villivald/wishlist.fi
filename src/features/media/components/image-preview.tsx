"use client";
import { ImageIcon, LoaderCircle } from "lucide-react";
import Image from "next/image";
import styles from "./media.module.css";

export function ImagePreview({
  src,
  alt,
  loading = false,
  onLoad,
  onError,
}: {
  src?: string;
  alt: string;
  loading?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  return (
    <div
      className={styles["preview-frame"]}
      data-loading={loading}
      aria-busy={loading}
    >
      {loading && (
        <div className={styles["preview-placeholder"]} aria-hidden="true">
          <ImageIcon size={32} />
          <LoaderCircle size={20} className={styles.spinner} />
        </div>
      )}
      {src && (
        <Image
          src={src}
          alt={alt}
          width={640}
          height={480}
          unoptimized
          className={styles["preview-image"]}
          onLoad={onLoad}
          onError={onError}
        />
      )}
    </div>
  );
}
