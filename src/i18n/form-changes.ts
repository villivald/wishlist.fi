export const FORM_SAVED_EVENT = "wishlist-form-saved";

export function notifyFormChanged(element: HTMLElement | null) {
  (element instanceof HTMLFormElement
    ? element
    : element?.closest("form")
  )?.dispatchEvent(new Event("input", { bubbles: true }));
}

export function notifyFormSaved(element: HTMLElement | null) {
  (element instanceof HTMLFormElement
    ? element
    : element?.closest("form")
  )?.dispatchEvent(new Event(FORM_SAVED_EVENT, { bubbles: true }));
}
