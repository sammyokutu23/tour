import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Badge, Card, Field, Input, PageHeader, PageSkeleton, Select, Table, Td, Th } from "@/components/ui";
import { requestDb, requireRole } from "@/server/auth/session";
import { getSettings, SETTING_LABELS, type PlatformSettings } from "@/server/services/settings";
import { listCommissionRules } from "@/server/services/admin";
import { listCategories } from "@/server/services/catalogue";
import { categoryAction, commissionAction, deactivateCommissionAction, settingAction } from "@/app/actions/admin";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Fees & settings" };

export default function SettingsAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fees & settings" description="Changes apply to new quotes and bookings only. Existing bookings keep the commission and fees recorded when they were made." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireRole("/admin/settings", ["admin"]);
  const db = await requestDb();
  const [settings, rules, categories, providers] = await Promise.all([
    getSettings(db),
    listCommissionRules(db, session.actor),
    listCategories(db),
    db.query<{ id: string; display_name: string }>("select id, display_name from provider_profiles where status = 'approved' order by display_name"),
  ]);
  const editable = (Object.keys(SETTING_LABELS) as (keyof PlatformSettings)[]).filter((k) => k !== "currency");
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-bold text-forest">Platform settings</h2>
        <Alert tone="info" className="mb-4">Basis points: 100 bps = 1%. Tax defaults to 0 until treatment is confirmed with a Kenyan tax adviser.</Alert>
        <div className="space-y-3">
          {editable.map((k) => (
            <ActionForm key={k} action={settingAction.bind(null, k)} className="grid items-end gap-2 sm:grid-cols-[1fr_110px_1fr_auto]">
              <p className="text-sm font-semibold">{SETTING_LABELS[k]}</p>
              <Input name="value" type="number" aria-label={SETTING_LABELS[k]} defaultValue={String(settings[k])} className="h-9" />
              <Input name="reason" aria-label="Reason" placeholder="Reason" required className="h-9" />
              <SubmitButton size="sm" className="h-9">Save</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-bold text-forest">Commission rules</h2>
          <p className="mb-3 text-sm text-ink-muted">Default: {settings.defaultCommissionBps / 100}%. Most specific rule wins: provider → category → provider type → default.</p>
          {rules.length > 0 && (
            <Table className="mb-4">
              <thead><tr><Th>Scope</Th><Th>Rate</Th><Th>Note</Th><Th></Th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.provider_name ?? r.category_name ?? (r.provider_kind ? `All ${r.provider_kind}s` : "Global")}<span className="block text-xs text-ink-subtle">{formatDate(r.created_at)}</span></Td>
                    <Td>{r.commission_bps / 100}% {!r.active && <Badge>inactive</Badge>}</Td>
                    <Td className="text-xs">{r.note}</Td>
                    <Td>{r.active && <ActionButton action={deactivateCommissionAction.bind(null, r.id)} variant="ghost" className="h-8">Deactivate</ActionButton>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <ActionForm action={commissionAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Scope" htmlFor="scope"><Select id="scope" name="scope"><option value="kind">Provider type</option><option value="provider">Specific provider</option><option value="category">Category</option></Select></Field>
            <Field label="Rate (%)" htmlFor="percent"><Input id="percent" name="percent" type="number" min={0} max={50} step={0.5} defaultValue={12} /></Field>
            <Field label="Provider type" htmlFor="providerKind"><Select id="providerKind" name="providerKind"><option value="guide">Guides</option><option value="operator">Operators</option></Select></Field>
            <Field label="Provider" htmlFor="providerId"><Select id="providerId" name="providerId"><option value="">—</option>{providers.rows.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select></Field>
            <Field label="Category" htmlFor="categoryId"><Select id="categoryId" name="categoryId"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Why" htmlFor="note"><Input id="note" name="note" required /></Field>
            <div className="sm:col-span-2"><SubmitButton size="sm">Add rule</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-bold text-forest">Experience categories</h2>
          <ul className="mb-4 flex flex-wrap gap-1.5">{categories.map((c) => <Badge key={c.id} tone="forest">{c.name}</Badge>)}</ul>
          <ActionForm action={categoryAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug" htmlFor="slug"><Input id="slug" name="slug" pattern="[a-z0-9-]+" required /></Field>
            <Field label="Name" htmlFor="name"><Input id="name" name="name" required /></Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2"><Input id="description" name="description" /></Field>
            <div><SubmitButton size="sm" variant="secondary">Save category</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
