# Utlegg on FHIR

Paste a FHIR R4 `Claim` (JSON) and generate a printable A4 refund form ("Utleggsskjema – refundering") for HL7 Norge,
entirely in the browser. Receipts (PDFs and images) can be attached and are appended after the form.
No build step; deployed to GitHub Pages by `.github/workflows/pages.yml`.

Run locally: `python3 -m http.server` and open http://localhost:8000.

## Libraries

All loaded from the jsDelivr CDN:

- [Bootstrap](https://getbootstrap.com) 5.3.3 – UI components
- [CodeMirror](https://codemirror.net) 5.65.16 – JSON editor
- [pdfmake](http://pdfmake.org) 0.2.12 – generates the form page
- [pdf-lib](https://pdf-lib.js.org) 1.17.1 – merges the form with attached PDFs and images

## Code

- `js/claim-pdf.js` – the form layout (pdfmake document definition built from the Claim)
- `js/attachments.js` – attachment handling (page counting, PDF merging, image to A4 page)
- `js/app.js` – editor, attachment list, preview and download

## Sample data

- `data/claim-template.json` – the Claim template loaded into the editor
