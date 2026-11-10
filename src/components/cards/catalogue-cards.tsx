import { List, UserRound } from "lucide-react";
import {
  type DetailSection,
  navigationPath,
} from "@/app/_navigation/navigation-path";
import type {
  discoverLists,
  discoverUsers,
  discoverWishes,
} from "@/features/discovery/service/discovery";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import type { FavoriteTarget } from "@/features/favorites/types";
import { ListTheme } from "@/features/premium/components/list-theme";
import { PremiumBadge } from "@/features/premium/components/premium-badge";
import { WishPriority } from "@/features/wish/components/wish-priority";
import { formatWishPrice } from "@/features/wish/utils/money";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { listPath, listSettingsPath, sharingPath, wishPath } from "@/paths";
import styles from "../shell.module.css";
import { CardActions, OwnershipBadge } from "./card-actions";
import {
  CardMedia,
  CardMediaLink,
  ListPreview,
  UserAvatar,
} from "./card-media";
import cardStyles from "./cards.module.css";
import { ListStatus } from "./list-status";
import { ListWishCounts } from "./list-wish-counts";
import { ProfileBio } from "./profile-bio";
import { ReservationAvailability } from "./reservation-availability";
import { WishCard } from "./wish-card";
import { WishStatus } from "./wish-status";
import type { WishTone } from "./wish-tones";

type ListItem = Awaited<ReturnType<typeof discoverLists>>["lists"][number] & {
  canManage?: boolean;
  publication?: "DRAFT" | "PUBLISHED";
  visibility?: "PUBLIC" | "PRIVATE";
};
type WishItem = Omit<
  Awaited<ReturnType<typeof discoverWishes>>["wishes"][number],
  "description"
> & {
  canManage?: boolean;
  canReserve?: boolean;
  hidden?: boolean;
  fulfilledAt?: Date | null;
  isReserved?: boolean;
  isReservedByYou?: boolean;
};

export function CatalogueListCard({
  list,
  section = "browse",
  favorite,
}: {
  list: ListItem;
  section?: DetailSection;
  favorite?: FavoriteTarget;
}) {
  const t = useText();
  const ownerName = list.owner?.name?.trim();
  return (
    <li className={`${styles["list-card"]} ${cardStyles["browse-card"]}`}>
      <ListTheme theme={list.theme} media>
        <CardMediaLink
          path={navigationPath(listPath(list.id), section)}
          title={list.title}
        >
          <ListPreview
            image={list.image}
            images={list.previewImages}
            title={list.title}
          />
        </CardMediaLink>
      </ListTheme>
      {list.isOwner && <OwnershipBadge edge />}
      <h2>
        <Link href={navigationPath(listPath(list.id), section)}>
          {list.title}
        </Link>
      </h2>
      {list.owner && (
        <p className={cardStyles["list-owner"]}>
          <UserRound size={16} aria-hidden="true" />
          <span>
            <span className={styles["visually-hidden"]}>
              {t("List owner")}:{" "}
            </span>
            <span title={`@${list.owner.username}`}>
              {ownerName || `@${list.owner.username}`}
            </span>
          </span>
        </p>
      )}
      {list.publication &&
        list.visibility &&
        (list.publication === "DRAFT" || list.visibility === "PRIVATE") && (
          <ListStatus
            publication={list.publication}
            visibility={list.visibility}
          />
        )}
      {list.description && (
        <p className={styles.description}>
          {list.description.slice(0, 180)}
          {list.description.length > 180 ? "…" : ""}
        </p>
      )}
      <div className={cardStyles["list-footer"]}>
        <ListWishCounts
          availableWishCount={list.availableWishCount}
          reservedWishCount={list.reservedWishCount}
        />
        <ReservationAvailability enabled={list.reservationsEnabled} />
        <CardActions
          path={listPath(list.id)}
          section={section}
          settingsPath={listSettingsPath(list.id)}
          title={list.title}
          canCopy
          favorite={favorite}
          canManage={list.canManage ?? list.isOwner}
          sharingPath={
            (list.canManage ?? list.isOwner) ? sharingPath(list.id) : undefined
          }
        />
      </div>
    </li>
  );
}

export function CatalogueWishCard({
  wish,
  tone,
  section = "browse",
  favorite,
}: {
  wish: WishItem;
  tone?: WishTone;
  section?: DetailSection;
  favorite?: FavoriteTarget;
}) {
  const t = useText();
  return (
    <WishCard tone={tone} reserved={wish.isReserved}>
      <CardMediaLink
        path={navigationPath(wishPath(wish.wishlist.id, wish.id), section)}
        title={wish.title}
      >
        <CardMedia image={wish.image} title={wish.title} />
      </CardMediaLink>
      {wish.wishlist.isOwner && <OwnershipBadge edge />}
      <h2>
        <Link
          href={navigationPath(wishPath(wish.wishlist.id, wish.id), section)}
        >
          {wish.title}
        </Link>
      </h2>
      <div className={cardStyles["wish-summary"]}>
        <p className={cardStyles["wish-list"]}>
          <List size={16} aria-hidden="true" />
          <Link href={navigationPath(listPath(wish.wishlist.id), section)}>
            {wish.wishlist.title}
          </Link>
        </p>
        <div className={cardStyles["wish-facts"]}>
          <p className={styles.price}>
            {formatWishPrice(wish.priceMinor, wish.currency, t)}
          </p>
          <WishPriority priority={wish.priority} />
        </div>
      </div>
      {(wish.hidden || wish.fulfilledAt || wish.isReserved) && (
        <WishStatus
          hidden={wish.hidden}
          fulfilled={!!wish.fulfilledAt}
          reserved={wish.isReserved}
          reservedByYou={wish.isReservedByYou}
        />
      )}
      <CardActions
        path={wishPath(wish.wishlist.id, wish.id)}
        section={section}
        productUrl={wish.externalUrl}
        canReserve={wish.canReserve ?? wish.wishlist.reservationsEnabled}
        title={wish.title}
        canCopy
        favorite={favorite}
        canManage={wish.canManage ?? wish.wishlist.isOwner}
      />
    </WishCard>
  );
}

type PersonItem = Omit<
  Awaited<ReturnType<typeof discoverUsers>>["users"][number],
  "isViewer"
> & { isViewer?: boolean };
export function CataloguePersonCard({
  user,
  favorite,
}: {
  user: PersonItem;
  favorite?: FavoriteTarget;
}) {
  const t = useText();
  return (
    <li className={`${styles["list-card"]} ${cardStyles["user-card"]}`}>
      <div className={cardStyles["user-heading"]}>
        <UserAvatar image={user.image} />
        <div className={cardStyles["user-tools"]}>
          {user.isViewer && <OwnershipBadge user />}
          {favorite && (
            <FavoriteButton {...favorite} title={user.name ?? user.username} />
          )}
        </div>
      </div>
      <div className={cardStyles["person-name"]}>
        <h2>{user.name ?? user.username}</h2>
        {user.showPremiumBadge && <PremiumBadge />}
      </div>
      <p>
        {t.plural(
          "{count} public list",
          "{count} public lists",
          user.publicListCount,
        )}
      </p>
      {user.description && (
        <ProfileBio text={user.description} name={user.name ?? user.username} />
      )}
      <Link
        className={styles["secondary-button"]}
        href={`/browse?${new URLSearchParams({ view: "lists", owner: user.username })}`}
      >
        {t("View public lists")}
      </Link>
    </li>
  );
}
