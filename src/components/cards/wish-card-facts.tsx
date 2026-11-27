import { WishPriority } from "@/features/wish/components/wish-priority";
import {
  formatWishPrice,
  type WishCurrency,
} from "@/features/wish/utils/money";
import { useText } from "@/i18n/use-text";
import shell from "../shell.module.css";
import styles from "./cards.module.css";

export function WishCardFacts({
  priceMinor,
  currency,
  priority,
}: {
  priceMinor: number | null;
  currency: WishCurrency | null;
  priority: number | null;
}) {
  const t = useText();
  return (
    <div className={styles["wish-facts"]}>
      <div className={styles["wish-facts-layout"]}>
        <p
          className={shell.price}
          data-missing={priceMinor === null || currency === null}
        >
          {formatWishPrice(priceMinor, currency, t)}
        </p>
        <WishPriority priority={priority} />
      </div>
    </div>
  );
}
