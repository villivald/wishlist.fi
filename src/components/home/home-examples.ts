import type { TextKey } from "@/i18n/translator";

export const homeExamples = [
  {
    title: "A book for a rainy afternoon",
    note: "Something to get lost in, with a cup of tea nearby.",
    category: "Something to read",
    image: "/illustrations/archive/peto-books.webp",
    tone: "butter",
  },
  {
    title: "Coffee and a long catch-up",
    note: "An afternoon together. No special occasion needed.",
    category: "Time together",
    image: "/illustrations/archive/causey-cup-and-saucer.webp",
    tone: "lilac",
  },
  {
    title: "A little surprise",
    note: "Something small that made you think of me.",
    category: "Room for an idea",
    image: "/illustrations/archive/wirt-tulips.webp",
    tone: "sage",
  },
] as const satisfies readonly {
  title: TextKey;
  note: TextKey;
  category: TextKey;
  image: string;
  tone: "butter" | "lilac" | "sage";
}[];
