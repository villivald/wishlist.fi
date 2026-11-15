import Image from "next/image";
import styles from "./home.module.css";
import type { homeHeroArtworks } from "./home-hero-artworks";

export function HomeHeroArt({
  artwork,
}: {
  artwork: (typeof homeHeroArtworks)[number];
}) {
  return (
    <div
      className={styles["hero-art"]}
      data-hero-artwork={artwork.id}
      aria-hidden="true"
    >
      <div className={styles["artwork-sheet"]}>
        <Image
          className={styles["hero-art-image"]}
          src={artwork.image}
          width={384}
          height={316}
          style={{ objectPosition: artwork.position }}
          alt=""
          preload
        />
      </div>
    </div>
  );
}
