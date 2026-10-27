// Builds a pdfmake A4 document ("Utleggsskjema – refundering") from a FHIR R4 Claim.
// The layout is being rebuilt step by step.
(function () {
  const ORG_NUMBER_SYSTEM = 'urn:oid:2.16.578.1.12.4.1.4.101';
  const BASE_FONT_SIZE = 11;
  const LABEL_WIDTH = 100;
  const ACCOUNT_LABEL_WIDTH = 180;
  const TABLE_COL_NR_WIDTH = '10%';
  const TABLE_COL_DESCRIPTION_WIDTH = '50%';
  const TABLE_COL_AMOUNT_WIDTH = '20%';
  const TABLE_COL_COVERED_WIDTH = '20%';
  const TABLE_WIDTHS = [TABLE_COL_NR_WIDTH, TABLE_COL_DESCRIPTION_WIDTH, TABLE_COL_AMOUNT_WIDTH, TABLE_COL_COVERED_WIDTH];
  const TABLE_HEADERS = ['Nr', 'Beskrivelse', 'Sum bilag', 'Sum dekkes'];
  const MIN_TABLE_ROWS = 10;
  const ADMIN_TABLE_HEADERS = ['', 'Skjema mottatt', 'Utbetaling godkj.', 'Refundert', 'Arkivert'];
  const ADMIN_TABLE_ROW_LABELS = ['Dato:', 'Av person:', 'Kommentar:'];
  const ADMIN_TABLE_WIDTHS = ['20%', '20%', '20%', '20%', '20%'];
  const TEXT_LINE_HEIGHT = BASE_FONT_SIZE * 1.2;
  // A4 is 595.28pt wide; with 72pt margins the content width is 451.28pt, so 33% is about 149pt.
  const SIGNATURE_LINE_WIDTH = Math.round((595.28 - 2 * 72) * 0.33);
  const ROW_WIDTHS = ['67%', '33%'];

  function resolveContained(claim, ref) {
    if (!ref || !ref.reference || !ref.reference.startsWith('#')) return null;
    return (claim.contained || []).find((r) => r.id === ref.reference.slice(1)) || null;
  }

  // address.line items, then "postalCode city".
  function addressLines(resource) {
    const address = ((resource && resource.address) || [])[0];
    if (!address) return [];
    return [...(address.line || []), [address.postalCode, address.city].filter(Boolean).join(' ')].filter(Boolean);
  }

  // Practitioner/Person name is a HumanName array: prefer text, else given + family.
  function humanName(resource) {
    const n = resource && resource.name && resource.name[0];
    if (!n) return '';
    return n.text || [...(n.given || []), n.family].filter(Boolean).join(' ');
  }

  // Name on the first line, then the address lines.
  function senderText(claim) {
    const sender = resolveContained(claim, claim.provider);
    return [humanName(sender), ...addressLines(sender)].filter(Boolean).join('\n');
  }

  // Name, address lines, "postalCode city" and "Org# <value>" (when the identifier is present).
  function organizationBlock(org) {
    if (!org) return { text: '' };
    const lines = addressLines(org);
    const orgNumber = (org.identifier || []).find((i) => i.system === ORG_NUMBER_SYSTEM);
    if (orgNumber) lines.push('Org# ' + orgNumber.value);
    return {
      stack: [
        { text: org.name || '', bold: true, fontSize: BASE_FONT_SIZE * 1.5 },
        { text: lines.filter(Boolean).join('\n') },
      ],
    };
  }

  function buildHeader(claim, logoDataUrl) {
    const org = resolveContained(claim, claim.insurer);
    return {
      columns: [
        Object.assign({ width: '*' }, organizationBlock(org)),
        logoDataUrl ? { width: 90, image: logoDataUrl } : { width: 90, text: '' },
      ],
      columnGap: 10,
    };
  }

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || '';
  }

  // A block: label on the left, value on the right, both top-aligned.
  // The value is either plain text or a pdfmake text node (e.g. { text, bold: true }).
  function labelValueBlock(label, value, width, labelWidth = LABEL_WIDTH) {
    const valueNode = value && typeof value === 'object' ? value : { text: value || '' };
    return {
      width,
      columns: [
        { width: labelWidth, text: label },
        Object.assign({ width: '*' }, valueNode),
      ],
      columnGap: 6,
    };
  }

  // A row of two blocks sharing the width by the given percentages.
  function blockRow(left, right, widths = ROW_WIDTHS) {
    return {
      columns: [labelValueBlock(...left, widths[0]), labelValueBlock(...right, widths[1])],
      columnGap: 12,
      margin: [0, 10, 0, 0],
    };
  }

  // A single full-width block.
  function singleBlockRow(block) {
    return { columns: [labelValueBlock(...block, '*', ACCOUNT_LABEL_WIDTH)], margin: [0, 10, 0, 0] };
  }

  // Identifier of the contained Account whose subject is the sender (Account.subject is an array in R4; a single reference is also accepted).
  function accountNumber(claim) {
    const senderRef = claim.provider && claim.provider.reference;
    const account = (claim.contained || []).find((r) => r.resourceType === 'Account'
      && [].concat(r.subject || []).some((s) => s.reference === senderRef));
    return (account && account.identifier && account.identifier[0] && account.identifier[0].value) || '';
  }

  const COVERED_EXTENSION_URL = 'http://example.org/covered';

  function formatMoney(money) {
    if (!money || money.value == null) return '';
    return [money.value, money.currency].filter((p) => p != null && p !== '').join(' ');
  }

  function coveredAmount(item) {
    const ext = (item.extension || []).find((e) => e.url === COVERED_EXTENSION_URL);
    return ext ? ext.valueMoney : null;
  }

  function itemRow(item) {
    return [
      { text: item.sequence != null ? String(item.sequence) : '' },
      { text: (item.productOrService && item.productOrService.text) || '' },
      { text: formatMoney(item.net), alignment: 'right' },
      { text: formatMoney(coveredAmount(item)), alignment: 'right' },
    ];
  }

  // Items table: header row plus one row per Claim.item, padded with empty numbered rows up to MIN_TABLE_ROWS.
  function itemsTable(claim) {
    const rows = (claim.item || []).map(itemRow);
    while (rows.length < MIN_TABLE_ROWS) rows.push([{ text: String(rows.length + 1) }, { text: '' }, { text: '' }, { text: '' }]);
    const total = claim.total || {};
    rows.push([
      { text: '' },
      { text: 'Totalsum som dekkes:', bold: true },
      { text: formatMoney(total), bold: true, alignment: 'right' },
      { text: formatMoney(coveredAmount(total)), bold: true, alignment: 'right' },
    ]);
    return {
      table: {
        headerRows: 1,
        widths: TABLE_WIDTHS,
        body: [
          TABLE_HEADERS.map((t, i) => ({ text: t, bold: true, alignment: i >= 2 ? 'right' : 'left' })),
          ...rows,
        ],
      },
      margin: [0, 20, 0, 0],
    };
  }

  // "Signatur avsender:" followed by a horizontal line, one line of margin above.
  function signatureLine() {
    const lineY = BASE_FONT_SIZE;
    return {
      columns: [
        { width: 'auto', text: 'Signatur avsender:' },
        {
          width: SIGNATURE_LINE_WIDTH,
          canvas: [{ type: 'line', x1: 0, y1: lineY, x2: SIGNATURE_LINE_WIDTH, y2: lineY, lineWidth: 0.75 }],
        },
      ],
      columnGap: 6,
      margin: [0, TEXT_LINE_HEIGHT, 0, 0],
    };
  }

  // "Sted: <valueString> Dato: <timingDate>" from the supportingInfo with category text "signed".
  function placeAndDateLine(claim) {
    const infos = claim.supportingInfo || [];
    const signed = infos.find((s) => s.category && s.category.text === 'signed') || infos[0] || {};
    return {
      text: `Sted: ${signed.valueString || ''}   Dato: ${formatDate(signed.timingDate)}`,
      margin: [0, TEXT_LINE_HEIGHT / 2, 0, TEXT_LINE_HEIGHT * 2],
    };
  }

  // Static administration table filled in by HL7 Norge: 5 equal columns, 4 rows.
  function adminTable() {
    const empty = () => ({ text: '' });
    const labelRow = (label) => [{ text: label }, empty(), empty(), empty(), empty()];
    return {
      table: {
        headerRows: 1,
        widths: ADMIN_TABLE_WIDTHS,
        body: [
          ADMIN_TABLE_HEADERS.map((t) => ({ text: t, bold: true })),
          ...ADMIN_TABLE_ROW_LABELS.map(labelRow),
        ],
      },
    };
  }

  // totalPages: form pages plus attachment pages, shown as "Ant.sider (inkl kvitt)".
  function buildDocDefinition(claim, logoDataUrl, totalPages = 1) {
    if (!claim || claim.resourceType !== 'Claim') throw new Error('Resource is not a FHIR Claim (resourceType must be "Claim").');
    return {
      pageSize: 'A4',
      pageMargins: [72, 72, 72, 72],
      defaultStyle: { fontSize: BASE_FONT_SIZE },
      info: { title: 'Utleggsskjema – refundering', author: 'HL7 Norge' },
      footer: { text: 'Sensitivity: Internal', alignment: 'left', color: '#808080', margin: [72, 0, 72, 0] },
      content: [
        buildHeader(claim, logoDataUrl),
        { text: 'Utleggsskjema – refundering', bold: true, fontSize: 20, margin: [0, 20, 0, 0] },
        blockRow(
          ['Prosjekt/aktivitet', claim.patient && claim.patient.display],
          ['Dato for utlegg', formatDate(claim.created)],
        ),
        blockRow(
          ['Avsender/person:', senderText(claim)],
          ['Ant.sider (inkl kvitt):', String(totalPages)],
        ),
        singleBlockRow(['Kontonummer for tilbakebetaling:', { text: accountNumber(claim), bold: true }]),
        itemsTable(claim),
        signatureLine(),
        placeAndDateLine(claim),
        adminTable(),
      ],
    };
  }

  window.ClaimPdf = { buildDocDefinition };
})();
