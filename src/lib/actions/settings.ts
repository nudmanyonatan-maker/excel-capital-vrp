"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getEnv } from "@/lib/db";
import { getMailer, type MailerEnv } from "@/lib/mailer";
import { updateSettings } from "@/lib/repo/settings";
import { writeAudit } from "@/lib/repo/audit";

export async function updateSettingsAction(fd: FormData): Promise<void> {
  const user = await requireRole("admin");
  const db = getDb();

  const numOrUndef = (k: string) => {
    const v = fd.get(k);
    if (typeof v !== "string" || !v.trim()) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const strOrUndef = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  await updateSettings(
    db,
    {
      defaultRetryMax: numOrUndef("defaultRetryMax"),
      defaultRetrySpacingHours: numOrUndef("defaultRetrySpacingHours"),
      defaultReferenceFormat: strOrUndef("defaultReferenceFormat"),
      sendingDomain: strOrUndef("sendingDomain") ?? null,
      retentionDays: numOrUndef("retentionDays"),
    },
    user.id,
  );
  await writeAudit(db, {
    actorStaffId: user.id,
    action: "settings.update",
    entityType: "settings",
    entityId: "singleton",
  });
  revalidatePath("/settings");
}

/**
 * updateSettingsAction, reporting its refusals instead of blanking the page.
 *
 * It validates little today, but requireRole throws, so a non-admin who reaches
 * this form got the blank "This page couldn't load" page rather than being told
 * they lack permission. Wrapped for the same reason as the borrower actions, and
 * so the rule holds everywhere rather than in most places.
 */
export type SettingsFormMessage = { message: string } | null;

export async function updateSettingsFormAction(
  _prev: SettingsFormMessage,
  fd: FormData,
): Promise<SettingsFormMessage> {
  await requireRole("admin");
  try {
    await updateSettingsAction(fd);
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
    console.error("update settings failed", error);
    return {
      message:
        error instanceof Error && error.message
          ? error.message
          : "Could not save these settings. Nothing was changed.",
    };
  }
}

export type TestEmailState = { ok: boolean; message: string } | null;

/**
 * Send one email to the signed-in admin through the live mail setup.
 *
 * "Is email set up" was only ever answered from configuration, so the Settings
 * page said borrowers were getting emails for two days while every send was
 * refused (the sending domain had lost its DNS records). This proves the whole
 * path, from the app through Resend to an inbox, and goes only to the person
 * pressing it, never to a borrower.
 */
export async function sendTestEmailAction(): Promise<TestEmailState> {
  const user = await requireRole("admin");
  const env = getEnv();
  const mailer = getMailer(env as MailerEnv);
  const result = await mailer.send({
    to: user.email,
    subject: "Test email from the Excel Capital platform",
    text:
      "This is a test sent from Settings to check that the platform can send email.\n\n" +
      "If you are reading it, setup links, receipts and failed-payment notices are reaching inboxes.",
  });
  await writeAudit(getDb(), {
    actorStaffId: user.id,
    action: "email.test",
    entityType: "settings",
    entityId: "singleton",
    metadata: { mode: mailer.mode, ok: result.ok, to: user.email, error: result.error ?? null },
  });
  revalidatePath("/settings");
  if (mailer.mode !== "resend") {
    return { ok: false, message: "Email is not set up in this copy, so nothing was sent." };
  }
  return result.ok
    ? { ok: true, message: `Sent to ${user.email}. Check that inbox, and spam, in a minute.` }
    : { ok: false, message: `Not sent: ${result.error ?? "the email service refused it"}.` };
}
