import Image from "next/image";
import { homeHeroArtworks } from "@/components/home/home-hero-artworks";
import shell from "@/components/shell.module.css";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { homePath, newListPath } from "@/paths";
import styles from "./my-lists-welcome.module.css";

export function MyListsWelcome() {
  const t = useText();
  const artwork = homeHeroArtworks[0];

  return (
    <section
      className={styles.welcome}
      aria-labelledby="my-lists-welcome-heading"
    >
      <div className={styles.artwork} aria-hidden="true">
        <Image
          src={artwork.image}
          width={400}
          height={300}
          sizes="(max-width: 600px) 112px, 224px"
          style={{ objectPosition: artwork.position }}
          alt=""
        />
      </div>
      <div className={styles.copy}>
        <h2 id="my-lists-welcome-heading">{t("No lists yet")}</h2>
        <p className={shell.muted}>
          {t(
            "Give your list a name, then add your first wish. A title is enough to start.",
          )}
        </p>
        <div className={shell.actions}>
          <Link href={newListPath} className={shell.button}>
            {t("Create your first list")}
          </Link>
          <Link href={homePath}>{t("See how Wishlist works")}</Link>
        </div>
      </div>
    </section>
  );
}
