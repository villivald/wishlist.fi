"use client";

import { EyeOff, Globe, Users } from "lucide-react";
import { useId } from "react";
import shell from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import type { ListAccess } from "../list-access";
import styles from "./list-access-choices.module.css";

const choices = [
  {
    value: "HIDDEN",
    label: "Hidden",
    help: "Only you and other admins. Members and guest links cannot open it.",
    Icon: EyeOff,
  },
  {
    value: "PRIVATE",
    label: "Invited people",
    help: "Invited people can view after accepting and signing in. This list stays out of Browse. Active guest links also allow viewing.",
    Icon: Users,
  },
  {
    value: "PUBLIC",
    label: "Public",
    help: "Anyone can view without signing in. This list appears in Browse.",
    Icon: Globe,
  },
] as const;

export function ListAccessChoices({
  value,
  defaultValue,
  disabled = false,
  onChange,
  premium,
  canKeepPrivate = false,
  hideLegend = false,
  visibleOnly = false,
}: {
  value?: ListAccess;
  defaultValue?: ListAccess;
  disabled?: boolean;
  onChange?: (value: ListAccess) => void;
  premium: boolean;
  canKeepPrivate?: boolean;
  hideLegend?: boolean;
  visibleOnly?: boolean;
}) {
  const t = useText();
  const id = useId();
  return (
    <fieldset className={styles.choices} disabled={disabled}>
      <legend className={hideLegend ? shell["visually-hidden"] : undefined}>
        {t("Who can view this list?")}
      </legend>
      {choices
        .filter((choice) => !visibleOnly || choice.value !== "HIDDEN")
        .map(({ value: choice, label, help, Icon }) => {
          const requiresPremium =
            choice === "PRIVATE" && !premium && !canKeepPrivate;
          return (
            <label key={choice} className={styles.choice}>
              <input
                type="radio"
                name="access"
                required
                value={choice}
                {...(onChange
                  ? {
                      checked: value === choice,
                      onChange: () => onChange(choice),
                    }
                  : {
                      defaultChecked:
                        defaultValue === choice && !requiresPremium,
                    })}
                disabled={requiresPremium}
                aria-labelledby={`${id}-${choice}-label`}
                aria-describedby={`${id}-${choice}-help`}
              />
              <span>
                <strong id={`${id}-${choice}-label`}>
                  <Icon size={20} aria-hidden="true" /> {t(label)}
                </strong>
                <span id={`${id}-${choice}-help`}>
                  {t(help)}
                  {requiresPremium && <> {t("Requires Premium.")}</>}
                </span>
              </span>
            </label>
          );
        })}
    </fieldset>
  );
}
