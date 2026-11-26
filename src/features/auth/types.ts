import { z } from "zod";
import { isSafeNext } from "@/lib/auth/safe-next";

export const signInSchema = z.object({
  email: z.email("Ingresá un email válido").max(254),
  password: z.string().min(8, "La contraseña tiene al menos 8 caracteres").max(72),
  // Un `next` inválido se descarta sin bloquear el login.
  next: z.string().max(512).refine(isSafeNext).optional().catch(undefined),
});

export type SignInState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  email?: string;
};
