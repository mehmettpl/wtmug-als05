// Tesseract.js sarmalayıcı — SADECE OCR, dil algılama MyMemory'ye bırakıldı
let worker = null;
let initPromise = null;

const ALL_LANGS = 'eng+tur+deu+fra+spa+ita+por+rus+ara+chi_sim+jpn+kor';

function updateProgress(p) {
  const bar = document.getElementById('ocr-progress');
  if (bar) bar.style.width = `${Math.round(p * 100)}%`;
}

/**
 * Worker'ı tüm desteklenen dillerle başlatır.
 * detect() KULLANILMIYOR — dil algılama MyMemory API'ye bırakıldı.
 */
export async function initOCR() {
  if (worker) return worker;
  if (initPromise) return initPromise;

  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js yüklenemedi. İnternet bağlantınızı kontrol edin.');
  }

  initPromise = (async () => {
    // legacyCore/legacyLang GEREKMİYOR çünkü detect() kullanmıyoruz
    worker = await Tesseract.createWorker(ALL_LANGS, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          updateProgress(m.progress);
        }
      },
    });
    return worker;
  })();

  return initPromise;
}

/**
 * Görselden metin okur. Dil algılama yapmaz.
 * Dönen metin MyMemory'ye autodetect ile gönderilecek.
 */
export async function recognizeText(imageSource) {
  if (!worker) await initOCR();
  updateProgress(0);

  try {
    const result = await worker.recognize(imageSource);
    const text = (result?.data?.text || '').trim();
    const confidence = Math.round(result?.data?.confidence || 0);

    setTimeout(() => updateProgress(0), 300);

    return { text, confidence };
  } catch (err) {
    console.error('OCR hatası:', err);
    throw new Error('Metin okunamadı: ' + err.message);
  }
}

export async function terminateOCR() {
  if (worker) {
    try { await worker.terminate(); } catch {}
    worker = null;
    initPromise = null;
  }
}
