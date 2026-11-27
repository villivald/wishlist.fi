"use client";
import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { localizedPath } from "@/i18n/config";
import { useText } from "@/i18n/use-text";
import styles from "./cards.module.css";

export function CopyLink({ path, title }: { path: string; title: string }) {
  const t = useText();

  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        new URL(localizedPath(path, t.locale), window.location.origin).href,
      );
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className={styles["copy-control"]}>
      <button
        type="button"
        className={styles["icon-action"]}
        onClick={copy}
        aria-label={t("Copy link to {value0}", { value0: title })}
        title={t("Copy link")}
      >
        {status === "copied" ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Link2 size={18} aria-hidden="true" />
        )}
      </button>
      <span
        role={status === "idle" ? undefined : "status"}
        aria-live="polite"
        aria-atomic="true"
        className={styles["copy-status"]}
      >
        {status === "copied"
          ? t("Link copied")
          : status === "failed"
            ? t("Copy unavailable. Open this item and copy its address.")
            : ""}
      </span>
    </div>
  );
}
