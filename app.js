import { initOCR, recognizeTextWithLang, terminateOCR } from './ocr.js';
import { translateText } from './translate.js';

const video = document.getElementById('camera-preview');
const canvas = document.getElementById('capture-canvas');
const captureBtn = document.getElementById('capture-btn');
const autoBtn = document.getElementById('auto-btn');
const fileInput = document.getElementById('file-input');
const manualText = document.getElementById('manual-text');
const manualTranslateBtn = document.getElementById('manual-translate');
const ocrTextEl = document.getElementById('ocr-text');
const translatedTextEl = document.getElementById('translated-text');
const statusTextEl = document.getElementById('status-text');
const detectedLangEl = document.getElementById('detected-lang');
const targetLangSelect = document.getElementById('target-lang');
const installBtn = document.getElementById('install-btn');

let stream = null;
let busy = false;
let autoMode = false;
let autoTimer = null;

const LANG_LABELS = {
  en: 'İngilizce', tr: 'Türkçe', de: 'Almanca', fr: 'Fransızca',
  es: 'İspanyolca', it: 'İtalyanca', pt: 'Portekizce', ru: 'Rusça',
  ar: 'Arapça', zh: 'Çince', ja: 'Japonca', ko: 'Korece',
  nl: 'Felemenkçe', pl: 'Lehçe', el: 'Yunanca', he: 'İbranice',
};

function setStatus(msg) { statusTextEl.textContent = msg || ''; }
function setBusy(v) {
  busy = v;
  captureBtn.disabled = v;
  manualTranslateBtn.disabled = v;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Kamera desteklenmiyor.');
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      setStatus('Kamera açılamadı: ' + e.message);
      return false;
    }
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => video.play().then(resolve).catch(() => resolve());
  });

  setStatus('Kamera hazır. Metne yöneltip "Yakala"ya basın.');
  return true;
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function grabFrame() {
  if (!video.videoWidth || !video.videoHeight) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

// ⬇️⬇️⬇️ DÜZELTİLMİŞ processImage ⬇️⬇️⬇️
async function processImage(imageSource) {
  if (busy) return;
  setBusy(true);
  ocrTextEl.textContent = '';
  translatedTextEl.textContent = '';
  if (detectedLangEl) detectedLangEl.textContent = '';

  try {
    setStatus('Yazının alfabesi algılanıyor ve metin okunuyor...');
    const ocrResult = await recognizeTextWithLang(imageSource);

    if (!ocrResult.text) {
      setStatus('Yazı bulunamadı. Daha net bir görüntü deneyin.');
      return;
    }

    ocrTextEl.textContent = ocrResult.text;

    let sourceLabel = '';
    let sourceForApi = 'autodetect';

    if (ocrResult.script === 'latin') {
      // Latin alfabesinde MyMemory autodetect kullan (Türkçe/İngilizce ayrımı için)
      sourceLabel = 'Latin alfabesi (MyMemory dili algılayacak)';
      sourceForApi = 'autodetect';
    } else {
      // Arap, Kiril, Han vb. için doğrudan ISO kodu gönder
      const iso = ocrResult.isoLang;
      sourceLabel = LANG_LABELS[iso] || iso.toUpperCase();
      sourceForApi = iso;
    }

    if (detectedLangEl) {
      detectedLangEl.textContent =
        `Algılanan yazı sistemi: ${ocrResult.script.toUpperCase()} • ${sourceLabel} • Güven: %${ocrResult.confidence}`;
    }

    const targetLang = targetLangSelect.value;

    if (sourceForApi === targetLang) {
      translatedTextEl.textContent = ocrResult.text;
      setStatus('Kaynak ve hedef dil aynı, çeviri yapılmadı.');
      return;
    }

    setStatus(`Çeviriliyor (${sourceLabel} → ${LANG_LABELS[targetLang] || targetLang})...`);
    const translated = await translateText(ocrResult.text, targetLang, sourceForApi);
    translatedTextEl.textContent = translated;
    setStatus('✓ Tamamlandı');
  } catch (err) {
    console.error('İşleme hatası:', err);
    setStatus('Hata: ' + err.message);
  } finally {
    setBusy(false);
  }
}
// ⬆️⬆️⬆️ DÜZELTİLMİŞ processImage BİTTİ ⬆️⬆️⬆️

async function captureAndTranslate() {
  const dataUrl = grabFrame();
  if (!dataUrl) { setStatus('Kamera hazır değil.'); return; }
  await processImage(dataUrl);
}

async function autoScanLoop() {
  if (!autoMode || busy) return;
  const dataUrl = grabFrame();
  if (dataUrl) await processImage(dataUrl);
}

function toggleAutoMode() {
  autoMode = !autoMode;
  if (autoBtn) {
    autoBtn.textContent = autoMode ? '🛑 Canlı Taramayı Durdur' : '🔄 Canlı Tarama';
    autoBtn.classList.toggle('active', autoMode);
  }
  if (autoMode) {
    setStatus('Canlı tarama açık...');
    autoTimer = setInterval(autoScanLoop, 2000);
    autoScanLoop();
  } else {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    setStatus('Canlı tarama durduruldu.');
  }
}

captureBtn.addEventListener('click', captureAndTranslate);
if (autoBtn) autoBtn.addEventListener('click', toggleAutoMode);

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { setStatus('Lütfen görsel seçin.'); return; }
  const reader = new FileReader();
  reader.onload = () => processImage(reader.result);
  reader.onerror = () => setStatus('Dosya okunamadı.');
  reader.readAsDataURL(file);
  fileInput.value = '';
});

manualTranslateBtn.addEventListener('click', async () => {
  const text = manualText.value.trim();
  if (!text || busy) return;
  setBusy(true);
  translatedTextEl.textContent = '';
  ocrTextEl.textContent = text;
  if (detectedLangEl) detectedLangEl.textContent = 'Klavye girişi (dil otomatik algılanacak)';

  try {
    setStatus('Çevriliyor...');
    const translated = await translateText(text, targetLangSelect.value, 'autodetect');
    translatedTextEl.textContent = translated;
    setStatus('✓ Tamamlandı');
  } catch (err) {
    setStatus('Hata: ' + err.message);
  } finally {
    setBusy(false);
  }
});

window.addEventListener('load', async () => {
  const ok = await startCamera();
  if (!ok) setStatus('Kamera açılamadı. Galeri veya klavye kullanabilirsiniz.');

  initOCR().catch(err => {
    console.warn('OCR hazırlanamadı:', err);
    setStatus('OCR motoru hazırlanamadı. İnternet bağlantınızı kontrol edin.');
  });

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'block';
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    installBtn.style.display = 'none';
    deferredPrompt = null;
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      if (autoMode) toggleAutoMode();
      stopCamera();
    } else if (!stream) {
      await startCamera();
    }
  });

  window.addEventListener('pagehide', async () => {
    if (autoMode) toggleAutoMode();
    stopCamera();
    await terminateOCR();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  }
});
