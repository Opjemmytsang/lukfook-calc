(() => {
  'use strict';

  const width = 595;
  const height = 842;
  const margin = 40;
  const contentWidth = width - 2 * margin;
  const bottom = height - 58;
  const scale = 2;
  const fonts = '"PingFang HK", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
  const colors = { ink: '#29201f', muted: '#635652', wine: '#75233e', line: '#e5d9d6' };

  function canvasPage() {
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d', { alpha: false });
    context.scale(scale, scale);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.textBaseline = 'top';
    return { canvas, context };
  }

  function wrap(context, text) {
    return text.replace(/\r\n?/g, '\n').split('\n').flatMap((paragraph) => {
      const lines = [];
      let line = '';
      for (const character of paragraph) {
        if (line && context.measureText(line + character).width > contentWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
      lines.push(line);
      return lines;
    });
  }

  async function pageJpeg(canvas) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('JPEG export failed')), 'image/jpeg', 0.93);
    });
    canvas.width = 1;
    canvas.height = 1;
    return new Uint8Array(await blob.arrayBuffer());
  }

  // PDF pages contain JPEGs rendered with device fonts so Traditional Chinese needs no bundled font.
  function jpegPdf(images) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    function append(value) {
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      chunks.push(bytes);
      length += bytes.length;
    }
    function object(id, body, stream) {
      offsets[id] = length;
      append(`${id} 0 obj\n${body}\n`);
      if (stream) {
        append('stream\n');
        append(stream);
        append('\nendstream\n');
      }
      append('endobj\n');
    }

    append('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = images.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
    object(2, `<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`);
    images.forEach((image, index) => {
      const page = 3 + index * 3;
      object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
      const commands = encoder.encode(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
      object(page + 1, `<< /Length ${commands.length} >>`, commands);
      object(page + 2, `<< /Type /XObject /Subtype /Image /Width ${width * scale} /Height ${height * scale} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>`, image);
    });
    const xref = length;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function makePdf(issues, report) {
    const pages = [];
    let page;
    let y;
    let continuation = '';
    function text(value, x, top, size, color = colors.ink, bold = false) {
      page.context.font = `${bold ? 'bold ' : ''}${size}px ${fonts}`;
      page.context.fillStyle = color;
      page.context.fillText(value, x, top);
    }
    function rule(top, color, thickness = 1) {
      page.context.fillStyle = color;
      page.context.fillRect(margin, top, contentWidth, thickness);
    }
    function startPage() {
      page = canvasPage();
      rule(40, colors.wine, 3);
      text(report ? '巡舖報告' : '巡舖問題記錄', margin, 56, 25, colors.wine, true);
      rule(height - 42, colors.line);
      text(`第 ${pages.length + 1} 頁`, margin, height - 31, 10, colors.muted);
      y = 105;
      if (continuation) {
        page.context.font = `11px ${fonts}`;
        for (const line of wrap(page.context, continuation)) {
          text(line, margin, y, 11, colors.muted);
          y += 16;
        }
        y += 8;
      }
    }
    async function nextPage() {
      pages.push(await pageJpeg(page.canvas));
      startPage();
    }
    async function paragraph(value, size, lineHeight, color = colors.ink, bold = false) {
      page.context.font = `${bold ? 'bold ' : ''}${size}px ${fonts}`;
      for (const line of wrap(page.context, value)) {
        if (y + lineHeight > bottom) await nextPage();
        text(line, margin, y, size, color, bold);
        y += lineHeight;
      }
    }

    async function renderIssue(issue, number) {
      continuation = report ? `${issue.details['分行']}　問題 ${number}（續）` : '';
      for (const [label, value] of Object.entries(issue.details)) {
        if (report && label === '分行') continue;
        await paragraph(`${label}　${value}`, 12, 19, colors.muted);
      }
      y += 6;
      if (y + 44 > bottom) await nextPage();
      text('問題描述', margin, y, 14, colors.wine, true);
      y += 23;
      await paragraph(issue.note, 13, 20);

      const photos = issue.photos ?? [];
      if (photos.length) {
        const rowHeight = 194;
        const gap = 16;
        const slotWidth = (contentWidth - gap) / 2;
        y += 14;
        for (let index = 0; index < photos.length; index += 2) {
          const newPage = y + rowHeight + (index === 0 ? 24 : 0) > bottom;
          if (newPage) await nextPage();
          if (index === 0 || newPage) {
            text('現場相片', margin, y, 15, colors.wine, true);
            y += 24;
          }
          const row = photos.slice(index, index + 2);
          for (const [column, photo] of row.entries()) {
            const url = URL.createObjectURL(photo);
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              const photoHeight = rowHeight - 24;
              const ratio = Math.min(slotWidth / image.naturalWidth, photoHeight / image.naturalHeight);
              const x = margin + column * (slotWidth + gap);
              page.context.drawImage(image, x, y, image.naturalWidth * ratio, image.naturalHeight * ratio);
              text(`相片 ${index + column + 1}`, x, y + photoHeight + 5, 11, colors.muted);
            } finally {
              URL.revokeObjectURL(url);
            }
          }
          y += rowHeight + 6;
        }
      }
      continuation = '';
    }

    startPage();
    if (report) {
      for (const [label, value] of Object.entries(report.details)) {
        await paragraph(`${label}　${value}`, 12, 19, colors.muted);
      }
      y += 8;
      const gap = 8;
      const cardWidth = (contentWidth - gap * (report.counts.length - 1)) / report.counts.length;
      for (const [index, [label, count]] of report.counts.entries()) {
        const x = margin + index * (cardWidth + gap);
        page.context.fillStyle = '#f7efed';
        page.context.fillRect(x, y, cardWidth, 55);
        text(label, x + 10, y + 9, 11, colors.muted);
        text(String(count), x + 10, y + 24, 21, colors.wine, true);
      }
      y += 73;
      const branches = new Map();
      for (const issue of issues) {
        const label = issue.details['分行'];
        if (!branches.has(label)) branches.set(label, []);
        branches.get(label).push(issue);
      }
      let number = 0;
      for (const [label, entries] of [...branches].sort(([a], [b]) => a.localeCompare(b, 'zh-HK', { numeric: true }))) {
        if (y + 152 > bottom) await nextPage();
        await paragraph(label, 17, 24, colors.wine, true);
        for (const issue of entries) {
          if (y + 123 > bottom) await nextPage();
          rule(y, colors.line);
          y += 9;
          number += 1;
          await paragraph(`問題 ${number}`, 13, 23, colors.ink, true);
          await renderIssue(issue, number);
          y += 17;
        }
      }
    } else {
      await renderIssue(issues[0], 1);
    }
    pages.push(await pageJpeg(page.canvas));
    return jpegPdf(pages);
  }

  window.makeStoreVisitPdf = makePdf;
})();
