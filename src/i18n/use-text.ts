import { useLocale, useMessages } from "next-intl";
import { createTranslator } from "./translator";

export const useText = () =>
  createTranslator(useLocale(), useMessages() as Record<string, string>);
