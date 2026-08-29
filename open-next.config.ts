import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Incremental cache (R2/KV) bilerek bagli degil: bu uygulamanin sayfalari
// agirlikli olarak dinamik (panel, randevu akisi, musaitlik). Statik olan tek
// sey acilis sayfasi ve o zaten build'de prerender ediliyor. ISR ihtiyaci
// dogdugunda buraya r2IncrementalCache eklenir.
export default defineCloudflareConfig({});
