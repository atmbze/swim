import { CATEGORIES, CONDITIONS } from "@/services/constants";
import type { Listing } from "@/services/types";
export default function ListingFields({ l }: { l?: Listing }) {
  return (<>
    <label>Title<input name="title" required minLength={3} maxLength={120} defaultValue={l?.title} /></label>
    <label>Description<textarea name="description" required maxLength={5000} defaultValue={l?.description} /></label>
    <div className="row">
      <label>Price ($)<input name="price" type="number" step="0.01" min="0.01" required defaultValue={l ? l.price_cents / 100 : undefined} /></label>
      <label>Quantity<input name="quantity" type="number" min="0" required defaultValue={l?.quantity ?? 1} /></label>
    </div>
    <div className="row">
      <label>Category<select name="category" defaultValue={l?.category}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Condition<select name="condition" defaultValue={l?.condition}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
    </div>
    <div className="row">
      <label>City<input name="city" maxLength={80} defaultValue={l?.city} /></label>
      <label>ZIP<input name="zip" inputMode="numeric" pattern="\d{5}" defaultValue={l?.zip} /></label>
    </div>
    <label>Image (JPEG/PNG/WebP, max 2 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
  </>);
}
