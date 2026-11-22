import {
  CatalogueListCard,
  CataloguePersonCard,
  CatalogueWishCard,
} from "@/components/cards/catalogue-cards";
import { createWishTones } from "@/components/cards/wish-tones";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import type {
  discoverLists,
  discoverUsers,
  discoverWishes,
} from "../service/discovery";

type Results = Awaited<
  ReturnType<
    typeof discoverLists | typeof discoverWishes | typeof discoverUsers
  >
>;

export function DiscoveryListResults({
  lists,
  canFavorite,
  favoriteIds,
  curated = false,
}: {
  lists: Awaited<ReturnType<typeof discoverLists>>["lists"];
  canFavorite: boolean;
  favoriteIds: string[];
  curated?: boolean;
}) {
  const t = useText();

  return (
    <ul
      className={styles["list-grid"]}
      aria-label={curated ? undefined : t("Public lists")}
    >
      {lists.map((list) => (
        <CatalogueListCard
          key={list.id}
          list={list}
          headingLevel={curated ? 3 : 2}
          showReservationAvailability={!curated}
          favorite={
            canFavorite
              ? {
                  kind: "list",
                  targetId: list.id,
                  saved: favoriteIds.includes(list.id),
                }
              : undefined
          }
        />
      ))}
    </ul>
  );
}

export function DiscoveryResults({
  result,
  canFavorite = false,
  favoriteIds = [],
}: {
  result: Results;
  canFavorite?: boolean;
  favoriteIds?: string[];
}) {
  const t = useText();

  if ("lists" in result) {
    return (
      <DiscoveryListResults
        lists={result.lists}
        canFavorite={canFavorite}
        favoriteIds={favoriteIds}
      />
    );
  }

  const tones = createWishTones(
    "wishes" in result ? result.wishes.map((wish) => wish.id) : [],
  );
  return (
    <ul
      className={styles["list-grid"]}
      aria-label={
        result.filters.view === "users"
          ? t("People with public lists")
          : t("Public wishes")
      }
    >
      {"wishes" in result
        ? result.wishes.map((wish) => (
            <CatalogueWishCard
              key={wish.id}
              wish={wish}
              tone={tones[wish.id]}
              favorite={
                canFavorite
                  ? {
                      kind: "wish",
                      targetId: wish.id,
                      saved: favoriteIds.includes(wish.id),
                    }
                  : undefined
              }
            />
          ))
        : result.users.map((user) => (
            <CataloguePersonCard
              key={user.username}
              user={user}
              favorite={
                canFavorite
                  ? {
                      kind: "person",
                      targetId: user.username,
                      saved: favoriteIds.includes(user.username),
                    }
                  : undefined
              }
            />
          ))}
    </ul>
  );
}
