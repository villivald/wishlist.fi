import type { ReactNode } from "react";
import cardStyles from "@/components/cards/cards.module.css";
import shell from "@/components/shell.module.css";
import {
  AccountDetails,
  type AccountIdentity,
} from "@/features/account/components/account-details";
import { AccountLayout } from "@/features/account/components/account-layout";
import { ProfileForm } from "@/features/account/components/profile-form";
import { suggestUsername } from "@/features/auth/utils/username";
import { BrowseControls } from "@/features/discovery/components/discovery-controls";
import { parseDiscoveryQuery } from "@/features/discovery/service/query";
import { MyListsControls } from "@/features/wishlist/components/my-lists-controls";
import { useText } from "@/i18n/use-text";
import styles from "./loading-preview.module.css";

function LoadingFrame({
  label,
  children,
  className = shell.page,
  contentClassName,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={className} data-loading-preview>
      <p role="status" className={shell["visually-hidden"]}>
        {label}
      </p>
      <div
        aria-hidden="true"
        aria-busy="true"
        inert
        className={`${styles.content} ${contentClassName ?? ""}`}
      >
        {children}
      </div>
    </section>
  );
}

function SkeletonCards({
  media = true,
  wish = false,
}: {
  media?: boolean;
  wish?: boolean;
}) {
  return (
    <div className={shell["list-grid"]}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={`${shell["list-card"]} ${wish ? `${cardStyles.tone} ${cardStyles["wish-card"]}` : ""}`}
          data-wish-tone={wish ? ["butter", "lilac", "sage"][index] : undefined}
        >
          {media && <div className={`${styles.block} ${styles.media}`} />}
          <div className={`${styles.block} ${styles.title}`} />
          <div className={`${styles.block} ${styles.line}`} />
          <div className={styles["card-actions"]}>
            <div className={`${styles.block} ${styles.button}`} />
            <div className={`${styles.block} ${styles.button}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonFields({ count = 2 }: { count?: number }) {
  return (
    <div className={shell.form}>
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className={shell.field}>
          <div className={`${styles.block} ${styles.label}`} />
          <div
            className={`${styles.block} ${index === 1 ? styles.textarea : styles.input}`}
          />
        </div>
      ))}
      <div className={`${styles.block} ${styles.button}`} />
    </div>
  );
}

export function CatalogSkeleton({
  kind = "browse",
}: {
  kind?: "browse" | "lists";
}) {
  const t = useText();

  const heading = t(kind === "browse" ? "Browse wishlists" : "My lists");
  return (
    <LoadingFrame
      label={t("Loading {value0}…", { value0: heading.toLowerCase() })}
    >
      {kind === "browse" ? (
        <BrowseControls filters={parseDiscoveryQuery({})} />
      ) : (
        <MyListsControls />
      )}
      <SkeletonCards />
    </LoadingFrame>
  );
}

export function DetailSkeleton({ kind = "list" }: { kind?: "list" | "wish" }) {
  const t = useText();

  return (
    <LoadingFrame
      label={t("Loading {value0}…", {
        value0: kind === "list" ? t("Shared list") : t("Wish details"),
      })}
    >
      <div className={`${styles.block} ${styles["back-link"]}`} />
      {kind === "list" ? (
        <>
          <div className={`${styles.block} ${styles.heading}`} />
          <div className={`${styles.block} ${styles.line}`} />
          <div className={`${styles.block} ${styles.toolbar}`} />
          <SkeletonCards wish />
        </>
      ) : (
        <div className={shell["wish-detail"]}>
          <div className={`${styles.block} ${styles["detail-media"]}`} />
          <div className={shell["wish-copy"]}>
            <div className={shell["wish-heading"]}>
              <div className={`${styles.block} ${styles.heading}`} />
            </div>
            <div className={`${styles.block} ${styles.line}`} />
            <div className={`${styles.block} ${styles.title}`} />
            <div className={shell["list-settings"]}>
              <div className={`${styles.block} ${styles.title}`} />
              <div className={`${styles.block} ${styles.line}`} />
              <div className={`${styles.block} ${styles.button}`} />
            </div>
          </div>
        </div>
      )}
    </LoadingFrame>
  );
}

export function EditorSkeleton({
  profile = false,
  user,
  security,
}: {
  profile?: boolean;
  user?: AccountIdentity;
  security?: ReactNode;
}) {
  const t = useText();

  if (profile) {
    return (
      <LoadingFrame
        label={t("Loading your profile…")}
        className={`${shell.page} ${shell["profile-page"]}`}
      >
        <AccountLayout
          identity={user && <AccountDetails user={user} />}
          profile={
            <ProfileForm
              profile={{
                username: user?.username ?? "",
                name: null,
                description: null,
              }}
              usernameSuggestion={suggestUsername(user?.email ?? "")}
              loading
            />
          }
          plan={
            <div className={shell["plan-summary"]}>
              <div className={`${styles.block} ${styles.label}`} />
              <div className={`${styles.block} ${styles.title}`} />
              <div className={`${styles.block} ${styles.line}`} />
              <div className={`${styles.block} ${styles.button}`} />
            </div>
          }
          avatar={
            <div className={shell["content-stack"]}>
              <div className={`${styles.block} ${styles.title}`} />
              <div className={`${styles.block} ${styles.line}`} />
              <SkeletonFields />
            </div>
          }
          security={
            security ?? <div className={`${styles.block} ${styles.button}`} />
          }
        />
      </LoadingFrame>
    );
  }
  return (
    <LoadingFrame label={t("Loading editor…")} className={shell.editor}>
      <div className={`${styles.block} ${styles.heading}`} />
      <SkeletonFields count={5} />
    </LoadingFrame>
  );
}

export function WishEditorSkeleton({ editing = false }: { editing?: boolean }) {
  const t = useText();
  return (
    <LoadingFrame
      label={t("Loading editor…")}
      className={`${shell.page} ${shell["profile-page"]}`}
    >
      <header className={shell["page-heading"]}>
        <div>
          <h1>{editing ? t("Edit wish") : t("Add a wish")}</h1>
          <div className={`${styles.block} ${styles.line}`} />
        </div>
      </header>
      <div className={shell["content-columns"]}>
        <div className={shell["content-panel"]}>
          <SkeletonFields count={5} />
        </div>
        <div className={shell["content-panel"]}>
          <div className={`${styles.block} ${styles.title}`} />
          <div className={`${styles.block} ${styles.media}`} />
          <div className={`${styles.block} ${styles.input}`} />
        </div>
      </div>
    </LoadingFrame>
  );
}
