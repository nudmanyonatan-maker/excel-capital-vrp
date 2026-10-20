/**
 * Whether a borrower's last failed bank connection is still worth showing.
 *
 * The red "last attempt failed" box read only the latest failure, so it stayed
 * up after the borrower went on to approve. ASIAN UK SPA CONFINEMENT LTD failed
 * at 14:16 UTC on 20 Oct, approved at 15:13, and still showed the failure and
 * "send a new link" beside "All approved". An approval after the failure answers it.
 */
export function failureStillRelevant(failureAt: string, lastApprovedAt: string | null | undefined): boolean {
  return !lastApprovedAt || lastApprovedAt < failureAt;
}
