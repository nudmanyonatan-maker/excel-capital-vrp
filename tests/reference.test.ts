import { describe, it, expect } from "vitest";
import { buildReference, oneOffReferencePreview, uniqueReferenceFromBase } from "@/lib/reference";
import { manualKey } from "@/lib/idempotency";

describe("buildReference", () => {
  it("substitutes tokens", () => {
    const ref = buildReference("EXCEL-{borrower}-{seq}", {
      borrowerToken: "ACME",
      seq: 3,
      date: "20260201",
    });
    expect(ref).toBe("EXCELACME3");
  });

  it("trims to Plaid's 18-char BACS limit", () => {
    const ref = buildReference("EXCELCAPITAL-{borrower}-{seq}", {
      borrowerToken: "LONGBORROWERNAME",
      seq: 12,
    });
    expect(ref.length).toBeLessThanOrEqual(18);
  });

  it("fills date when not provided", () => {
    const ref = buildReference("{date}", { borrowerToken: "X", seq: 1 });
    expect(ref).toMatch(/^\d{8}$/);
  });
});

describe("previewing a one-off payment's statement reference", () => {
  const borrowerId = "38703568-604c-4669-9aab-3ed7db798dfa";
  const nonce = "6f1c2a8e-0000-4000-8000-000000000001";

  it("matches exactly what the payment will be sent with", () => {
    const preview = oneOffReferencePreview("INV3436", borrowerId, nonce);
    expect(preview?.full).toBe(uniqueReferenceFromBase("INV3436", manualKey(borrowerId, nonce)));
  });

  it("splits what they typed from the code added on the end", () => {
    const preview = oneOffReferencePreview("INV 3436", borrowerId, nonce)!;
    expect(preview.kept).toBe("INV3436");
    expect(preview.code).toHaveLength(6);
    expect(preview.full).toBe(preview.kept + preview.code);
    expect(preview.cut).toBe("");
  });

  it("says what gets cut off a long reason", () => {
    const preview = oneOffReferencePreview("Late payment fee", borrowerId, nonce)!;
    expect(preview.kept).toBe("Latepaymentf");
    expect(preview.cut).toBe("ee");
  });

  it("has nothing to show for blank or symbol-only text", () => {
    expect(oneOffReferencePreview("", borrowerId, nonce)).toBeNull();
    expect(oneOffReferencePreview("£ - !", borrowerId, nonce)).toBeNull();
  });
});
