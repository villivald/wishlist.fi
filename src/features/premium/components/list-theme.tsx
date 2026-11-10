import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { listThemes, resolveListTheme } from "../themes";
import styles from "./personalization.module.css";

export function ListTheme({
  theme,
  children,
  compact = false,
  media = false,
}: {
  theme?: string;
  children: ReactNode;
  compact?: boolean;
  media?: boolean;
}) {
  const id = resolveListTheme(theme);
  if (media && id === "classic") return children;
  return (
    <div
      className={`${styles.theme} ${media ? styles.media : compact ? styles.compact : styles.hero}`}
      data-list-theme={id}
      style={{ "--list-accent": listThemes[id].accent } as CSSProperties}
    >
      <div className={styles.content}>{children}</div>
      {id !== "classic" && !media && (
        <Image
          className={styles.artwork}
          src={`/illustrations/themes/${listThemes[id].artwork}`}
          width={1000}
          height={700}
          sizes="(max-width: 760px) 100vw, 1100px"
          preload={!compact}
          alt=""
        />
      )}
    </div>
  );
}
