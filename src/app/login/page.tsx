import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import { Wordmark } from "@/components/shell/wordmark";
import { isSafeNext } from "@/lib/auth/safe-next";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Wordmark className="text-[2rem]" />
        <div className="max-w-md">
          <p className="font-wide text-title font-bold">
            Del mostrador a la puerta, sin perder un pedido.
          </p>
          <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-sidebar-foreground/70">
            Recepción, POS y delivery de tu cafetería en un solo lugar.
          </p>
        </div>
        <RoastStrip />
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Wordmark className="text-[1.75rem] lg:hidden" />
          <h1 className="mt-10 text-heading font-bold lg:mt-0">Entrá a tu cafetería</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Usá el email con el que te invitó el administrador.
          </p>
          <div className="mt-8">
            <Suspense fallback={<LoginForm />}>
              <LoginWithNext searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}

async function LoginWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && isSafeNext(raw) ? raw : undefined;
  return <LoginForm next={next} />;
}

/** Las cinco etapas de tueste, como franja de cierre del panel. */
function RoastStrip() {
  return (
    <div aria-hidden className="flex h-1.5 gap-1">
      {["bg-roast-0", "bg-roast-1", "bg-roast-2", "bg-roast-3", "bg-roast-4"].map((c) => (
        <span key={c} className={`flex-1 rounded-full ${c}`} />
      ))}
    </div>
  );
}
