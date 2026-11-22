import type { Locale } from "@/i18n/config";

type ListCopy = { title: string; description: string };

export const curatedWishlistCopy = {
  children: {
    en: {
      title: "For Kids",
      description:
        "Ideas for children of different ages, with play and everyday family life in mind.",
    },
    fi: {
      title: "Lapsille",
      description:
        "Ideoita eri-ikäisille lapsille niin leikkiin kuin perheen yhteiseen arkeen.",
    },
  },
  home: {
    en: {
      title: "Home",
      description:
        "A home wishlist that covers both the practical side of daily life and the way a space looks and feels.",
    },
    fi: {
      title: "Kotiin",
      description:
        "Toiveita kotiin arjen tarpeista sisustukseen ja kodin tunnelmaan.",
    },
  },
  books: {
    en: {
      title: "Books",
      description:
        "Beautiful and inspiring books on a range of subjects, to read or simply leaf through.",
    },
    fi: {
      title: "Kirjat",
      description:
        "Kauniita ja inspiroivia kirjoja eri aihepiireistä, luettavaksi ja selailtavaksi.",
    },
  },
} satisfies Record<string, Record<Locale, ListCopy>>;
