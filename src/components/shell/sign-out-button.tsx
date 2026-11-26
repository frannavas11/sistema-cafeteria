import { LogOut } from "lucide-react";
import { signOut } from "@/features/auth/actions/sign-in";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={cn(
          "inline-flex min-h-tap items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-sidebar-accent/60",
          className,
        )}
      >
        <LogOut className="size-4" aria-hidden />
        Salir
      </button>
    </form>
  );
}
