import { updateProfile } from "@/services/auth";
import { readBody, requireUser, route } from "@/services/http";
export const GET = route(async (req) => ({ user: requireUser(req) }));
export const PATCH = route(async (req) => ({ user: updateProfile(requireUser(req), await readBody(req)) }));
export const POST = PATCH;
