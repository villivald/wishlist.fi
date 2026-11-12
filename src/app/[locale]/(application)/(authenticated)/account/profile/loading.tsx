import { EditorSkeleton } from "@/components/loading/loading-preview";
import { AccountSecurity } from "@/features/auth/components/account-security";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";

export default async function LoadingProfile() {
  const { user } = await getAuthOrRedirect();
  return (
    <EditorSkeleton
      profile
      user={user}
      security={<AccountSecurity userId={user.id} />}
    />
  );
}
