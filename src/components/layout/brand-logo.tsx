import Image from "next/image";
import logoArt from "@/Public/Logo/Logo.png";

/**
 * ITech Case BD brand mark — the official logo artwork.
 *
 * The source image is portrait (732×1133), so it is fitted with
 * `object-contain` inside the square slots the layout provides; the mark never
 * stretches or crops. Default callers size it via `className` (h-7 w-7, etc.).
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src={logoArt}
      alt="ITech Case BD logo"
      sizes="48px"
      className={className}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
