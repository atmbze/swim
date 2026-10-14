import ApiForm from "@/components/ApiForm";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (<div className="card"><h1>Login</h1>
    <ApiForm action="/api/auth/login" redirectTo={dest}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button>Login</button>
    </ApiForm></div>);
}
