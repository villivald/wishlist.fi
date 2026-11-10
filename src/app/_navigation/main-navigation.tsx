"use client";

import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import styles from "@/components/shell.module.css";
import { usePathname } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { NavLink } from "./nav-link";

export type NavigationItem = {
  href: string;
  match?: string;
  label: string;
  icon?: ReactNode;
  shortcutLabel?: string;
};

export function MainNavigation({
  items,
  collapsible,
}: {
  items: NavigationItem[];
  collapsible: boolean;
}) {
  const pathname = usePathname();
  const t = useText();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const shortcuts = useRef<HTMLElement>(null);
  const menuNav = useRef<HTMLElement>(null);
  const [labelsFit, setLabelsFit] = useState(false);
  const [menu, setMenu] = useState({ pathname, open: false });
  if (menu.pathname !== pathname) setMenu({ pathname, open: false });
  const open = menu.pathname === pathname && menu.open;

  useEffect(() => {
    const navigation = shortcuts.current;
    if (!navigation) return;
    const labels = navigation.querySelectorAll<HTMLElement>(
      "[data-shortcut-label]",
    );
    const measure = () => {
      if (getComputedStyle(navigation).display === "none") {
        setMenu((current) =>
          current.open ? { pathname: current.pathname, open: false } : current,
        );
        return;
      }
      setLabelsFit(
        Array.from(labels).every((label) => {
          const link = label.closest("a")!;
          const style = getComputedStyle(link);
          const available =
            link.clientWidth -
            parseFloat(style.paddingInlineStart) -
            parseFloat(style.paddingInlineEnd);
          return Math.ceil(label.getBoundingClientRect().width) <= available;
        }),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    labels.forEach((label) => observer.observe(label));
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !button.current?.contains(target) &&
        !menuNav.current?.contains(target)
      ) {
        setMenu({ pathname, open: false });
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, pathname]);

  const secondaryActive = items.some((item) => {
    const match = item.match ?? item.href;
    return (
      !item.shortcutLabel &&
      (pathname === match || pathname.startsWith(`${match}/`))
    );
  });

  return (
    <div
      className={
        collapsible ? styles["navigation-menu"] : styles["navigation-wrapper"]
      }
      data-open={open}
      data-labels-fit={labelsFit}
      onClick={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest('a[aria-current="page"]') &&
          open
        ) {
          setMenu({ pathname, open: false });
          button.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setMenu({ pathname, open: false });
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setMenu({ pathname, open: false });
          button.current?.focus();
        }
      }}
    >
      {collapsible && (
        <>
          <nav
            ref={shortcuts}
            className={styles["quick-navigation"]}
            aria-label={t("Quick navigation")}
            aria-hidden={open || undefined}
            inert={open || undefined}
          >
            {items
              .filter((item) => item.shortcutLabel)
              .map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  match={item.match}
                  icon={item.icon}
                  shortcutLabel={item.shortcutLabel}
                  shortcutLabelVisible={labelsFit}
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
          <button
            ref={button}
            type="button"
            className={styles["navigation-toggle"]}
            data-current={secondaryActive || undefined}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setMenu({ pathname, open: !open })}
          >
            {open ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
            <span>{t("Menu")}</span>
          </button>
        </>
      )}
      <nav
        id={id}
        ref={menuNav}
        aria-label={t("Main navigation")}
        className={`${styles.navigation} ${collapsible ? styles["member-navigation"] : ""}`}
      >
        {items.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            match={item.match}
            icon={item.icon}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
