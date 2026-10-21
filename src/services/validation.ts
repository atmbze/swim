import { z } from "zod";
import { CATEGORIES, CONDITIONS } from "./constants";

const zip = z.string().trim().regex(/^(\d{5})?$/, "ZIP must be 5 digits").default("");
const dollars = z.coerce.number().positive("Must be > 0").max(1_000_000).transform((d) => Math.round(d * 100));

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().max(80).default(""),
  zip,
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().max(80).optional(),
  zip: z.string().trim().regex(/^(\d{5})?$/, "ZIP must be 5 digits").optional(),
  bio: z.string().trim().max(1000).optional(),
});
export const listingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  price: dollars,
  category: z.enum(CATEGORIES),
  condition: z.enum(CONDITIONS),
  quantity: z.coerce.number().int().min(0).max(10000),
  city: z.string().trim().max(80).default(""),
  zip,
});
export const listingUpdateSchema = listingSchema.partial();
export const offerSchema = z.object({ listingId: z.coerce.number().int().positive(), amount: dollars, quantity: z.coerce.number().int().min(1).max(10000).default(1) });
export const orderSchema = z.union([
  z.object({ offerId: z.coerce.number().int().positive() }),
  z.object({ listingId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(10000).default(1), promoCode: z.string().trim().max(40).optional() }),
]);
export const messageSchema = z.object({ recipientId: z.coerce.number().int().positive(), listingId: z.coerce.number().int().positive().optional(), body: z.string().trim().min(1).max(2000) });
export const buybackSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(3000),
  condition: z.enum(CONDITIONS),
  asking: z.union([z.literal("").transform(() => undefined), dollars]).optional(),
});
export const promoSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, "Code: 3-20 chars A-Z 0-9 _ -"),
  title: z.string().trim().min(1).max(120),
  percentOff: z.coerce.number().int().min(1).max(90),
  listingId: z.union([z.literal("").transform(() => undefined), z.coerce.number().int().positive()]).optional(),
  category: z.union([z.literal("").transform(() => undefined), z.enum(CATEGORIES)]).optional(),
  maxUses: z.union([z.literal("").transform(() => undefined), z.coerce.number().int().positive()]).optional(),
  /** Uses per buyer; default 1; 0 = unlimited. */
  perUserLimit: z.union([z.literal("").transform(() => 1), z.coerce.number().int().min(0).max(1000)]).default(1),
  expiresAt: z.union([z.literal("").transform(() => undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});
