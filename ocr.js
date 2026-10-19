// Tesseract.js sarmalayıcı — cihaz üzeri OCR + dil tespiti
let worker = null;
let workerReady = false;
let initPromise = null;
let currentLangs = null;

// Tesseract dil kodu → ISO 639-1 (MyMemory için)
const TESS_TO_ISO = {
  eng: 'en', tur: 'tr', deu: 'de', fra: 'fr', spa: 'es',
  ita: 'it', por: 'pt', rus: 'ru', ara: 'ar', chi_sim: 'zh',
  jpn: 'ja', kor: 'ko', nld: 'nl', pol: 'pl', ell: 'el',
  heb: 'he', hin: 'hi', ukr: 'uk', ces: 'cs', swe: 'sv',
};

function updateProgress(progress) {
  const bar = document.getElementById('ocr-progress');
  if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
}

/**
 * Belirli dil paketlerini yükleyerek worker oluşturur.
 */
export async function initOCR(langs = 'eng+tur+deu+fra+spa+ita+por+rus+ara+chi_sim+jpn+kor') {
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js yüklenemedi. İnternet bağlantınızı kontrol edin.');
  }

  if (worker && currentLangs === langs) return worker;

  if (worker && currentLangs !== langs) {
    try {
      await worker.reinitialize(langs);
      currentLangs = langs;
      return worker;
    } catch {
      try { await worker.terminate(); } catch {}
      worker = null;
    }
  }

  if (initPromise && !worker) return initPromise;

  initPromise = (async () => {
    worker = await Tesseract.createWorker(langs, 1, {
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
 * Görseldeki metnin alfabesini tespit eder (OSD).
 */
export async function detectLanguage(imageSource) {
  if (!worker) await initOCR();

  try {
    const osd = await worker.detect(imageSource);
    if (osd?.data?.script) {
      const script = osd.data.script.toLowerCase();
      const scriptToLang = {
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
      const detected = scriptToLang[script] || 'eng';
      return {
        tesseractLang: detected,
        script,
        confidence: osd.data.confidence ?? 0,
      };
    }
  } catch (e) {
    console.warn('OSD başarısız, varsayılan kullanılacak:', e);
  }

  return { tesseractLang: 'eng', script: 'latin', confidence: 0 };
}

/**
 * Ana fonksiyon: Görsel → Metin + Dil Bilgisi
 */
export async function recognizeTextWithLang(imageSource) {
  if (!worker) await initOCR();
  updateProgress(0);

  const detection = await detectLanguage(imageSource);

  let ocrLangs = detection.tesseractLang;
  if (detection.script === 'latin') {
    ocrLangs = 'eng+tur+deu+fra+spa+ita+por';
  }

  if (currentLangs !== ocrLangs) {
    await initOCR(ocrLangs);
  }

  const result = await worker.recognize(imageSource);
  updateProgress(1);

  const text = (result?.data?.text || '').trim();
  const confidence = result?.data?.confidence ?? 0;
  const isoLang = TESS_TO_ISO[detection.tesseractLang] || 'en';

  setTimeout(() => updateProgress(0), 300);

  return {
    text,
    confidence,
    tesseractLang: detection.tesseractLang,
    isoLang,
    script: detection.script,
    needsAutodetect: detection.script === 'latin',
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