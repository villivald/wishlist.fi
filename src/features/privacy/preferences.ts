export const PRIVACY_COOKIE = "wishlist-privacy";
export const PRIVACY_CHANGE_EVENT = "wishlist-privacy-changed";

export type PrivacyPreferences = {
  analytics: boolean;
  marketing: boolean;
};

export const readPrivacyPreferences = (
  value: string | undefined,
): PrivacyPreferences | null => {
  const match = /^v1\.a([01])\.m([01])$/.exec(value ?? "");
  return match
    ? { analytics: match[1] === "1", marketing: match[2] === "1" }
    : null;
};

export const serializePrivacyPreferences = (value: PrivacyPreferences) =>
  `v1.a${Number(value.analytics)}.m${Number(value.marketing)}`;

export const googleConsent = (value: PrivacyPreferences) => ({
  analytics_storage: value.marketing && value.analytics ? "granted" : "denied",
  ad_storage: value.marketing ? "granted" : "denied",
  ad_user_data: value.marketing ? "granted" : "denied",
  ad_personalization: value.marketing ? "granted" : "denied",
});
