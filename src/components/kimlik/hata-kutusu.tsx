import { AlertCircleIcon } from "lucide-react";

// Sunucudan donen hatanin tek gosterim yeri.
//
// `role="alert"`: ekran okuyucu metni ODAK DEGISMEDEN duyuruyor. Formda hata
// olustugunda kullanicinin imleci hala sifre kutusunda; alert olmadan hicbir
// sey olmamis gibi gorunurdu.

export function HataKutusu({ mesaj, id }: { mesaj: string; id?: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mesaj}</span>
    </div>
  );
}
