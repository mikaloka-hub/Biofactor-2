// Helper: parse a published Google Sheet CSV export into the Productos.dc.html data shape.
// Not a UI component — plain business logic, safe to import from the DC logic class.

export function parseCsv(text) {
  // Minimal RFC4180 CSV parser: handles quoted fields, escaped quotes, commas/newlines inside quotes.
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
      return obj;
    });
}

// Groups flat sheet rows (one per product) into the category/items tree Productos.dc.html renders,
// preserving the order categories and items first appear in.
export function rowsToCategories(records) {
  const order = [];
  const byKey = {};
  for (const r of records) {
    const key = r.category_key || r.category_es || r.title;
    if (!byKey[key]) {
      byKey[key] = { key, category: { es: r.category_es || key, en: r.category_en || r.category_es || key }, items: [] };
      order.push(key);
    }
    byKey[key].items.push({
      title: r.title,
      status: (r.status || '').trim() || undefined,
      pdf: (r.pdf_url || '').trim(),
      gln: r.gln || '',
      image: r.image_url || '',
      principio: { es: r.principio_es || '', en: r.principio_en || r.principio_es || '' },
      presentacion: { es: r.presentacion_es || '', en: r.presentacion_en || r.presentacion_es || '' },
      indicaciones: { es: r.indicaciones_es || '', en: r.indicaciones_en || r.indicaciones_es || '' },
      almacenamiento: { es: r.almacenamiento_es || '', en: r.almacenamiento_en || r.almacenamiento_es || '' }
    });
  }
  return order.map((k) => byKey[k]);
}

export async function fetchSheetData(csvUrl) {
  const res = await fetch(csvUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('Sheet fetch failed: ' + res.status);
  const text = await res.text();
  const records = parseCsv(text);
  const cats = rowsToCategories(records);
  if (!cats.length) throw new Error('Sheet returned no rows');
  return cats;
}
