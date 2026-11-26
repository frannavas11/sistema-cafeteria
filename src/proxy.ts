import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: `middleware.ts` pasó a llamarse `proxy.ts` (misma funcionalidad).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/login", "/admin/:path*", "/super-admin/:path*", "/driver/:path*"],
};
