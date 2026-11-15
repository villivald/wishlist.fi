import Image from "next/image";
import { WishCard } from "@/components/cards/wish-card";
import shell from "@/components/shell.module.css";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { signUpPath } from "@/paths";
import styles from "./home.module.css";
import { homeExamples } from "./home-examples";

export function HomeSections() {
  const t = useText();
  const steps = [
    {
      title: t("Save a good find."),
      description: t(
        "Start with a title. Add a link, a photo or a few words whenever you like.",
      ),
    },
    {
      title: t("Make the list yours."),
      description: t(
        "A birthday, a new adventure, or just things you would love. Keep them together in your own list.",
      ),
    },
    {
      title: t("Let your people in."),
      description: t(
        "Choose who can see your list. When reservations are on, friends can reserve a wish to avoid duplicate gifts.",
      ),
    },
  ];

  return (
    <>
      <section
        className={styles.section}
        aria-labelledby="how-it-works-heading"
      >
        <h2 id="how-it-works-heading" className={styles["section-title"]}>
          {t("From a good find to a thoughtful gift.")}
        </h2>
        <ol className={styles.steps} role="list">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className={styles.number} aria-hidden="true">
                0{index + 1}
              </span>
              <h3>{step.title}</h3>
              <p className={shell.muted}>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        className={styles.section}
        aria-labelledby="example-wishlist-heading"
      >
        <div className={styles.heading}>
          <div>
            <p className={shell.eyebrow}>{t("An example wishlist")}</p>
            <h2
              id="example-wishlist-heading"
              className={styles["section-title"]}
            >
              {t("Little things to look forward to.")}
            </h2>
          </div>
          <p className={shell.muted}>
            {t("A wish can be a thing, an experience, or time together.")}
          </p>
        </div>
        <ul className={shell["list-grid"]}>
          {homeExamples.map((example) => (
            <WishCard key={example.title} tone={example.tone}>
              <div className={styles.illustration} aria-hidden="true">
                <Image
                  className={styles["scene-main"]}
                  src={example.image}
                  alt=""
                  width={1000}
                  height={750}
                  sizes="(max-width: 760px) 100vw, (max-width: 1100px) 45vw, 350px"
                />
              </div>
              <p className={styles.category}>{t(example.category)}</p>
              <h3>{t(example.title)}</h3>
              <p className={shell.muted}>{t(example.note)}</p>
            </WishCard>
          ))}
        </ul>
        <div className={styles.invitation}>
          <p>{t("What would go on yours?")}</p>
          <Link href={signUpPath} className={shell["secondary-button"]}>
            {t("Start your own list")}
          </Link>
        </div>
      </section>
    </>
  );
}
