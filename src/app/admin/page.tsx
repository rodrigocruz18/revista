import { isAuthenticated } from "@/lib/adminAuth";
import { isBlobConfigured } from "@/lib/blobManifest";
import { getAllEditions } from "@/lib/magazines";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { magazineConfig } from "@/config/magazine";

export const metadata = {
  title: `Admin · ${magazineConfig.name}`,
  robots: { index: false, follow: false },
};

// This page's content depends on the request's auth cookie and on the
// live manifest — never statically cache or prerender it.
export const dynamic = "force-dynamic";

/**
 * A separate, unlinked URL (not part of the public nav) for publishing new
 * editions without a git/Vercel redeploy cycle. Auth is a single shared
 * password (see @/lib/adminAuth) — gated here rather than via a Proxy
 * (middleware's Next.js 16 replacement) so the large-file upload flow never
 * has to pass through Proxy's request-body handling at all.
 */
export default async function AdminPage() {
  const authed = await isAuthenticated();
  if (!authed) {
    return <AdminLogin />;
  }

  const editions = await getAllEditions();
  return <AdminDashboard initialEditions={editions} blobConfigured={isBlobConfigured()} />;
}
