"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSafeNext } from "@/lib/auth/safe-next";
import { signInSchema, type SignInState } from "../types";

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: SignInState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" || key === "password") fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, email: String(formData.get("email") ?? "") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Mensaje único: no revelamos si el email existe.
    return {
      error:
        "Email o contraseña incorrectos. Revisalos o pedile al administrador que te reenvíe la invitación.",
      email: parsed.data.email,
    };
  }

  const next = parsed.data.next;
  redirect(isSafeNext(next) ? next : "/admin"); // doble chequeo: el schema ya lo filtró
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
