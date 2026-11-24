import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import {
  detailSection,
  navigationPath,
} from "@/app/_navigation/navigation-path";
import { ActionForm } from "@/components/form/action-form";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { submitWishTransfer } from "@/features/wish/actions/manage-wish";
import picker from "@/features/wish/components/destinations.module.css";
import {
  readWishDestinations,
  reservedMoveMessage,
} from "@/features/wish/service/transfer";
import { readWish } from "@/features/wish/service/wishes";
import { wishTransferOperation } from "@/features/wish/transfer";
import { listAccess, listAccessLabels } from "@/features/wishlist/list-access";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { newListPath, wishPath } from "@/paths";

type Props = {
  params: Promise<{ listId: string; wishId: string; operation: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ operation }, t] = await Promise.all([params, getText()]);
  return {
    title: operation === "move" ? t("Move wish") : t("Copy wish"),
    robots: { index: false, follow: false },
  };
}

export default async function TransferWishPage({
  params,
  searchParams,
}: Props) {
  const [{ listId, wishId, operation: mode }, { from }] = await Promise.all([
    params,
    searchParams,
  ]);
  const operation = wishTransferOperation.safeParse(mode);
  if (!operation.success) notFound();

  const moving = operation.data === "move";
  const sourcePath = wishPath(listId, wishId);
  const [{ user }, t] = await Promise.all([
    getAuthOrRedirect({ returnTo: sourcePath }),
    getText(),
  ]);
  const wish = await readWish(listId, wishId, user.id, moving);
  if (!wish) notFound();

  const blocked = moving && wish.isReserved;
  const destinations = blocked
    ? []
    : await readWishDestinations(user.id, listId, operation.data);
  const back = navigationPath(sourcePath, detailSection(from, wish.canManage));
  const label = moving ? t("Move wish") : t("Copy wish");

  return (
    <section className={styles.editor}>
      <h1>{label}</h1>
      <p className={styles.description}>
        {moving
          ? t("Move “{title}” from {list} to another list you manage.", {
              title: wish.title,
              list: wish.wishlist.title,
            })
          : t(
              "Copy “{title}” to one or more of your lists. The original stays in {list}.",
              {
                title: wish.title,
                list: wish.wishlist.title,
              },
            )}
      </p>
      {blocked ? (
        <p className={styles.description}>{t(reservedMoveMessage)}</p>
      ) : destinations.length ? (
        <ActionForm
          action={submitWishTransfer.bind(
            null,
            operation.data,
            listId,
            wishId,
            randomUUID(),
          )}
          label={label}
          pendingLabel={moving ? t("Moving wish…") : t("Copying wish…")}
        >
          <fieldset
            className={picker.choices}
            aria-describedby="wish-destination-help"
          >
            <legend>
              {moving ? t("Choose one list") : t("Choose one or more lists")}
            </legend>
            {destinations.map((list) => {
              const access = listAccess(list);
              return (
                <label className={picker.choice} key={list.id}>
                  <input
                    name="destination"
                    type={moving ? "radio" : "checkbox"}
                    required={moving}
                    value={`${list.id}:${access}`}
                  />
                  <span>
                    <strong>{list.title}</strong>
                    <small>
                      {moving && list.owner ? `@${list.owner.username} · ` : ""}
                      {t(listAccessLabels[access])}
                    </small>
                  </span>
                </label>
              );
            })}
            <p id="wish-destination-help" className={styles["field-help"]}>
              {t("The destination list’s access settings apply to the wish.")}
              {!moving && wish.isReserved
                ? ` ${t("The reservation stays with the original wish.")}`
                : null}
            </p>
          </fieldset>
        </ActionForm>
      ) : (
        <p className={styles.description}>
          {moving
            ? t("You need another list you manage to move this wish.")
            : t("You need another list you own to copy this wish.")}
        </p>
      )}
      {!blocked && !destinations.length && (
        <Link href={newListPath}>{t("Create a list")}</Link>
      )}
      <Link href={back}>{t(blocked ? "Back to wish" : "Cancel")}</Link>
    </section>
  );
}
