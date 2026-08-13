const crypto = require('crypto');
const fs = require('fs');

function normalizeHeader(header) {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
}

function toText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function toInteger(value) {
  const text = toText(value);
  if (text === null) return null;
  const number = Number(text);
  return Number.isInteger(number) ? number : null;
}

function toNumber(value) {
  const text = toText(value);
  if (text === null) return null;

  const normalized = text.includes(',') && !text.includes('.')
    ? text.replace(',', '.')
    : text;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const candidate = new Date(Date.UTC(y, m - 1, d));
  return candidate.getUTCFullYear() === y
    && candidate.getUTCMonth() === m - 1
    && candidate.getUTCDate() === d;
}

function normalizeDate(value) {
  const text = toText(value);
  if (text === null || text === '00:00.0') return null;

  let match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return isValidDateParts(year, month, day)
      ? `${year}-${month}-${day}`
      : null;
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s|$)/);
  if (match) {
    const [, year, month, day] = match;
    return isValidDateParts(year, month, day)
      ? `${year}-${month}-${day}`
      : null;
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (match) {
    const [, day, month, year] = match;
    return isValidDateParts(year, month, day)
      ? `${year}-${pad2(month)}-${pad2(day)}`
      : null;
  }

  return null;
}

function normalizeDateTime(value) {
  const text = toText(value);
  if (text === null || text === '00:00.0') return null;

  let match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/
  );

  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    if (!isValidDateParts(year, month, day)) return null;
    return `${year}-${month}-${day} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  }

  match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    if (!isValidDateParts(year, month, day)) return null;
    return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  }

  return null;
}

function normalizeRentType(value) {
  const text = toText(value);
  if (text === null) return null;

  const normalized = text.toUpperCase();
  if (normalized === 'RA' || normalized === 'ADELANTADA') return 'RA';
  if (normalized === 'RV' || normalized === 'VENCIDA') return 'RV';
  return null;
}

function normalizeByType(type, rawValue) {
  switch (type) {
    case 'text':
      return toText(rawValue);
    case 'integer':
      return toInteger(rawValue);
    case 'number':
      return toNumber(rawValue);
    case 'date':
      return normalizeDate(rawValue);
    case 'datetime':
      return normalizeDateTime(rawValue);
    case 'rentType':
      return normalizeRentType(rawValue);
    default:
      throw new Error(`Tipo de normalización no soportado: ${type}`);
  }
}

function shouldCountParseWarning(type, rawValue, normalizedValue) {
  const raw = toText(rawValue);
  if (raw === null) return false;
  if ((type === 'date' || type === 'datetime') && raw === '00:00.0') return false;
  if (type === 'text') return false;
  return normalizedValue === null;
}

function validateHeaders(actualHeaders, expectedHeaders) {
  const actual = actualHeaders.map(normalizeHeader);
  const expected = expectedHeaders.map(normalizeHeader);

  const missing = expected.filter((header) => !actual.includes(header));
  const unexpected = actual.filter((header) => !expected.includes(header));

  return {
    ok: missing.length === 0 && unexpected.length === 0,
    actual,
    expected,
    missing,
    unexpected
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = {
  normalizeHeader,
  toText,
  toInteger,
  toNumber,
  normalizeDate,
  normalizeDateTime,
  normalizeRentType,
  normalizeByType,
  shouldCountParseWarning,
  validateHeaders,
  sha256File
};
