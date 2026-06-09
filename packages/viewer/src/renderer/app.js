import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";

const welcomeScreen = document.getElementById("welcome-screen");
const readerScreen = document.getElementById("reader-screen");
const dropZone = document.getElementById("drop-zone");
const dropZoneInner = document.getElementById("drop-zone-inner");
const browseBtn = document.getElementById("browse-btn");
const fileInput = document.getElementById("file-input");
const fileChip = document.getElementById("file-chip");
const fileNameEl = document.getElementById("file-name");
const fileExpiryEl = document.getElementById("file-expiry");
const clearFileBtn = document.getElementById("clear-file-btn");
const passwordEl = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password");
const unlockBtn = document.getElementById("unlock-btn");
const welcomeError = document.getElementById("welcome-error");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const closeDocBtn = document.getElementById("close-doc-btn");
const docTitleEl = document.getElementById("doc-title");
const docBadgeEl = document.getElementById("doc-badge");
const toastEl = document.getElementById("toast");
const prevBtn = document.getElementById("prev-page");
const nextBtn = document.getElementById("next-page");
const pageInput = document.getElementById("page-input");
const pageTotalEl = document.getElementById("page-total");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomInBtn = document.getElementById("zoom-in");
const zoomLabel = document.getElementById("zoom-label");
const fitWidthBtn = document.getElementById("fit-width");
const canvasScroll = document.getElementById("canvas-scroll");
const canvas = document.getElementById("pdf-canvas");

/** @type {string | null} */
let pendingFilePath = null;
/** @type {string | null} */
let pendingFileName = null;
/** @type {import("@file-reader/shared").EdocMeta | null} */
let activeMeta = null;

/** @type {import("pdfjs-dist").PDFDocumentProxy | null} */
let pdfDoc = null;

let pageNum = 1;
let scale = 1.35;
let fitWidthMode = false;
let toastTimer = null;
let sessionExpiryTimer = null;

function formatDurationSeconds(seconds) {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const h = seconds / 3600;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

function formatRemainingMs(remainingMs) {
  const minutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  return "Less than a minute left";
}

async function formatExpiryLabel(info) {
  if (info.status === "locked") {
    return "Fully encrypted · enter password to unlock";
  }

  if (info.status === "none") return "";

  if (info.status === "expired") {
    if (info.mode === "open_active") {
      return "Access window ended after first open";
    }
    const date = new Date(info.expiresAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Expired ${date}`;
  }

  if (info.mode === "open_pending") {
    const ttl = formatDurationSeconds(info.openTtlSeconds ?? 3600);
    return `${ttl} access after first open`;
  }

  if (info.mode === "open_active" && info.expiresAt) {
    return `Access ends · ${formatRemainingMs(info.remainingMs ?? 0)}`;
  }

  const date = new Date(info.expiresAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Expires ${date} · ${formatRemainingMs(info.remainingMs ?? 0)}`;
}

async function updateExpiryDisplay() {
  if (!pendingFilePath || !fileExpiryEl) return { expired: false };

  const info = await window.edocViewer.getFileExpiryPreview(pendingFilePath);
  const label = await formatExpiryLabel(info);

  if (!label) {
    fileExpiryEl.classList.add("hidden");
    fileExpiryEl.textContent = "";
    fileChip?.classList.remove("expired");
    return { expired: false, info };
  }

  fileExpiryEl.textContent = label;
  fileExpiryEl.classList.remove("hidden", "active", "expired");
  fileExpiryEl.classList.add(info.status === "expired" ? "expired" : "active");
  fileChip?.classList.toggle("expired", info.status === "expired");
  return { expired: info.status === "expired", info };
}

async function updateReaderBadge() {
  if (!docBadgeEl || !activeMeta || !window.edocViewer) return;

  const info = await window.edocViewer.getExpiryInfo(activeMeta);
  if (info.mode === "open_active" && info.status === "active") {
    docBadgeEl.textContent = `Access · ${formatRemainingMs(info.remainingMs ?? 0)}`;
  } else {
    docBadgeEl.textContent = "Encrypted · In memory";
  }
}

function clearSessionExpiryWatch() {
  if (sessionExpiryTimer) {
    clearInterval(sessionExpiryTimer);
    sessionExpiryTimer = null;
  }
}

function startSessionExpiryWatch() {
  clearSessionExpiryWatch();
  if (!activeMeta?.openTtlSeconds) return;

  sessionExpiryTimer = setInterval(async () => {
    if (!window.edocViewer || !activeMeta) return;
    const info = await window.edocViewer.getExpiryInfo(activeMeta);
    await updateReaderBadge();

    if (info.status === "expired") {
      clearSessionExpiryWatch();
      showToast("Access window ended");
      closeDocument(true);
    }
  }, 10_000);

  updateReaderBadge();
}

function showScreen(name) {
  welcomeScreen.classList.toggle("active", name === "welcome");
  readerScreen.classList.toggle("active", name === "reader");
}

function setLoading(visible, text = "Decrypting document…") {
  loadingText.textContent = text;
  loadingOverlay.classList.toggle("hidden", !visible);
}

function setWelcomeError(message) {
  if (!message) {
    welcomeError.classList.add("hidden");
    welcomeError.textContent = "";
    return;
  }
  welcomeError.textContent = message;
  welcomeError.classList.remove("hidden");
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3200);
}

async function updateUnlockState() {
  const hasFile = Boolean(pendingFilePath);
  const { expired } = hasFile ? await updateExpiryDisplay() : { expired: false };

  unlockBtn.disabled = !hasFile || expired;

  if (hasFile) {
    fileChip.classList.remove("hidden");
    dropZoneInner.classList.add("hidden");
    fileNameEl.textContent = pendingFileName ?? "document.edoc";
    if (expired) {
      setWelcomeError("This document has expired and can no longer be opened.");
    }
  } else {
    fileChip.classList.add("hidden");
    dropZoneInner.classList.remove("hidden");
    dropZoneInner.classList.remove("has-file", "drag-over");
  }
}

function setPendingFile(filePath, fileName) {
  pendingFilePath = filePath;
  pendingFileName = fileName;
  updateUnlockState();
  setWelcomeError("");
  if (filePath) passwordEl.focus();
}

function clearPendingFile() {
  pendingFilePath = null;
  pendingFileName = null;
  passwordEl.value = "";
  updateUnlockState();
}

async function computeScale(pageNumToRender) {
  if (!pdfDoc || !(canvas instanceof HTMLCanvasElement)) return scale;

  if (fitWidthMode && canvasScroll) {
    const page = await pdfDoc.getPage(pageNumToRender);
    const viewport = page.getViewport({ scale: 1 });
    const horizontalPadding = 48;
    const available = canvasScroll.clientWidth - horizontalPadding;
    return Math.max(0.5, Math.min(3, available / viewport.width));
  }

  return scale;
}

async function renderPage(num) {
  if (!pdfDoc || !(canvas instanceof HTMLCanvasElement)) return;

  const renderScale = await computeScale(num);
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: renderScale });
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport }).promise;

  pageNum = num;
  pageInput.value = String(num);
  pageTotalEl.textContent = String(pdfDoc.numPages);
  prevBtn.disabled = num <= 1;
  nextBtn.disabled = num >= pdfDoc.numPages;

  const displayScale = fitWidthMode ? renderScale : scale;
  zoomLabel.textContent = `${Math.round(displayScale * 100)}%`;
}

function setReaderControlsEnabled(enabled) {
  prevBtn.disabled = !enabled || pageNum <= 1;
  nextBtn.disabled = !enabled || !pdfDoc || pageNum >= pdfDoc.numPages;
  pageInput.disabled = !enabled;
  zoomInBtn.disabled = !enabled;
  zoomOutBtn.disabled = !enabled;
  fitWidthBtn.disabled = !enabled;
}

function mapDecryptError(error) {
  if (!error) return "Could not decrypt this file.";
  if (error.includes("expired") || error.includes("Access window")) return error;
  if (error.includes("authenticate") || error.includes("Password required")) {
    return "Incorrect password. Please try again.";
  }
  if (error.includes("Unsupported")) {
    return "This .edoc file is invalid or was created with an incompatible version. Re-encrypt the PDF and try again.";
  }
  return error;
}

async function unlockDocument() {
  if (!pendingFilePath) return;

  const password = passwordEl.value;
  if (!password) {
    setWelcomeError("Enter the document password to continue.");
    passwordEl.focus();
    return;
  }

  const { expired } = await updateExpiryDisplay();
  if (expired) {
    setWelcomeError("This document has expired and can no longer be opened.");
    return;
  }

  setWelcomeError("");
  setLoading(true, "Decrypting document…");

  const result = await window.edocViewer.decryptEdoc(pendingFilePath, password);
  if (!result.ok) {
    setLoading(false);
    setWelcomeError(mapDecryptError(result.error));
    return;
  }

  activeMeta = result.meta;

  setLoading(true, "Rendering pages…");

  try {
    pdfDoc = await pdfjsLib.getDocument({ data: result.data }).promise;
    pageNum = 1;
    scale = 1.35;
    fitWidthMode = true;

    const title = result.meta.name ?? pendingFileName?.replace(/\.edoc$/i, "") ?? "Document";
    docTitleEl.textContent = title;
    pageTotalEl.textContent = String(pdfDoc.numPages);

    setReaderControlsEnabled(true);
    showScreen("reader");
    await renderPage(1);
    startSessionExpiryWatch();

    const info = await window.edocViewer.getExpiryInfo(result.meta);
    if (info.mode === "open_active") {
      showToast(`Unlocked · ${formatRemainingMs(info.remainingMs ?? 0)} remaining`);
    } else if (info.mode === "open_pending") {
      showToast(`Unlocked · ${formatDurationSeconds(info.openTtlSeconds ?? 3600)} access started`);
    } else {
      showToast("Document unlocked");
    }
  } catch (err) {
    setWelcomeError(err.message ?? "Failed to load PDF.");
    pdfDoc = null;
    activeMeta = null;
  } finally {
    setLoading(false);
  }
}

async function loadLocalFile(file) {
  if (!window.edocViewer) {
    setWelcomeError("Viewer failed to initialize. Please restart the app.");
    return;
  }

  if (!file?.name.toLowerCase().endsWith(".edoc")) {
    setWelcomeError("Please select a .edoc file.");
    return;
  }

  try {
    let filePath = typeof file.path === "string" && file.path ? file.path : null;

    if (!filePath) {
      setLoading(true, "Preparing file…");
      filePath = await window.edocViewer.stageEdocFile(file.name, await file.text());
      setLoading(false);
    }

    setPendingFile(filePath, file.name);
  } catch (err) {
    setLoading(false);
    setWelcomeError(err?.message ?? "Could not open this file.");
  }
}

async function pickFile() {
  if (!window.edocViewer) {
    setWelcomeError("Viewer failed to initialize. Please restart the app.");
    return;
  }

  try {
    const ref = await window.edocViewer.openEdocFile();
    if (ref) {
      setPendingFile(ref.filePath, ref.fileName);
      return;
    }
  } catch {
    // Fall back to the hidden file input below.
  }

  if (!(fileInput instanceof HTMLInputElement)) {
    setWelcomeError("File picker is unavailable.");
    return;
  }

  fileInput.value = "";
  fileInput.click();
}

function closeDocument(expired = false) {
  clearSessionExpiryWatch();
  pdfDoc = null;
  activeMeta = null;
  pageNum = 1;
  showScreen("welcome");
  if (expired) {
    setWelcomeError("Your access window has ended. This document can no longer be opened.");
    pendingFilePath = null;
    pendingFileName = null;
    passwordEl.value = "";
    updateUnlockState();
  } else {
    clearPendingFile();
  }
}

async function goToPage(num) {
  if (!pdfDoc) return;
  const target = Math.max(1, Math.min(pdfDoc.numPages, num));
  if (target === pageNum) return;
  await renderPage(target);
}

async function changeZoom(delta) {
  fitWidthMode = false;
  scale = Math.max(0.5, Math.min(3, scale + delta));
  await renderPage(pageNum);
}

browseBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  pickFile().catch((err) => setWelcomeError(err?.message ?? "Could not open file picker."));
});

if (fileInput instanceof HTMLInputElement) {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) loadLocalFile(file);
  });
}

dropZoneInner.addEventListener("click", (e) => {
  if (!pendingFilePath && !e.target.closest("#browse-btn")) {
    pickFile().catch((err) => setWelcomeError(err?.message ?? "Could not open file picker."));
  }
});

clearFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  clearPendingFile();
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZoneInner.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZoneInner.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZoneInner.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) loadLocalFile(file);
});

togglePasswordBtn.addEventListener("click", () => {
  const isHidden = passwordEl.type === "password";
  passwordEl.type = isHidden ? "text" : "password";
  togglePasswordBtn.querySelector(".icon-show").classList.toggle("hidden", isHidden);
  togglePasswordBtn.querySelector(".icon-hide").classList.toggle("hidden", !isHidden);
  togglePasswordBtn.title = isHidden ? "Hide password" : "Show password";
});

unlockBtn.addEventListener("click", async () => {
  if (!pendingFilePath) return;
  unlockBtn.disabled = true;
  try {
    await unlockDocument();
  } finally {
    updateUnlockState();
  }
});

passwordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && pendingFilePath) unlockBtn.click();
});

closeDocBtn.addEventListener("click", closeDocument);

prevBtn.addEventListener("click", () => goToPage(pageNum - 1));
nextBtn.addEventListener("click", () => goToPage(pageNum + 1));

pageInput.addEventListener("change", () => {
  goToPage(Number(pageInput.value) || 1);
});

pageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") pageInput.blur();
});

zoomInBtn.addEventListener("click", () => changeZoom(0.15));
zoomOutBtn.addEventListener("click", () => changeZoom(-0.15));

fitWidthBtn.addEventListener("click", async () => {
  fitWidthMode = true;
  await renderPage(pageNum);
});

window.addEventListener("resize", () => {
  if (fitWidthMode && pdfDoc) renderPage(pageNum);
});

window.addEventListener("keydown", (e) => {
  if (!readerScreen.classList.contains("active") || !pdfDoc) {
    if (e.key === "Escape" && readerScreen.classList.contains("active")) closeDocument();
    return;
  }

  if (e.key === "Escape") closeDocument();
  else if (e.key === "ArrowLeft" || e.key === "PageUp") goToPage(pageNum - 1);
  else if (e.key === "ArrowRight" || e.key === "PageDown") goToPage(pageNum + 1);
  else if (e.key === "+" || e.key === "=") changeZoom(0.15);
  else if (e.key === "-") changeZoom(-0.15);
  else if (e.key === "0") {
    fitWidthMode = true;
    renderPage(pageNum);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  if (!window.edocViewer) {
    setWelcomeError("Viewer failed to initialize. Please restart the app.");
    return;
  }

  window.edocViewer.getLaunchEdoc().then((ref) => {
    if (!ref) return;
    setPendingFile(ref.filePath, ref.fileName);
    passwordEl.focus();
  });
});
