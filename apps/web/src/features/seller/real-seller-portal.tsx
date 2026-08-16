"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "@/features/admin/real-product-manager.module.css";

type SellerDocument = {
  id: string;
  kind: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type SellerGuarantee = {
  id: string;
  kind: string;
  reference: string;
  amount_irr: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

type Seller = {
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

export function RealSellerPortal() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [hasApplication, setHasApplication] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/seller", { cache: "no-store" });
      const data = (await response.json()) as { seller?: Seller; error?: string; message?: string };
      if (response.status === 404) {
        setSeller(null);
        setHasApplication(false);
        return;
      }
      if (!response.ok || !data.seller) {
        setMessage(data.message ?? "وضعیت فروشندگی دریافت نشد.");
        return;
      }
      setSeller(data.seller);
      setHasApplication(true);
    } catch {
      setMessage("ارتباط با Backend فروشندگان برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/seller", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          businessName: String(data.get("businessName") || "").trim(),
          legalName: String(data.get("legalName") || "").trim() || null,
          nationalId: String(data.get("nationalId") || "").trim() || null,
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "ثبت درخواست انجام نشد.");
        return;
      }
      form.reset();
      setMessage("درخواست فروشندگی در Database ثبت شد.");
      await load();
    } catch {
      setMessage("ثبت درخواست فروشندگی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function submitGuarantee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amountToman = String(data.get("amountToman") || "").trim();
    const amountIrr = amountToman ? Number(amountToman) * 10 : null;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/seller", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "guarantee",
          kind: String(data.get("kind") || "").trim(),
          reference: String(data.get("reference") || "").trim(),
          amountIrr,
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "ثبت ضمانت انجام نشد.");
        return;
      }
      form.reset();
      setMessage("ضمانت ثبت شد و در انتظار بررسی مدیر است.");
      await load();
    } catch {
      setMessage("ثبت ضمانت انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.section}>
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Seller Portal</p>
            <h1>فروشندگی در Miran</h1>
            <p className={styles.note}>
              درخواست، ضمانت و وضعیت بررسی از Database واقعی خوانده می‌شوند. آپلود مدارک فقط پس از اتصال فضای ذخیره‌سازی خصوصی فعال می‌شود تا فایل هویتی در مسیر عمومی قرار نگیرد.
            </p>
          </div>

          {loading && !hasApplication ? <p role="status">در حال دریافت وضعیت…</p> : null}

          {!loading && !hasApplication ? (
            <form className={styles.form} onSubmit={submitApplication}>
              <h2>درخواست فروشندگی</h2>
              <label>نام فروشگاه<input name="businessName" maxLength={160} required /></label>
              <label>نام حقوقی<input name="legalName" maxLength={160} /></label>
              <label>شناسه/کد ملی<input name="nationalId" dir="ltr" maxLength={80} /></label>
              <button type="submit" disabled={loading}>ثبت درخواست واقعی</button>
            </form>
          ) : null}

          {seller ? (
            <section>
              <article className={styles.card}>
                <h2>{seller.business_name}</h2>
                <p className={styles.status}>{seller.status}</p>
                {seller.rejection_reason ? <p className={styles.meta}>یادداشت مدیر: {seller.rejection_reason}</p> : null}
              </article>

              <div className={styles.grid}>
                <div>
                  <h3>مدارک</h3>
                  {seller.documents.length === 0 ? <p>هنوز مدرکی به پرونده متصل نشده است.</p> : null}
                  {seller.documents.map((document) => (
                    <article className={styles.card} key={document.id}>
                      <strong>{document.kind}</strong>
                      <p className={styles.status}>{document.status}</p>
                    </article>
                  ))}
                  <p className={styles.note}>
                    آپلود فایل هویتی عمداً تا اتصال Private Object Storage غیرفعال است.
                  </p>
                </div>

                <form className={styles.form} onSubmit={submitGuarantee}>
                  <h3>ثبت ضمانت</h3>
                  <label>نوع ضمانت<input name="kind" maxLength={80} placeholder="مثلاً ضمانت بانکی" required /></label>
                  <label>شماره/مرجع<input name="reference" maxLength={200} dir="ltr" required /></label>
                  <label>مبلغ به تومان<input name="amountToman" type="number" min="0" step="1" /></label>
                  <button type="submit" disabled={loading || seller.status === "APPROVED" || seller.status === "SUSPENDED"}>ثبت ضمانت</button>
                </form>
              </div>

              <h3>ضمانت‌های ثبت‌شده</h3>
              {seller.guarantees.map((guarantee) => (
                <article className={styles.card} key={guarantee.id}>
                  <strong>{guarantee.kind}</strong>
                  <p>{guarantee.reference}</p>
                  <p>{toman(guarantee.amount_irr)}</p>
                  <p className={styles.status}>{guarantee.status}</p>
                </article>
              ))}
            </section>
          ) : null}

          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </main>
  );
}
