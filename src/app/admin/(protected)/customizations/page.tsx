import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CUSTOMIZATION_STATUS_LABELS, CUSTOMIZATION_STATUSES } from "@/server/customization/workflow";
import { listAdminCustomizations } from "@/server/customization/admin";
import type { CustomizationStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Customizations" };

export default async function AdminCustomizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const list = await listAdminCustomizations(params);
  return <div><PageHeader title="Customizations" description={`${list.items.length} request${list.items.length === 1 ? "" : "s"}`} /><form method="get" className="mb-5 grid gap-3 rounded-2xl border border-cream-200 bg-surface p-4 sm:grid-cols-2"><SearchInput name="q" defaultValue={list.q} placeholder="Search request, customer or email" aria-label="Search customizations" /><Select name="status" defaultValue={list.status}><option value="">All statuses</option>{CUSTOMIZATION_STATUSES.map((status) => <option key={status} value={status}>{CUSTOMIZATION_STATUS_LABELS[status]}</option>)}</Select><button className="w-fit rounded-xl bg-navy-700 px-4 py-2.5 text-sm text-cream-50">Apply filters</button></form>{list.items.length === 0 ? <p className="text-sm text-muted">No customization requests match these filters.</p> : <Table><THead><TR><TH>Request</TH><TH>Customer</TH><TH>Status</TH><TH>Created</TH></TR></THead><TBody>{list.items.map((item) => <TR key={item.id}><TD><Link href={`/admin/customizations/${item.id}`} className="font-medium text-navy-800 underline-offset-4 hover:underline">{item.details}</Link></TD><TD>{item.customerName}<span className="block text-sm text-muted">{item.customerEmail ?? "No email"}</span></TD><TD><Badge tone={item.status === "rejected" || item.status === "cancelled" ? "danger" : item.status === "completed" ? "success" : "gold"}>{CUSTOMIZATION_STATUS_LABELS[item.status]}</Badge></TD><TD>{new Date(item.createdAt).toLocaleDateString("en-IN")}</TD></TR>)}</TBody></Table>}</div>;
}
