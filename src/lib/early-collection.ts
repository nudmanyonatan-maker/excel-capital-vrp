import { amountForRun, nextRunDate, type ScheduleSpec } from "@/lib/schedule";

/**
 * What "Execute payment now" will do when the next repayment is not due yet.
 *
 * The button collects the NEXT scheduled repayment, whatever its date, and moves
 * the schedule on to the one after. On a schedule starting next week that takes
 * next week's money today and leaves nothing to collect on the date that was
 * set. Axiom pressed it expecting a schedule to start, and the confirm prompt
 * only said "Collect £1,611.00 now?". This names both dates so the prompt says
 * what will actually happen.
 *
 * Returns null when the repayment is due today or earlier, which needs no warning.
 */
export function earlyCollection(
  spec: ScheduleSpec,
  nextRun: string | null,
  progress: { paymentsMade: number; collectedMinor: number },
  today: string,
): { dueDate: string; followingDate: string | null } | null {
  if (!nextRun || nextRun <= today) return null;
  return {
    dueDate: nextRun,
    followingDate: nextRunDate(spec, {
      afterDate: nextRun,
      paymentsMade: progress.paymentsMade + 1,
      collectedMinor: progress.collectedMinor + amountForRun(spec, progress.collectedMinor),
    }),
  };
}
