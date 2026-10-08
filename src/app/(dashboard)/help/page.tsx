import Image from "next/image";
import Link from "next/link";
import { RoleGuide } from "@/components/role-guide";
import { TIPS } from "@/lib/help-text";

export const dynamic = "force-dynamic";

/**
 * How to use the platform, for someone with nobody to ask.
 *
 * Every staff member can read it. Sections that only some roles can act on say
 * so in their heading, so a sales rep is never sent looking for a button they
 * do not have. Field-level detail lives in the "i" next to each field (TIPS),
 * and is reused here rather than rewritten.
 */

const SECTIONS = [
  { id: "start", title: "Start here" },
  { id: "roles", title: "Who can do what" },
  { id: "tips", title: "The little i" },
  { id: "onboard", title: "Onboard a borrower" },
  { id: "setup-link", title: "Send the setup link" },
  { id: "test", title: "Check it works with £1" },
  { id: "schedule", title: "Set the repayment schedule" },
  { id: "collect", title: "Collecting money" },
  { id: "failed", title: "When a borrower cannot connect" },
  { id: "accounts", title: "Bank accounts repayments go to" },
  { id: "staff", title: "Adding staff" },
  { id: "words", title: "Words we use" },
];

function Section({
  id,
  title,
  who,
  children,
}: {
  id: string;
  title: string;
  who?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
        {title}
        {who && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{who}</span>
        )}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function Shot({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className="h-auto w-full max-w-2xl rounded-md border border-slate-200"
    />
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1 pl-5">{children}</ol>;
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
      <p className="mt-1 text-sm text-slate-600">
        Everything you need to use the platform. Jump to a topic, or hover any{" "}
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold text-slate-500">
          i
        </span>{" "}
        on a screen for help with that field.
      </p>

      <nav aria-label="Topics" className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-slate-700 underline-offset-2 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-5 space-y-5">
        <Section id="start" title="Start here">
          <p>The platform collects loan repayments straight from a borrower&apos;s bank account. It works in three steps:</p>
          <Steps>
            <li>
              <strong>You onboard the borrower</strong>: who they are, which of our accounts their money goes to,
              and the most that can ever be taken.
            </li>
            <li>
              <strong>The borrower approves</strong> those limits with their own bank, using the setup link we
              send them. This approval is called a mandate.
            </li>
            <li>
              <strong>We collect</strong> on the schedule the accounts team sets, never more than the borrower
              approved.
            </li>
          </Steps>
        </Section>

        <Section id="roles" title="Who can do what">
          <p>Everyone has one role. An admin sets it on the <Link href="/staff" className="underline">Staff</Link> page.</p>
          <RoleGuide />
        </Section>

        <Section id="tips" title="The little i">
          <p>
            Every field and button has an <strong>i</strong> next to it. Hover over it, or tap it on a phone, to
            see what the field is for and what to put in it.
          </p>
          <Shot src="/help/tooltip.png" alt="An i next to a field, showing its explanation" width={769} height={393} />
        </Section>

        <Section id="onboard" title="Onboard a borrower" who="Sales reps, operators, admins">
          <Steps>
            <li>
              Go to <Link href="/borrowers" className="underline">Borrowers</Link> and press <strong>New borrower</strong>.
            </li>
            <li>Search for the company. The name, number and address fill in from Companies House.</li>
            <li>Add the contact email. The setup link goes there.</li>
            <li>
              Choose which account <strong>repayments are paid into</strong>. You can only pick from the list an
              admin has approved. Nobody can type an account number in.
            </li>
            <li>
              Set the <strong>limits</strong>. Not sure? Use <strong>Suggest ceilings</strong>: it fills them in from
              the repayment, with room for a late fee.
            </li>
            <li>Press <strong>Create borrower</strong>.</li>
          </Steps>
          <p className="rounded-md bg-amber-50 p-3 text-amber-900">
            Limits are ceilings, not the repayment. {TIPS.maxPaymentAmount}
          </p>
          <Shot src="/help/new-borrower.png" alt="The new borrower form" width={769} height={1409} />
          <p className="text-xs text-slate-500">
            Sales reps do not see the repayment schedule section. The accounts team sets that.
          </p>
        </Section>

        <Section id="setup-link" title="Send the setup link" who="Sales reps, operators, admins">
          <Steps>
            <li>Open the borrower and press <strong>Generate setup link</strong>.</li>
            <li>
              If email is set up, it is sent to the contact email for you. If not, press <strong>Copy link</strong> and
              send it yourself.
            </li>
            <li>
              The borrower opens it, picks their bank, and approves. When they finish, <strong>Borrower&apos;s side</strong>{" "}
              at the top of their page turns to <strong>All approved</strong>.
            </li>
          </Steps>
          <p>
            A link lasts 72 hours. If it runs out, just generate a new one. If they had already approved, nothing
            changes.
          </p>
        </Section>

        <Section id="test" title="Check it works with £1" who="Sales reps, operators, admins">
          <p>
            Once the borrower has approved, press <strong>Send £1 test payment</strong> and confirm. It takes exactly
            £1 into the borrower&apos;s default account and shows in their payment history.
          </p>
          <p>Sales reps can send up to £5 of tests in any 24 hours, across all borrowers.</p>
          <Shot
            src="/help/rep-borrower-page.png"
            alt="A borrower as a sales rep sees it: Generate setup link and Send £1 test payment"
            width={1280}
            height={900}
          />
        </Section>

        <Section id="schedule" title="Set the repayment schedule" who="Operators, admins">
          <Steps>
            <li>Open the borrower and press <strong>Edit</strong> on the Schedule card.</li>
            <li>Set the amount, how often, the start date, and when it ends.</li>
            <li>Save. Payments are then taken automatically every morning they are due.</li>
          </Steps>
          <p>Changing a schedule never collects the same repayment twice and never restarts the loan.</p>
        </Section>

        <Section id="collect" title="Collecting money" who="Operators, admins">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Execute payment now</strong>: {TIPS.executeNow}
            </li>
            <li>
              <strong>Take a one-off payment</strong>: {TIPS.oneOff}
            </li>
            <li>
              <strong>Retry</strong> appears next to a failed payment. Usually the borrower did not have enough
              money in their account.
            </li>
            <li>
              <strong>Pause collections</strong>: {TIPS.pause}
            </li>
            <li>
              <strong>Archive borrower</strong>: {TIPS.archive}
            </li>
          </ul>
          <Shot src="/help/borrower-page.png" alt="A borrower page as an operator sees it" width={1265} height={1102} />
        </Section>

        <Section id="failed" title="When a borrower cannot connect">
          <p>
            If a borrower&apos;s bank refuses, a red box appears on their page saying which bank and why. Find the
            error code in it:
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Error code</th>
                <th className="py-1 font-medium">What to do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              <tr>
                <td className="py-2 pr-3 font-mono text-xs">PAYMENT_CONSENT_INVALID_CONSTRAINTS</td>
                <td className="py-2">
                  Fixed on 5 October for Monzo. Send them a new setup link and ask them to try again.
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono text-xs">PAYMENT_CONSENT_CANCELLED</td>
                <td className="py-2">The borrower backed out at their bank. Send the link again when they are ready.</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Anything else</td>
                <td className="py-2">
                  Send a new link and ask them to try once more. If it fails again, send Yonatan the{" "}
                  <strong>Plaid session</strong> shown in the red box.
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section id="accounts" title="Bank accounts repayments go to" who="Admins">
          <p>
            In <Link href="/settings" className="underline">Settings</Link>, <strong>Accounts repayments go to</strong> is
            the only list of accounts borrower money can be paid into.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Add an account</strong>: type its details once. Check them carefully: every borrower who uses
              it pays into exactly this account.
            </li>
            <li>
              <strong>Accounts your borrowers already pay into</strong> lists accounts typed in before this list
              existed. Press <strong>Add to the list</strong> on the ones that are yours.
            </li>
            <li>
              <strong>Open to sales</strong>: {TIPS.salesCanUse}
            </li>
            <li>
              <strong>Remove from list</strong> stops new borrowers using it. Borrowers already paying into it carry
              on.
            </li>
          </ul>
          <Shot src="/help/settings-accounts.png" alt="The approved accounts list in Settings" width={673} height={821} />
        </Section>

        <Section id="staff" title="Adding staff" who="Admins">
          <Steps>
            <li>
              Go to <Link href="/staff" className="underline">Staff</Link>, type their email, choose a role, and press{" "}
              <strong>Add staff</strong>.
            </li>
            <li>They sign in with that email. Nothing else is needed.</li>
          </Steps>
          <p>
            Someone who signs in without being added sees an <strong>Ask for access</strong> screen. Their request
            appears at the top of the Staff page for you to approve, with a role, or decline.
          </p>
        </Section>

        <Section id="words" title="Words we use">
          <dl className="space-y-2">
            <div>
              <dt className="font-semibold">Mandate</dt>
              <dd>The borrower&apos;s approval, at their own bank, for us to take payments within their limits.</dd>
            </div>
            <div>
              <dt className="font-semibold">Ceiling, or limit</dt>
              <dd>The most that can be taken in one payment, or in one period. The bank refuses anything above it.</dd>
            </div>
            <div>
              <dt className="font-semibold">Period</dt>
              <dd>{TIPS.consentPeriod}</dd>
            </div>
            <div>
              <dt className="font-semibold">Default account</dt>
              <dd>Where a borrower&apos;s scheduled repayments and £1 tests go when they have more than one account.</dd>
            </div>
            <div>
              <dt className="font-semibold">Setup link</dt>
              <dd>{TIPS.setupLink}</dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
