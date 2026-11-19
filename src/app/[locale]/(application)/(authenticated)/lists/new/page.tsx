import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import { ListForm } from "@/features/wishlist/components/list-form";

export default async function NewListPage() {
  const { user } = await getAuthOrRedirect();
  const access = await readPremiumAccess(user.id);
  return <ListForm canCreatePrivate={access.plan === "PREMIUM"} />;
}
