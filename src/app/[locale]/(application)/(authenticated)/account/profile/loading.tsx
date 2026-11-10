import { EditorSkeleton } from "@/components/loading/loading-preview";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";

export default async function LoadingProfile() {
  const { user } = await getAuthOrRedirect();
  return <EditorSkeleton profile user={user} />;
}
