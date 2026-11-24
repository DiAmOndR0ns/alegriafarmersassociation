/**
 * HTML-escaping and safe print-window helpers for generated print documents.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Allows only safe raster image URLs (https/http, local /assets/, or raster data URIs)
 * so print templates never render javascript: or SVG script payloads.
 */
export function safePrintImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  if (/^https?:\/\/[^\s<>"]+$/i.test(url)) return url;
  if (/^\/assets\/[a-z0-9._/-]+\.(png|jpe?g|webp|gif)$/i.test(url) && !url.includes('..')) return url;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  return null;
}

/**
 * Triggers printing from the opener window without injecting inline <script>
 * tags into the print document (compatible with strict CSP script-src 'self').
 */
export function triggerPrintWindow(printWindow: Window, waitForImages = false): void {
  const runPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // Ignore if user closed the preview tab before print fired.
    }
  };

  if (!waitForImages) {
    setTimeout(runPrint, 200);
    return;
  }

  const images = Array.from(printWindow.document.images || []);
  Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
    setTimeout(runPrint, 250);
  });
}
