import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Card, Checkbox, Field, Input, PageHeader, PageSkeleton, Textarea } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getTravellerProfile } from "@/server/services/community";
import { changePasswordAction, updateProfileAction } from "@/app/actions/account";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, notification and privacy preferences." />
      <Suspense fallback={<PageSkeleton />}>
        <Forms />
      </Suspense>
    </div>
  );
}

async function Forms() {
  const session = await requireSession("/dashboard/settings");
  const p = await getTravellerProfile(await requestDb(), session.actor);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-forest">Profile &amp; preferences</h2>
        <ActionForm action={updateProfileAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="displayName"><Input id="displayName" name="displayName" defaultValue={p.display_name} required /></Field>
            <Field label="Email" htmlFor="email" hint="Contact support to change your sign-in email."><Input id="email" value={p.email} disabled readOnly /></Field>
            <Field label="Phone (optional)" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={p.phone ?? ""} /></Field>
            <Field label="Home country" htmlFor="homeCountry"><Input id="homeCountry" name="homeCountry" defaultValue={p.home_country ?? ""} /></Field>
            <Field label="Languages" htmlFor="languages" hint="Comma separated" className="sm:col-span-2"><Input id="languages" name="languages" defaultValue={p.languages.join(", ")} /></Field>
            <Field label="Dietary requirements" htmlFor="dietaryRequirements"><Textarea id="dietaryRequirements" name="dietaryRequirements" defaultValue={p.dietary_requirements ?? ""} className="min-h-16" /></Field>
            <Field label="Accessibility requirements" htmlFor="accessibilityRequirements"><Textarea id="accessibilityRequirements" name="accessibilityRequirements" defaultValue={p.accessibility_requirements ?? ""} className="min-h-16" /></Field>
          </div>
          <fieldset className="space-y-3 rounded-2xl bg-sand p-4">
            <legend className="px-1 text-sm font-semibold">Notifications &amp; privacy</legend>
            <Checkbox name="notifyEmail" defaultChecked={p.notify_email} label="Email me booking updates, payment confirmations and messages" />
            <Checkbox name="marketingConsent" defaultChecked={p.marketing_consent} label="Send me occasional travel inspiration (optional)" />
            <Checkbox name="analyticsConsent" defaultChecked={p.analytics_consent} label="Link my product-usage events to my account to help improve the service (optional; withdrawing unlinks past events)" />
          </fieldset>
          <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
        </ActionForm>
      </Card>
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-bold text-forest">Change password</h2>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field label="Current password" htmlFor="currentPassword"><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" htmlFor="newPassword" hint="At least 10 characters, with a letter and a number."><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton variant="secondary" pendingLabel="Saving…">Change password</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-bold text-forest">Your data</h2>
          <p className="mt-1 text-sm text-ink-muted">Download a copy of your profile, trips, bookings, reviews and messages.</p>
          <a href="/api/me/export" className="mt-4 inline-flex h-11 items-center rounded-full border border-forest/20 bg-white px-5 text-sm font-semibold text-forest hover:bg-forest-50">Download my data (JSON)</a>
          <p className="mt-3 text-xs text-ink-subtle">To delete your account, contact support. Booking and payment records are kept for the period required by law before deletion.</p>
        </Card>
      </div>
    </div>
  );
}
