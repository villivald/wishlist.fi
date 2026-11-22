import { UserRound } from "lucide-react";
import { navigationPath } from "@/app/_navigation/navigation-path";
import { CardActions } from "@/components/cards/card-actions";
import {
  CardMedia,
  CardMediaLink,
  ListPreview,
} from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { ListStatus } from "@/components/cards/list-status";
import { ListWishCounts } from "@/components/cards/list-wish-counts";
import { ReservationAvailability } from "@/components/cards/reservation-availability";
import shell from "@/components/shell.module.css";
import { getCuratedWishlistCopy } from "@/features/discovery/service/curated-lists";
import { ListTheme } from "@/features/premium/components/list-theme";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { listPath, listSettingsPath, sharingPath } from "@/paths";
import type { readMyWishlists } from "../service/lists";
import { LeaveListButton } from "./leave-list-button";
import styles from "./my-list-card.module.css";

type MyList = Awaited<ReturnType<typeof readMyWishlists>>["lists"][number];

export function MyListCard({
  list,
  favorite,
}: {
  list: MyList;
  favorite: boolean;
}) {
  const t = useText();
  const title = getCuratedWishlistCopy(list, t.locale)?.title ?? list.title;
  const path = navigationPath(listPath(list.id), "lists");
  return (
    <li className={shell["list-card"]}>
      <ListTheme theme={list.theme} media>
        {title ? (
          <CardMediaLink path={path} title={title}>
            <ListPreview
              image={list.image}
              images={list.previewImages}
              title={title}
            />
          </CardMediaLink>
        ) : (
          <CardMedia image={null} kind="list" title={t("Hidden list")} />
        )}
      </ListTheme>
      <div className={styles.identity}>
        <h2>{title ? <Link href={path}>{title}</Link> : t("Hidden list")}</h2>
        <div className={styles.meta}>
          <p className={cardStyles["list-owner"]}>
            <UserRound size={16} aria-hidden="true" />
            <span>
              {list.isOwner
                ? t("Your list")
                : list.owner
                  ? `@${list.owner.username}`
                  : t("List access granted")}
            </span>
          </p>
          {!list.isOwner && list.membership && (
            <span
              className={styles.role}
              title={
                list.canManage
                  ? t("Admin — edit and manage sharing")
                  : t("Member — view and reserve")
              }
            >
              {list.canManage ? t("Admin") : t("Member")}
            </span>
          )}
        </div>
        {title && (
          <ListStatus
            publication={list.publication}
            visibility={list.visibility}
          />
        )}
      </div>
      <div className={cardStyles["list-footer"]}>
        {title ? (
          <>
            <ListWishCounts
              availableWishCount={list.availableWishCount}
              reservedWishCount={list.reservedWishCount}
            />
            <ReservationAvailability enabled={list.reservationsEnabled} />
            <CardActions
              path={listPath(list.id)}
              section="lists"
              settingsPath={listSettingsPath(list.id)}
              title={title}
              canManage={list.canManage}
              favorite={{ kind: "list", targetId: list.id, saved: favorite }}
              sharingPath={list.canManage ? sharingPath(list.id) : undefined}
              canCopy={
                list.publication === "PUBLISHED" && list.visibility === "PUBLIC"
              }
            >
              {!list.isOwner && list.membership && (
                <LeaveListButton
                  listId={list.id}
                  membershipId={list.membership.id}
                  title={title}
                />
              )}
            </CardActions>
          </>
        ) : (
          <>
            <p className={shell.muted}>
              {t("Available when the admins show it.")}
            </p>
            {list.membership && (
              <div className={cardStyles.actions}>
                <LeaveListButton
                  listId={list.id}
                  membershipId={list.membership.id}
                  title={null}
                />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
