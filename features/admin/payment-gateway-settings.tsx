"use client";

import { useEffect, useState, type FormEvent } from "react";
import { paymentProviderCatalog, type AdminPaymentProvider, type PaymentProviderDefinition } from "@/lib/payments/provider-catalog";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import type { PaymentHealth } from "@/lib/payments/provider-types";
import styles from "./payment-gateway-settings.module.css";

type MessageHandler = (status: "loading" | "saving" | "saved" | "error", message: string) => void;
type Editor = { provider: string; mode: "add" | "update" };
type Payload = {
  providers?: AdminPaymentProvider[];
  config?: AdminPaymentProvider;
  provider?: string;
  removed?: boolean;
  error?: string;
  field?: string;
  health?: PaymentHealth;
};

export function PaymentGatewaySettings({ onStatus, calendarMode }: { onStatus: MessageHandler; calendarMode: CalendarMode }) {
  const [providers, setProviders] = useState<AdminPaymentProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [healthResults, setHealthResults] = useState<Record<string, PaymentHealth>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/payment-providers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as Payload;
        if (!response.ok || !payload.providers) throw new Error(payload.error || "خواندن درگاه‌ها ممکن نشد.");
        if (!controller.signal.aborted) setProviders(payload.providers);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : "خواندن درگاه‌ها ممکن نشد.";
          setLoadError(message); onStatus("error", message);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [onStatus]);
  const added = providers.filter((provider) => provider.added).sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider));
  const selected = providers.find((provider) => provider.provider === editor?.provider);
  const definition = paymentProviderCatalog.find((item) => item.id === editor?.provider);
  const updateConfig = (config: AdminPaymentProvider) => setProviders((current) => [...current.filter((item) => item.provider !== config.provider), config]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editor || !definition) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const credentials = Object.fromEntries(definition.credentialSchema.fields.map((field) => [field.name, String(data.get(field.name) ?? "").trim()]));
    setBusy(true); setFieldError(""); onStatus("saving", "");
    try {
      const response = await fetch("/api/admin/payment-providers", {
        method: editor.mode === "add" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: definition.id, priority: Number(data.get("priority")), sandbox: data.get("sandbox") === "on",
          credentials, ...(editor.mode === "add" ? { enabled: false } : {}) }),
      });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.config) {
        if (payload.field) {
          setFieldError(payload.field);
          const control = form.elements.namedItem(payload.field);
          if (control instanceof HTMLElement) { control.focus({ preventScroll: true }); control.scrollIntoView({ block: "center", behavior: "smooth" }); }
        }
        throw new Error(payload.error || "ذخیره امن درگاه ممکن نشد.");
      }
      updateConfig(payload.config);
      // Secret controls are cleared and unmounted after saving; hints are never submitted as values.
      form.reset(); setEditor(null);
      onStatus("saved", "تنظیمات درگاه به‌صورت امن ذخیره شد؛ فعال‌سازی از فهرست درگاه‌ها انجام می‌شود.");
    } catch (error) {
      onStatus("error", error instanceof Error ? error.message : "ذخیره امن درگاه ممکن نشد.");
    } finally { setBusy(false); }
  }

  async function toggle(config: AdminPaymentProvider) {
    if (busy) return;
    setBusy(true); onStatus("saving", "");
    try {
      const response = await fetch("/api/admin/payment-providers", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: config.provider, enabled: !config.enabled }) });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.config) throw new Error(payload.error || "تغییر وضعیت درگاه ممکن نشد.");
      updateConfig(payload.config);
      onStatus("saved", payload.config.enabled ? "درگاه برای درخواست‌های جدید فعال شد." : "درگاه برای درخواست‌های جدید غیرفعال شد؛ تأیید پرداخت‌های قبلی حفظ می‌شود.");
    } catch (error) { onStatus("error", error instanceof Error ? error.message : "تغییر وضعیت درگاه ممکن نشد."); }
    finally { setBusy(false); }
  }

  async function checkHealth(config: AdminPaymentProvider) {
    if (busy) return;
    setBusy(true); onStatus("loading", "در حال بررسی امن پیکربندی درگاه…");
    try {
      const response = await fetch("/api/admin/payment-providers/" + encodeURIComponent(config.provider) + "/health", { method: "POST" });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.health) throw new Error(payload.error || "بررسی پیکربندی ممکن نشد.");
      setHealthResults((current) => ({ ...current, [config.provider]: payload.health! }));
      onStatus(payload.health.status === "configured" ? "saved" : "error", payload.health.message);
    } catch (error) { onStatus("error", error instanceof Error ? error.message : "بررسی پیکربندی ممکن نشد."); }
    finally { setBusy(false); }
  }

  async function removeProvider(config: AdminPaymentProvider) {
    if (busy || config.enabled) return;
    const confirmed = window.confirm(
      `درگاه «${config.label}» از تنظیمات فروشگاه حذف شود؟\nاین عملیات اتصال خود Provider را از سیستم MIRAN حذف نمی‌کند و بعداً می‌توان آن را دوباره اضافه کرد.`,
    );
    if (!confirmed) return;
    setBusy(true); onStatus("saving", "");
    try {
      const response = await fetch("/api/admin/payment-providers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: config.provider }),
      });
      const payload = await response.json() as Payload;
      if (!response.ok || payload.removed !== true || payload.provider !== config.provider) {
        throw new Error(payload.error || "حذف امن درگاه ممکن نشد.");
      }
      setProviders((current) => current.map((item) => item.provider === config.provider
        ? {
            ...item,
            added: false,
            enabled: false,
            sandbox: false,
            configured: false,
            available: false,
            credentialHints: {},
            priority: 100,
            updatedAt: "",
            configurationSource: "none",
            configurationError: "missing",
          }
        : item));
      setHealthResults((current) => {
        const next = { ...current };
        delete next[config.provider];
        return next;
      });
      if (editor?.provider === config.provider) setEditor(null);
      onStatus("saved", "درگاه از فهرست تنظیمات حذف شد.");
    } catch (error) {
      onStatus("error", error instanceof Error ? error.message : "حذف امن درگاه ممکن نشد.");
    } finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-label="درگاه‌های پرداخت" aria-busy={loading || busy}>
    <div className={styles.toolbar}>
      <h1 className={styles.visuallyHidden}>درگاه‌های پرداخت</h1>
      <strong>درگاه‌های تعریف‌شده</strong>
      <button type="button" disabled={loading || busy || Boolean(loadError)} onClick={() => { setFieldError(""); setEditor({ mode: "add", provider: "" }); }}>+ افزودن درگاه</button>
    </div>
    {loading ? <p role="status">در حال خواندن درگاه‌ها…</p> : loadError ? <p role="alert">{loadError}</p> : added.length === 0 ? <p>هنوز درگاهی تعریف نشده است.</p> : null}
    <div className={styles.content} data-editing={Boolean(editor)}>
      <div className={styles.list}>
        {added.map((config) => <article className={styles.provider} key={config.provider}>
          <div className={styles.providerHeading}><h2>{config.label}</h2><span data-active={config.available}>{providerStatus(config)}</span></div>
          <dl className={styles.facts}>
            <div><dt>اتصال</dt><dd>{config.integrated ? "پیاده‌سازی‌شده" : "پیاده‌سازی نشده"}</dd></div>
            <div><dt>اطلاعات پذیرنده</dt><dd>{config.configured ? "معتبر و قابل خواندن" : config.configurationError === "unreadable" ? "خطای رمزگشایی" : "تکمیل نشده"}</dd></div>
            <div><dt>حالت</dt><dd>{config.sandbox ? "آزمایشی؛ بدون پرداخت واقعی" : "عملیاتی"}</dd></div>
            <div><dt>اولویت نمایش</dt><dd>{config.priority.toLocaleString("fa-IR")}</dd></div>
            {config.updatedAt ? <div><dt>آخرین تغییر</dt><dd>{formatCalendarDateTime(config.updatedAt, calendarMode)}</dd></div> : null}
          </dl>
          {Object.entries(config.credentialHints).map(([name, hint]) => <p className={styles.hint} key={name}><span>{paymentProviderCatalog.find((item) => item.id === config.provider)?.credentialSchema.fields.find((field) => field.name === name)?.label}</span> <bdi>{hint}</bdi></p>)}
          <div className={styles.actions}>
            {config.integrated ? <>
              <button type="button" disabled={busy} onClick={() => { setFieldError(""); setEditor({ mode: "update", provider: config.provider }); }}>ویرایش</button>
              <button type="button" disabled={busy} onClick={() => void checkHealth(config)}>بررسی پیکربندی</button>
              <button type="button" disabled={busy || (!config.enabled && (!config.configured || !config.encryptionReady))} onClick={() => void toggle(config)}>{config.enabled ? "غیرفعال‌سازی" : "فعال‌سازی"}</button>
            </> : <span className={styles.notIntegrated}>اتصال هنوز آماده نیست</span>}
            <button className={styles.removeButton} type="button" disabled={busy || config.enabled} onClick={() => void removeProvider(config)}>حذف از فهرست</button>
          </div>
          {healthResults[config.provider] ? <p className={styles.health}><strong>نتیجهٔ بررسی پیکربندی: </strong>{healthResults[config.provider].message}</p> : null}
        </article>)}
      </div>
      {editor ? <div className={styles.editor}>
        <label className={styles.providerSelect}>ارائه‌دهندهٔ پرداخت
          <select value={editor.provider} disabled={busy || editor.mode === "update"} onChange={(event) => { setFieldError(""); setEditor({ ...editor, provider: event.target.value }); }}>
            <option value="">ابتدا درگاه را انتخاب کنید</option>
            {paymentProviderCatalog.filter((item) => item.id === editor.provider || !providers.some((provider) => provider.provider === item.id && provider.added)).map((item) => <option value={item.id} key={item.id} disabled={item.integration === "not-integrated"}>{item.label}{item.integration === "not-integrated" ? " — اتصال هنوز آماده نیست" : ""}</option>)}
          </select>
        </label>
        {definition ? <CredentialForm key={definition.id + editor.mode} definition={definition} config={selected} busy={busy} fieldError={fieldError} onFieldChange={(field) => { if (fieldError === field) setFieldError(""); }} onSubmit={save} /> : null}
        <button type="button" disabled={busy} onClick={() => { setEditor(null); setFieldError(""); }}>بستن ویرایش</button>
      </div> : null}
    </div>
    <p className={styles.note}>درگاه، ارائه‌دهندهٔ خدمات پرداخت است؛ نام آن به معنای الزام استفاده از کارت همان بانک نیست. کارت‌به‌کارت از تنظیمات فروشگاه مستقل مدیریت می‌شود.</p>
  </section>;
}

function providerStatus(config: AdminPaymentProvider) {
  if (!config.integrated) return "اتصال آماده نیست";
  if (!config.configured) return "پیکربندی ناقص";
  return config.enabled ? "فعال برای درخواست جدید" : "غیرفعال";
}

function CredentialForm({ definition, config, busy, fieldError, onFieldChange, onSubmit }: {
  definition: PaymentProviderDefinition; config?: AdminPaymentProvider; busy: boolean; fieldError: string;
  onFieldChange: (field: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <form onSubmit={onSubmit} className={styles.form}>
    <fieldset disabled={busy}>
      <legend>{definition.label}</legend>
      {!definition.credentialSchema.verified ? <p>اتصال این درگاه هنوز آماده نیست و تا زمان پیاده‌سازی Adapter رسمی قابل ذخیره یا فعال‌سازی نیست.</p> : null}
      {definition.credentialSchema.fields.map((field) => <label key={field.name}>{field.label}
        <input name={field.name} type={field.type} dir="ltr" autoComplete={field.secret ? "new-password" : "off"} maxLength={field.maxLength}
          required={field.required && !config?.configured} aria-invalid={fieldError === field.name ? true : undefined}
          placeholder={config?.credentialHints[field.name] || ""} onChange={() => onFieldChange(field.name)} />
        {config?.credentialHints[field.name] ? <small>خالی بگذارید تا مقدار قبلی حفظ شود.</small> : null}
      </label>)}
      <label>اولویت نمایش (عدد کوچک‌تر ابتدا)
        <input name="priority" type="number" min="0" max="999" step="1" required defaultValue={config?.priority ?? 100}
          aria-invalid={fieldError === "priority" ? true : undefined} onChange={() => onFieldChange("priority")} />
      </label>
      {definition.supportsSandbox ? <label className={styles.checkbox}><input name="sandbox" type="checkbox" defaultChecked={config?.sandbox} /> حالت آزمایشی رسمی</label> : null}
      <button type="submit" disabled={busy || config?.encryptionReady === false}>{busy ? "در حال ذخیره…" : "ذخیره امن"}</button>
      {config?.encryptionReady === false ? <p>کلید رمزگذاری سرور آماده نیست؛ ذخیره اطلاعات پذیرنده متوقف است.</p> : null}
    </fieldset>
  </form>;
}
