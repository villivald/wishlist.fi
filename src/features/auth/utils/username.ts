export const suggestUsername = (email: string) => {
  const suggestion = email
    .split("@")[0]
    .split("+")[0]
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 40)
    .replace(/^[-_]+|[-_]+$/g, "");

  return suggestion.length >= 2 ? suggestion : undefined;
};
