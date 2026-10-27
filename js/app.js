(function () {
  const editor = CodeMirror.fromTextArea(document.getElementById('claim-json'), {
    mode: { name: 'javascript', json: true }, lineNumbers: true, lineWrapping: true,
  });
  const errorBox = document.getElementById('error');
  const preview = document.getElementById('preview');
  const select = document.getElementById('source-select');
  const examples = [{ label: 'Claim template', file: 'data/claim-template.json' }];
  let logo;

  function showError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('d-none', !msg);
  }

  async function loadLogo() {
    if (logo !== undefined) return logo;
    try {
      const blob = await (await fetch('hl7-norge-logo.jpg')).blob();
      logo = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(blob);
      });
    } catch (e) { logo = null; }
    return logo;
  }

  const FORM_PAGES = 1;
  const fileInput = document.getElementById('attachments');
  const fileList = document.getElementById('attachment-list');
  let attachments = [];

  function renderAttachments() {
    fileList.replaceChildren();
    attachments.forEach((file, i) => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center gap-2 px-0 py-1';
      const name = document.createElement('span');
      name.className = 'flex-grow-1 text-truncate small';
      name.textContent = file.name;
      li.append(name);
      [['\u2191', -1], ['\u2193', 1]].forEach(([label, delta]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-secondary btn-sm py-0';
        btn.textContent = label;
        btn.setAttribute('aria-label', delta < 0 ? 'Move up' : 'Move down');
        btn.disabled = i + delta < 0 || i + delta >= attachments.length;
        btn.addEventListener('click', () => {
          [attachments[i], attachments[i + delta]] = [attachments[i + delta], attachments[i]];
          renderAttachments();
        });
        li.append(btn);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-outline-danger btn-sm py-0';
      remove.textContent = '\u00d7';
      remove.setAttribute('aria-label', 'Remove');
      remove.addEventListener('click', () => {
        attachments.splice(i, 1);
        renderAttachments();
      });
      li.append(remove);
      fileList.append(li);
    });
  }

  fileInput.addEventListener('change', () => {
    attachments = attachments.concat(Array.from(fileInput.files));
    fileInput.value = '';
    renderAttachments();
  });

  const getPdfBlob = (pdf) => new Promise((res) => pdf.getBlob(res));

  // Builds the form (with the total page count), then appends the attachments. Returns a Blob or null on error.
  async function makePdf() {
    showError('');
    try {
      const claim = JSON.parse(editor.getValue());
      const totalPages = FORM_PAGES + await Attachments.countPages(attachments);
      const form = pdfMake.createPdf(ClaimPdf.buildDocDefinition(claim, await loadLogo(), totalPages));
      const formBytes = await (await getPdfBlob(form)).arrayBuffer();
      const merged = await Attachments.merge(formBytes, attachments);
      return new Blob([merged], { type: 'application/pdf' });
    } catch (e) {
      showError(e.message);
      return null;
    }
  }

  document.getElementById('generate').addEventListener('click', async () => {
    const blob = await makePdf();
    if (blob) preview.src = URL.createObjectURL(blob);
  });
  document.getElementById('download').addEventListener('click', async () => {
    const blob = await makePdf();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'utlegg.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  async function loadExample(i) {
    try {
      editor.setValue(await (await fetch(examples[i].file)).text());
    } catch (e) { showError('Could not load example: ' + e.message); }
  }
  examples.forEach((ex, i) => select.add(new Option(ex.label, i)));
  select.addEventListener('change', () => loadExample(+select.value));
  loadExample(0);
})();
