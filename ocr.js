// Tesseract.js sarmalayıcı — cihaz üzeri OCR + dil/alfabe tespiti
let worker = null;
let workerReady = false;
let initPromise = null;
let currentLangs = null;

const TESS_TO_ISO = {
  eng: 'en', tur: 'tr', deu: 'de', fra: 'fr', spa: 'es',
  ita: 'it', por: 'pt', rus: 'ru', ara: 'ar', chi_sim: 'zh',
  jpn: 'ja', kor: 'ko', nld: 'nl', pol: 'pl', ell: 'el',
  heb: 'he', hin: 'hi', ukr: 'uk', ces: 'cs', swe: 'sv',
};

function updateProgress(p) {
  const bar = document.getElementById('ocr-progress');
  if (bar) bar.style.width = `${Math.round(p * 100)}%`;
}

/**
 * Worker oluşturur. OSD (dil/alfabe tespiti) için legacyCore ve legacyLang
 * parametreleri ZORUNLUDUR, aksi halde worker.detect() çalışmaz.
 */
export async function initOCR(langs = 'eng+tur+deu+fra+spa+ita+por+rus+ara+chi_sim+jpn+kor') {
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js yüklenemedi.');
  }

  if (worker && currentLangs === langs) return worker;

  // Farklı dil paketi gerekiyorsa worker'ı yeniden başlat
  if (worker && currentLangs !== langs) {
    try { await worker.terminate(); } catch {}
    worker = null;
    initPromise = null;
  }

  if (initPromise && !worker) return initPromise;

  initPromise = (async () => {
    worker = await Tesseract.createWorker(langs, 1, {
      // ⬇️⬇️⬇️ OSD İÇİN KRİTİK PARAMETRELER ⬇️⬇️⬇️
      legacyCore: true,
      legacyLang: true,
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          updateProgress(m.progress);
        }
      },
    });
    currentLangs = langs;
    workerReady = true;
    return worker;
  })();

  return initPromise;
}

/**
 * Görseldeki yazının alfabesini tespit eder.
 * worker.detect() çalışabilmesi için legacyCore/legacyLang true olmalı.
 */
async function detectScript(imageSource) {
  if (!worker) await initOCR();
  try {
    const osd = await worker.detect(imageSource);
    const script = (osd?.data?.script || 'Latin').toLowerCase();
    return { script, confidence: osd?.data?.script_confidence || 0 };
  } catch (e) {
    console.warn('OSD başarısız:', e);
    return { script: 'latin', confidence: 0 };
  }
}

const SCRIPT_TO_TESS = {
  latin: 'eng',
  cyrillic: 'rus',
  arabic: 'ara',
  han: 'chi_sim',
  han_s: 'chi_sim',
  han_t: 'chi_tra',
  japanese: 'jpn',
  korean: 'kor',
  greek: 'ell',
  hebrew: 'heb',
  devanagari: 'hin',
};

/**
 * Ana fonksiyon: Görsel → Alfabe tespiti → OCR → Metin + Dil Bilgisi
 */
export async function recognizeTextWithLang(imageSource) {
  if (!worker) await initOCR();
  updateProgress(0);

  // 1) Alfabe tespiti (OSD)
  const det = await detectScript(imageSource);
  const tessBase = SCRIPT_TO_TESS[det.script] || 'eng';

  // 2) OCR için dil paketleri:
  //    - Latin alfabesinde birden fazla dil yükle (MyMemory autodetect ile birleşince doğru sonuç verir)
  //    - Diğer alfabelerde tek dil yeterli
  const ocrLangs = (det.script === 'latin')
    ? 'eng+tur+deu+fra+spa+ita+por'
    : tessBase;

  await initOCR(ocrLangs);

  // 3) OCR
  const result = await worker.recognize(imageSource);
  const text = (result?.data?.text || '').trim();
  const confidence = Math.round(result?.data?.confidence || 0);

  const isoLang = TESS_TO_ISO[tessBase] || 'en';

  setTimeout(() => updateProgress(0), 300);

  return {
    text,
    confidence,
    script: det.script,
    isoLang,
    needsAutodetect: det.script === 'latin',
  };
}

export async function terminateOCR() {
  if (worker) {
    try { await worker.terminate(); } catch {}
    worker = null;
    workerReady = false;
    currentLangs = null;
    initPromise = null;
  }
}
