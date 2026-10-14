import ApiForm from "@/components/ApiForm";
export default function Register() {
  return (<div className="card"><h1>Create account</h1>
    <ApiForm action="/api/auth/register" redirectTo="/">
      <label>Name<input name="name" required maxLength={80} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password (min 8)<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
      <div className="row"><label>City<input name="city" /></label><label>ZIP<input name="zip" inputMode="numeric" pattern="\d{5}" /></label></div>
      <button>Register</button>
    </ApiForm></div>);
}
