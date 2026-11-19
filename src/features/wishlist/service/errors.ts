export class WishlistError extends Error {}

export type ReservedWish = { id: string; wishTitle: string };

export class ReservationReviewRequired extends WishlistError {
  constructor(readonly reservations: ReservedWish[]) {
    super("Review the reserved wishes before hiding this list.");
  }
}
