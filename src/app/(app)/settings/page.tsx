import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { SettingsView } from "@/components/settings/settings-view";
import { Badge } from "@/components/ui/badge";
import { getShop, getShopMembers } from "@/lib/data";

export const metadata: Metadata = { title: "Moderators & Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const [membersResult, shopResult] = await Promise.all([getShopMembers(), getShop()]);
  const defaultTab = searchParams.tab === "preferences" ? "preferences" : "team";

  return (
    <div>
      <PageHeader
        title="Moderators & Settings"
        description="Team roles, granular permissions and your shop preferences."
        actions={
          <>
            <DataSourceBadge source={membersResult.source} />
            <Badge variant="secondary" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> {membersResult.data.length} members
            </Badge>
          </>
        }
      />

      <SettingsView
        members={membersResult.data}
        shopName={shopResult.data.name}
        defaultDomain={shopResult.data.customDomain}
        defaultTab={defaultTab}
      />
    </div>
  );
}
