const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const MAX_BYTES_PER_CHUNK = 450;

function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

function splitIntoChunks(text, maxBytes) {
  const chunks = [];
  let current = '';
  const sentences = text.split(/(?<=[.!?。！？\n])\s+/);

  for (const sentence of sentences) {
    if (utf8ByteLength(sentence) <= maxBytes) {
      if (utf8ByteLength(current + ' ' + sentence) > maxBytes) {
        if (current) chunks.push(current.trim());
        current = sentence;
      } else {
        current = current ? current + ' ' + sentence : sentence;
      }
      continue;
    }

    if (current) { chunks.push(current.trim()); current = ''; }
    const words = sentence.split(/\s+/);
    for (const word of words) {
      if (utf8ByteLength(word) > maxBytes) {
        for (const char of word) {
          if (utf8ByteLength(current + char) > maxBytes) {
            chunks.push(current);
            current = char;
          } else {
            current += char;
          }
        }
        continue;
      }
      if (utf8ByteLength(current + ' ' + word) > maxBytes) {
        if (current) chunks.push(current.trim());
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) { chunks.push(current.trim()); current = ''; }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(c => c.length > 0);
}

async function translateChunk(chunk, sourceLang, targetLang) {
  const langpair = `${sourceLang}|${targetLang}`;
  const url =
    `${MYMEMORY_URL}?q=${encodeURIComponent(chunk)}` +
    `&langpair=${encodeURIComponent(langpair)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return { ok: true, text: data.responseData.translatedText };
    }

    if (data.responseStatus === 403 || /quota/i.test(data.responseDetails || '')) {
      return { ok: false, text: '[Günlük çeviri kotası doldu. Yarın tekrar deneyin.]' };
    }

    return {
      ok: false,
      text: `[Çeviri hatası: ${data.responseDetails || data.responseStatus}]`,
    };
  } catch (err) {
    return { ok: false, text: `[Bağlantı hatası: ${err.message}]` };
  }
}

/**
 * @param {string} text
 * @param {string} targetLang - Hedef dil ISO kodu
 * @param {string} sourceLang - 'autodetect' veya tespit edilen ISO kod
 */
export async function translateText(text, targetLang = 'tr', sourceLang = 'autodetect') {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  if (sourceLang !== 'autodetect' && sourceLang === targetLang) {
    return trimmed;
  }

  const chunks = splitIntoChunks(trimmed, MAX_BYTES_PER_CHUNK);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const res = await translateChunk(chunks[i], sourceLang, targetLang);
    results.push(res.text);
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results.join(' ');
}