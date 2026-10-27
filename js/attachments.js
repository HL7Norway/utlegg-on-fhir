// Merges the generated form page with user-selected attachments (PDFs and images) using pdf-lib.
// PDFs are appended page by page; each image is placed on its own blank portrait A4 page.
(function () {
  const A4 = [595.28, 841.89];
  const PAGE_MARGIN = 36;
  const MAX_IMAGE_SIDE = 2000;
  const JPEG_QUALITY = 0.85;

  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const isImage = (f) => f.type.startsWith('image/');

  async function loadPdf(file) {
    try {
      return await PDFLib.PDFDocument.load(await file.arrayBuffer());
    } catch (e) {
      throw new Error(`Could not read "${file.name}" (the PDF may be damaged or password protected).`);
    }
  }

  // Draws the image to a canvas (applies EXIF orientation, converts any browser-supported format) and returns JPEG bytes.
  async function imageToJpeg(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      throw new Error(`Could not read "${file.name}" as an image (unsupported format).`);
    }
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // flatten transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  }

  // Number of pages the files will add: page count for PDFs, 1 for images.
  async function countPages(files) {
    let total = 0;
    for (const f of files) {
      if (isPdf(f)) total += (await loadPdf(f)).getPageCount();
      else if (isImage(f)) total += 1;
      else throw new Error(`"${f.name}" is neither a PDF nor an image.`);
    }
    return total;
  }

  // Returns the merged PDF as bytes: form first, then the attachments in order.
  async function merge(formBytes, files) {
    const out = await PDFLib.PDFDocument.load(formBytes);
    for (const f of files) {
      if (isPdf(f)) {
        const src = await loadPdf(f);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else {
        const img = await imageToJpeg(f);
        const embedded = await out.embedJpg(img.bytes);
        const page = out.addPage(A4);
        const fit = Math.min((A4[0] - 2 * PAGE_MARGIN) / img.width, (A4[1] - 2 * PAGE_MARGIN) / img.height);
        const w = img.width * fit;
        const h = img.height * fit;
        page.drawImage(embedded, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
      }
    }
    return out.save();
  }

  window.Attachments = { countPages, merge };
})();
