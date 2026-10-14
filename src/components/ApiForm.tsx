"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/** Submits a form to a JSON API route with fetch; shows errors; redirects or refreshes on success. */
export default function ApiForm({ action, method = "POST", redirectTo, children, className, confirm: confirmMsg, resetOnSuccess, clearCaches }: {
  action: string; method?: string; redirectTo?: string; children: ReactNode; className?: string; confirm?: string; resetOnSuccess?: boolean; clearCaches?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    const form = e.currentTarget;
    setBusy(true); setError(null);
    try {
      const res = await fetch(action, { method, body: new FormData(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Request failed (${res.status})`); return; }
      if (resetOnSuccess) form.reset();
      if (clearCaches && "caches" in window) {
        // Drop service-worker page caches so the next user on this device can't see this session's pages offline.
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      }
      if (redirectTo) {
        const id = data.listing?.id ?? data.order?.id ?? data.offer?.id ?? "";
        router.push(redirectTo.replace("{id}", String(id)));
      }
      router.refresh();
    } catch {
      setError("Network error — are you offline?");
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={onSubmit} className={className} aria-busy={busy}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>{children}</fieldset>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}
