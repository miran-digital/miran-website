"use client";

import { useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type SellerDocument = {
  id: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type SellerGuarantee = {
  id: string;
  kind: string;
  reference: string;
  amount_irr: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type ManagedSeller = {
  id: string;
  business_name: string;
  legal_name: string | null;
  national_id: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejection_reason: string | null;
  documents: SellerDocument[];
  guarantees: SellerGuarantee[];
};

function toman(irr: number | null) {
  if (irr === null) return "بدون مبلغ";
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

export function RealSellerVerificationManager() {
  const [sellers, setSellers] = useState<ManagedSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/sellers", { cache: "no-store" });
      const data = (await response.json()) as { sellers?: ManagedSeller[]; message?: string };
      if (!response.ok || !data.sellers) {
        setMessage(data.message ?? "دریافت فروشندگان انجام نشد.");
        return;
      }
      setSellers(data.sellers);
    } catch {
      setMessage("ارتباط با Backend فروشندگان برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(payload: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/sellers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "به‌روزرسانی فروشنده انجام نشد.");
        return;
      }
      await load();
      setMessage("وضعیت فروشنده به‌روزرسانی شد.");
    } catch {
      setMessage("به‌روزرسانی فروشنده انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  function reason(promptText: string) {
    return window.prompt(promptText, "")?.trim() || "";
  }

  return (
    <section className={styles.section} aria-labelledby="real-sellers-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Database-backed Seller Verification</p>
            <h2 id="real-sellers-title">تأیید واقعی فروشندگان</h2>
            <p className={styles.note}>
              فروشنده فقط زمانی قابل تأیید است که حداقل یک مدرک و یک ضمانت داشته باشد و همه موارد ارسال‌شده توسط مدیر تأیید شده باشند.
            </p>
          </div>
          {loading && sellers.length === 0 ? <p role="status">در حال دریافت…</p> : null}
          {!loading && sellers.length === 0 ? <p>هنوز درخواست فروشندگی واقعی ثبت نشده است.</p> : null}
          {sellers.map((seller) => {
            const canApprove = seller.documents.length > 0 && seller.guarantees.length > 0 &&
              seller.documents.every((item) => item.status === "APPROVED") &&
              seller.guarantees.every((item) => item.status === "APPROVED");
            return (
              <article className={styles.card} key={seller.id}>
                <h3>{seller.business_name}</h3>
                <p className={styles.status}>{seller.status}</p>
                {seller.legal_name ? <p className={styles.meta}>نام حقوقی: {seller.legal_name}</p> : null}
                {seller.national_id ? <p className={styles.meta}>شناسه: <bdi dir="ltr">{seller.national_id}</bdi></p> : null}
                {seller.rejection_reason ? <p className={styles.meta}>یادداشت بررسی: {seller.rejection_reason}</p> : null}

                <h4>مدارک</h4>
                {seller.documents.length === 0 ? <p>مدرکی ثبت نشده است.</p> : null}
                {seller.documents.map((document) => (
                  <div className={styles.actions} key={document.id}>
                    <span>{document.kind} — {document.status} — {Math.ceil(document.size_bytes / 1024).toLocaleString("fa-IR")} KB</span>
                    <button type="button" disabled={loading || document.status === "APPROVED"} onClick={() => void patch({ action: "document-review", id: document.id, status: "APPROVED" })}>تأیید مدرک</button>
                    <button type="button" disabled={loading || document.status === "REJECTED"} onClick={() => void patch({ action: "document-review", id: document.id, status: "REJECTED" })}>رد مدرک</button>
                  </div>
                ))}

                <h4>ضمانت‌ها</h4>
                {seller.guarantees.length === 0 ? <p>ضمانتی ثبت نشده است.</p> : null}
                {seller.guarantees.map((guarantee) => (
                  <div className={styles.actions} key={guarantee.id}>
                    <span>{guarantee.kind} — {guarantee.reference} — {toman(guarantee.amount_irr)} — {guarantee.status}</span>
                    <button type="button" disabled={loading || guarantee.status === "APPROVED"} onClick={() => void patch({ action: "guarantee-review", id: guarantee.id, status: "APPROVED" })}>تأیید ضمانت</button>
                    <button type="button" disabled={loading || guarantee.status === "REJECTED"} onClick={() => void patch({ action: "guarantee-review", id: guarantee.id, status: "REJECTED" })}>رد ضمانت</button>
                  </div>
                ))}

                <div className={styles.actions}>
                  <button type="button" disabled={loading || !canApprove || seller.status === "APPROVED"} onClick={() => void patch({ action: "seller-review", id: seller.id, status: "APPROVED" })}>
                    تأیید فروشنده
                  </button>
                  <button type="button" disabled={loading} onClick={() => {
                    const value = reason("دلیل رد فروشنده را وارد کنید:");
                    if (value) void patch({ action: "seller-review", id: seller.id, status: "REJECTED", reason: value });
                  }}>
                    رد فروشنده
                  </button>
                  <button type="button" disabled={loading || seller.status !== "APPROVED"} onClick={() => {
                    const value = reason("دلیل تعلیق فروشنده را وارد کنید:");
                    if (value) void patch({ action: "seller-review", id: seller.id, status: "SUSPENDED", reason: value });
                  }}>
                    تعلیق
                  </button>
                </div>
              </article>
            );
          })}
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
