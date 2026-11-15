"use client";

import Image from "next/image";
import { useId, useState } from "react";
import shell from "@/components/shell.module.css";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { listThemeGroups, listThemes, resolveListTheme } from "../themes";
import { ListTheme } from "./list-theme";
import styles from "./personalization.module.css";

export function ThemePicker({
  current = "classic",
  premium,
  initial,
  name = "theme",
  demo = false,
}: {
  current?: string;
  initial?: string;
  premium: boolean;
  name?: string;
  demo?: boolean;
}) {
  const t = useText();
  const id = useId();
  const submitted = resolveListTheme(initial ?? current);
  const [selected, setSelected] = useState(
    premium || submitted === "classic" || submitted === current
      ? submitted
      : resolveListTheme(current),
  );
  return (
    <fieldset
      className={`${styles.picker} ${demo ? styles["demo-picker"] : ""}`}
    >
      <legend className={demo ? shell["visually-hidden"] : undefined}>
        {t("List theme")}
      </legend>
      <div className={styles["theme-groups"]}>
        {listThemeGroups.map((group, index) => (
          <div
            key={group.name}
            className={styles["theme-group"]}
            role="group"
            aria-labelledby={`${id}-group-${index}`}
          >
            <p id={`${id}-group-${index}`} className={styles["group-label"]}>
              {t(group.name)}
            </p>
            <div className={styles.choices}>
              {group.themes.map((theme) => (
                <label key={theme} className={styles.choice} data-theme={theme}>
                  <span
                    className={styles["choice-art"]}
                    style={{ background: listThemes[theme].paper }}
                    aria-hidden="true"
                  >
                    {theme === "classic" ? (
                      <span className={styles["classic-art"]}>W</span>
                    ) : (
                      <Image
                        src={`/illustrations/themes/${listThemes[theme].artwork}`}
                        width={1000}
                        height={700}
                        sizes="(max-width: 760px) 40vw, 180px"
                        alt=""
                      />
                    )}
                  </span>
                  <span className={styles["choice-caption"]}>
                    <input
                      type="radio"
                      name={name}
                      value={theme}
                      checked={selected === theme}
                      onChange={() => setSelected(theme)}
                      disabled={
                        !premium && theme !== "classic" && theme !== current
                      }
                    />
                    <span>{t(listThemes[theme].name)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        className={styles["theme-preview"]}
        id={`${id}-preview`}
        aria-live="polite"
        aria-atomic="true"
      >
        <ListTheme theme={selected} compact>
          <span className={styles.kicker}>{t(listThemes[selected].name)}</span>
          <strong className={styles["preview-title"]}>
            {t(listThemes[selected].example)}
          </strong>
          <span>{t("Wishlist preview")}</span>
        </ListTheme>
        <p className={styles["theme-description"]}>
          {t(listThemes[selected].description)}
        </p>
      </div>
      {!demo && (
        <p className={styles.help}>
          {premium ? (
            t("Your theme appears on your list and its sharing card.")
          ) : (
            <>
              {t(
                "Premium unlocks eight curated themes. Your existing theme stays when Premium ends.",
              )}{" "}
              <Link href="/premium">{t("Explore Premium")}</Link>
            </>
          )}
        </p>
      )}
    </fieldset>
  );
}
