import type { Metadata, Viewport } from "next";
import Link from "next/link";
import SWRegister from "@/components/SWRegister";
import LogoutForm from "@/components/LogoutForm";
import { pageUser } from "@/services/page-auth";
import "./globals.css";

export const metadata: Metadata = { title: "SOWESTIM — South West Item Mart", description: "Buy, sell and get buyback quotes across the Southwest.", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#c2410c", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <header className="top">
          <Link href="/" className="brand">SOWESTIM</Link>
          <nav aria-label="Main">
            <Link href="/deals">Deal Den</Link>
            <Link href="/buyback">BuyBacker</Link>
            {user ? (<>
              <Link href="/listings/new">Sell</Link>
              <Link href="/messages">Messages</Link>
              <Link href="/orders">Orders</Link>
              <Link href="/offers">Offers</Link>
              <Link href="/profile">{user.name}</Link>
              {user.role === "admin" && <Link href="/admin">Admin</Link>}
              <LogoutForm />
            </>) : (<><Link href="/login">Login</Link><Link href="/register">Register</Link></>)}
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer><small>South West Item Mart LLC · MVP demo · payments are simulated</small></footer>
        <SWRegister />
      </body>
    </html>
  );
}
