export type ListAccess = "HIDDEN" | "PRIVATE" | "PUBLIC";

export const listAccess = (list: {
  publication: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "PRIVATE";
}): ListAccess => (list.publication === "DRAFT" ? "HIDDEN" : list.visibility);

export const listAccessLabels = {
  HIDDEN: "Hidden · Admins only",
  PRIVATE: "Invited people · Private",
  PUBLIC: "Public · Anyone can view",
} as const;
