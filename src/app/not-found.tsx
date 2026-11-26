import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Wordmark className="text-xl" />
      <h1 className="mt-10 font-wide text-title font-bold">No encontramos esta página</h1>
      <p className="mt-4 text-muted-foreground">
        Si buscabas una cafetería, revisá que la dirección esté bien escrita. También puede haber
        cambiado de nombre o estar pausada.
      </p>
      <div className="mt-8">
        <Link href="/" className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
