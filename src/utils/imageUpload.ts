export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxDataUrlLength?: number;
  maxInputBytes?: number;
}

const DEFAULT_MAX_INPUT_BYTES = 12 * 1024 * 1024; // 12 MB raw camera photo
const DEFAULT_MAX_DATA_URL_LENGTH = 280_000; // Fits safely in encrypted localStorage & Postgres safeImageUrl

export function hasAttachedImage(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return true;
  if (/^https?:\/\/[^\s<>"]+$/i.test(trimmed)) return true;
  if (/^\/assets\/[a-z0-9._/-]+\.(png|jpe?g|webp|gif)$/i.test(trimmed) && !trimmed.includes('..')) return true;
  return false;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode image file.'));
    img.src = dataUrl;
  });
}

/**
 * Compresses and resizes a user-uploaded image file to a compact base64 Data URL
 * suitable for both encrypted browser storage and PostgreSQL sync (`safeImageUrl`).
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.82,
    maxDataUrlLength = DEFAULT_MAX_DATA_URL_LENGTH,
    maxInputBytes = DEFAULT_MAX_INPUT_BYTES
  } = options;

  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Palihug pagpili og tinuod nga hulagway (PNG, JPG, o WebP).');
  }
  if (file.size > maxInputBytes) {
    throw new Error('Sobra kadako ang hulagway. Kinahanglan ubos sa 12MB.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);

  // If running outside a browser canvas environment or already tiny, return as-is when safe.
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (rawDataUrl.length <= maxDataUrlLength) return rawDataUrl;
    throw new Error('Image is too large to store without compression.');
  }

  try {
    const img = await loadImageElement(rawDataUrl);
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth), maxHeight / (img.naturalHeight || maxHeight));
    const targetWidth = Math.max(1, Math.round((img.naturalWidth || maxWidth) * scale));
    const targetHeight = Math.max(1, Math.round((img.naturalHeight || maxHeight) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return rawDataUrl.length <= maxDataUrlLength ? rawDataUrl : rawDataUrl;
    }

    // Fill white background before drawing so transparent PNGs compress cleanly to JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const qualities = [quality, 0.7, 0.56, 0.45];
    let compressed = canvas.toDataURL('image/jpeg', qualities[0]);
    for (let i = 1; i < qualities.length && compressed.length > maxDataUrlLength; i++) {
      compressed = canvas.toDataURL('image/jpeg', qualities[i]);
    }

    // If the original file was already smaller than our JPEG re-encode and fits within cap, keep it.
    if (rawDataUrl.length < compressed.length && rawDataUrl.length <= maxDataUrlLength) {
      return rawDataUrl;
    }
    if (compressed.length > maxDataUrlLength) {
      // One more downscale pass for extremely detailed photos.
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = Math.max(1, Math.round(targetWidth * 0.65));
      smallCanvas.height = Math.max(1, Math.round(targetHeight * 0.65));
      const smallCtx = smallCanvas.getContext('2d');
      if (smallCtx) {
        smallCtx.fillStyle = '#ffffff';
        smallCtx.fillRect(0, 0, smallCanvas.width, smallCanvas.height);
        smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
        compressed = smallCanvas.toDataURL('image/jpeg', 0.6);
      }
    }
    return compressed;
  } catch {
    if (rawDataUrl.length <= maxDataUrlLength) return rawDataUrl;
    throw new Error('Dili ma-process ang hulagway. Palihug sulayi og lain nga PNG o JPG.');
  }
}
