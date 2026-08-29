"use client";

import { ThemeProvider } from "next-themes";

// Sinif tabanli tema: globals.css'teki `.dark` varyanti bunu bekliyor.
// Sistem tercihi varsayilan - kullanici secmediyse isletim sistemine uyar.
export function TemaSaglayici({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
