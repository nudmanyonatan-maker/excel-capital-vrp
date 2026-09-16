"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
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
