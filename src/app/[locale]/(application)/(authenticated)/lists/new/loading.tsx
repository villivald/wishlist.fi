import loading from "@/components/loading/loading-preview.module.css";
import shell from "@/components/shell.module.css";
import { ListAccessChoices } from "@/features/wishlist/components/list-access-choices";
import { useText } from "@/i18n/use-text";

export default function LoadingNewList() {
  const t = useText();
  return (
    <div data-loading-preview>
      <p role="status" className={shell["visually-hidden"]}>
        {t("Loading editor…")}
      </p>
      <div className={shell.form} aria-busy="true" aria-hidden="true" inert>
        <div className={shell.field}>
          <label htmlFor="loading-list-title">{t("Title")}</label>
          <input id="loading-list-title" disabled />
          <p className={shell.muted}>
            {t("Give your list a name. Up to 200 characters.")}
          </p>
        </div>
        <ListAccessChoices premium defaultValue="PUBLIC" disabled />
        <div className={shell.field}>
          <span>{t("Description (optional)")}</span>
          <div className={`${loading.block} ${loading.textarea}`} />
        </div>
      </div>
    </div>
  );
}
