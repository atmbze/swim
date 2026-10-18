"use client";
import ApiForm from "./ApiForm";

/** Logout button that also tells the service worker to drop cached pages,
 * so a signed-out user on a shared device never sees cached session HTML. */
export default function LogoutForm() {
  return (
    <ApiForm
      action="/api/auth/logout"
      redirectTo="/"
      className="inline"
      onSuccess={() => {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready
            .then((reg) => reg.active?.postMessage({ type: "CLEAR_PAGE_CACHE" }))
            .catch(() => {});
        }
      }}
    >
      <button className="link">Logout</button>
    </ApiForm>
  );
}
