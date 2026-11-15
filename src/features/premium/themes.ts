// Keep new IDs in sync with Wishlist_theme_check through a database migration.
export const listThemeIds = [
  "classic",
  "botanical",
  "festive",
  "minimal",
  "birthday",
  "wedding",
  "playful",
  "geometry",
  "cosmic",
] as const;
export type ListThemeId = (typeof listThemeIds)[number];

export const listThemeGroups = [
  {
    name: "Occasions & family",
    themes: ["festive", "birthday", "playful", "wedding"],
  },
  {
    name: "Everyday styles",
    themes: ["classic", "botanical", "minimal", "geometry", "cosmic"],
  },
] as const;

export const listThemes = {
  classic: {
    name: "Classic",
    artwork: null,
    example: "A few things I love",
    description: "The familiar Wishlist look, simple and warm.",
    accent: "#796d3a",
    paper: "#faf8ef",
    ink: "#302d35",
  },
  botanical: {
    name: "Botanical",
    artwork: "shin-bijutsukai-0031.webp",
    example: "For my home",
    description:
      "Flowers and leafy greens for everyday wishes, a new home, or a fresh start.",
    accent: "#386447",
    paper: "#edf3e8",
    ink: "#263c2a",
  },
  festive: {
    name: "Christmas",
    artwork: "occasion-christmas.webp",
    example: "Christmas wishes",
    description: "Pine branches, ornaments, and warm Christmas colors.",
    accent: "#406148",
    paper: "#f6f2e5",
    ink: "#2f4033",
  },
  minimal: {
    name: "Waves",
    artwork: "shin-bijutsukai-0016.webp",
    example: "A few things I love",
    description: "An abstract wave pattern for a list you can use all year.",
    accent: "#375569",
    paper: "#f3efe5",
    ink: "#283c49",
  },
  birthday: {
    name: "Birthday",
    artwork: "occasion-birthday.webp",
    example: "Birthday wishes",
    description:
      "Candles, cake, and a little confetti for birthdays of every age.",
    accent: "#986644",
    paper: "#fbf1e3",
    ink: "#4a382e",
  },
  wedding: {
    name: "Love",
    artwork: "occasion-love.webp",
    example: "Our shared wishes",
    description:
      "Hearts and ribbons for weddings, anniversaries, and wishes for two.",
    accent: "#a45a62",
    paper: "#f8eeea",
    ink: "#58373c",
  },
  playful: {
    name: "Baby & kids",
    artwork: "occasion-baby.webp",
    example: "For our little one",
    description:
      "Teddy bears, moons, and stars for a baby or child's wishlist.",
    accent: "#69765d",
    paper: "#f3f1e6",
    ink: "#3c4635",
  },
  geometry: {
    name: "Electric geometry",
    artwork: "electric-geometry.webp",
    example: "For my home",
    description:
      "Bold purple, green, and ochre shapes for a colorful everyday list.",
    accent: "#566a78",
    paper: "#f0eef3",
    ink: "#34303f",
  },
  cosmic: {
    name: "Cosmic circles",
    artwork: "cosmic-circles.webp",
    example: "A few things I love",
    description:
      "Luminous circles on a dark sky for wishes with a cosmic feel.",
    accent: "#536f99",
    paper: "#eef1f7",
    ink: "#303b50",
  },
} as const;

export const resolveListTheme = (theme: string | undefined): ListThemeId =>
  listThemeIds.find((id) => id === theme) ?? "classic";
