import { ArrowLeft, ArrowRight } from "lucide-react";
import { languageTag, localizedPath } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import styles from "./pagination.module.css";

const visiblePages = (page: number, total: number) => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const start = Math.min(Math.max(page - 1, 2), total - 3);
  return [1, start, start + 1, start + 2, total];
};

export async function Pagination({
  label,
  page,
  total,
  href,
  native = false,
}: {
  label: string;
  page: number;
  total: number;
  href: (page: number) => string;
  native?: boolean;
}) {
  if (total === 1 && page === 1) return null;

  const t = await getText();
  const PageLink = native ? "a" : Link;
  const pageHref = (target: number) =>
    native ? localizedPath(href(target), t.locale) : href(target);
  const linkProps = native ? {} : { prefetch: false as const };

  if (page > total) {
    return (
      <nav className={styles.pagination} aria-label={label}>
        <div className={styles.recovery}>
          <PageLink
            className={styles.direction}
            href={pageHref(1)}
            {...linkProps}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t("Back to first page")}
          </PageLink>
          {total > 1 && (
            <PageLink
              className={styles.direction}
              href={pageHref(total)}
              {...linkProps}
            >
              {t("Last page")}
              <ArrowRight size={16} aria-hidden="true" />
            </PageLink>
          )}
        </div>
      </nav>
    );
  }

  const pages = visiblePages(page, total);
  const numberFormat = new Intl.NumberFormat(languageTag(t.locale));
  return (
    <nav className={styles.pagination} aria-label={label}>
      <div className={styles.controls}>
        {page > 1 && (
          <PageLink
            className={`${styles.direction} ${styles.previous}`}
            href={pageHref(page - 1)}
            rel="prev"
            {...linkProps}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span className={styles.label}>{t("Previous page")}</span>
          </PageLink>
        )}
        <ul className={styles.pages} role="list">
          {pages.map((number, index) => {
            const interior = number !== page && number > 1 && number < total;
            const gap = number - (pages[index - 1] ?? 0) > 1;
            const compactGap =
              number === page ? page > 2 : number === total && total - page > 1;
            return (
              <li className={styles.item} data-interior={interior} key={number}>
                {(gap || compactGap) && (
                  <span
                    className={styles.gap}
                    data-wide={gap}
                    data-compact={compactGap}
                    aria-hidden="true"
                  >
                    …
                  </span>
                )}
                {number === page ? (
                  <span className={styles.current} aria-current="page">
                    <span className={styles["sr-only"]}>
                      {t("Page {page} of {total}", { page, total })}
                    </span>
                    <span aria-hidden="true">{numberFormat.format(page)}</span>
                  </span>
                ) : (
                  <PageLink
                    className={styles.number}
                    href={pageHref(number)}
                    aria-label={t("Page {page}", { page: number })}
                    {...linkProps}
                  >
                    {numberFormat.format(number)}
                  </PageLink>
                )}
              </li>
            );
          })}
        </ul>
        {page < total && (
          <PageLink
            className={`${styles.direction} ${styles.next}`}
            href={pageHref(page + 1)}
            rel="next"
            {...linkProps}
          >
            <span className={styles.label}>{t("Next page")}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </PageLink>
        )}
      </div>
    </nav>
  );
}
