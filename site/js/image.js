// Сжатие фото в браузере перед загрузкой: длинная сторона до 1600px, WebP (или JPEG)
export async function compressImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Можно загружать только изображения');
  if (file.size > 30 * 1024 * 1024) throw new Error('Файл больше 30 МБ');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await loadViaImg(file); }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  if (blob.size > 5 * 1024 * 1024) blob = await toBlob(canvas, 'image/jpeg', 0.7);
  if (blob.size > 5 * 1024 * 1024) throw new Error('Фото слишком большое даже после сжатия');
  return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'jpg', width: w, height: h };
}
function toBlob(canvas, type, q) { return new Promise((r) => canvas.toBlob(r, type, q)); }
function loadViaImg(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Не удалось прочитать фото'));
    img.src = URL.createObjectURL(file);
  });
}
