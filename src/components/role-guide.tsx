import { ROLES, ROLE_INFO } from "@/lib/roles";

/**
 * What each role can and cannot do, from the same definitions the Staff picker
 * uses. Shown where roles are handed out, so nobody has to ask what "operator"
 * means before choosing one.
 */
export function RoleGuide() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {ROLES.map((role) => {
        const info = ROLE_INFO[role];
        return (
          <div key={role} className="rounded-md border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">{info.name}</div>
            <p className="mt-0.5 text-xs text-slate-600">{info.summary}</p>
            <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
              {info.can.map((c) => (
                <li key={c}>
                  <span className="mr-1 text-emerald-700">✓</span>
                  {c}
                </li>
              ))}
              {info.cannot.map((c) => (
                <li key={c} className="text-slate-500">
                  <span className="mr-1 text-red-600">✕</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
