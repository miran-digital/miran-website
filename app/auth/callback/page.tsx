import { CustomerAuthForm } from "@/features/account/customer-auth-form";
export const dynamic = "force-dynamic";
export default function AuthCallbackPage() { return <main className="auth-callback-page"><section><h1>تأیید حساب میران</h1><CustomerAuthForm next="/account" callbackOnly /></section></main>; }
