import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Foto de producto. Las ilustraciones locales (.svg de /public/mock) se sirven tal cual;
 * las fotos de Storage pasan por el optimizador de Next.
 */
export function ProductImage({
  src,
  sizes,
  priority,
  className,
}: {
  src: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={src.endsWith(".svg")}
      className={cn("object-cover", className)}
    />
  );
}
