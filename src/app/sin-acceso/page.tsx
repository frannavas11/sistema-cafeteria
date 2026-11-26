import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions/sign-in";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <h1 className="font-wide text-title font-bold">Esta sección no es para tu usuario</h1>
      <p className="mt-4 text-muted-foreground">
        Tu cuenta no tiene permiso para entrar acá. Si deberías tenerlo, pedile al administrador de
        la cafetería que revise tu rol en Staff.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin" className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
          Ir a mis cafeterías
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 px-4" })}
          >
            Entrar con otra cuenta
          </button>
        </form>
      </div>
    </main>
  );
}
