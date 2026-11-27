import type { ReactNode } from "react";
import shell from "@/components/shell.module.css";
import styles from "./cards.module.css";
import type { WishTone } from "./wish-tones";

export const wishGridClassName = `${shell["list-grid"]} ${styles["wish-grid"]}`;

export function WishCard({
  children,
  tone = "butter",
  reserved = false,
}: {
  children: ReactNode;
  tone?: WishTone;
  reserved?: boolean;
}) {
  return (
    <li
      className={`${shell["list-card"]} ${styles.tone} ${styles["wish-card"]}`}
      data-wish-tone={tone}
      data-reserved={reserved || undefined}
    >
      {children}
    </li>
  );
}
