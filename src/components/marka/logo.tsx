import { MARKA_ADI } from "@/lib/marka";
import { cn } from "@/lib/utils";

// Isaret currentColor kullaniyor: rengi kapsayici belirliyor, bilesen renk
// karari vermiyor. Boylece koyu temada, e-posta basliginda ve favicon'da ayni
// dosya calisiyor.
//
// Bicim: takvim cercevesi icinde tek bir dolu hucre - secilmis bir saat.
// 16 piksellik favicon boyutunda da okunacak sekilde kalin tutuldu.
export function MarkaIsareti({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      <rect
        x="2.75"
        y="4.75"
        width="18.5"
        height="16.5"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M2.75 10h18.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 2.5v4M16 2.5v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="6.5" y="13" width="6.5" height="4.75" rx="1.75" fill="currentColor" />
    </svg>
  );
}

/// Isaret + kelime. Marka adi netlestiginde yalnizca burasi ve
/// src/lib/marka.ts degisir.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <MarkaIsareti className="size-6 text-primary" />
      <span className="font-heading text-lg font-semibold tracking-tight">
        {MARKA_ADI}
      </span>
    </span>
  );
}
