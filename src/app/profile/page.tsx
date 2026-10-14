import Link from "next/link";
import ApiForm from "@/components/ApiForm";
import { requirePageUser } from "@/services/page-auth";
export default async function Profile() {
  const u = await requirePageUser("/profile");
  return (<div className="card"><h1>Your profile</h1>
    <p className="muted">{u.email} · <Link href={`/sellers/${u.id}`}>View my storefront</Link></p>
    <ApiForm action="/api/me" method="PATCH">
      <label>Name<input name="name" defaultValue={u.name} required /></label>
      <div className="row"><label>City<input name="city" defaultValue={u.city} /></label><label>ZIP<input name="zip" defaultValue={u.zip} pattern="\d{5}" /></label></div>
      <label>Bio<textarea name="bio" defaultValue={u.bio} maxLength={1000} /></label>
      <button>Save</button>
    </ApiForm></div>);
}
