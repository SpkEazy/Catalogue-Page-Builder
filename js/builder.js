// js/builder.js (FINAL - separate broker photos for catalogue vs presentation)

async function waitForElement(selector, root = document, timeout = 1000) {
  const start = Date.now();
  while (!root.querySelector(selector)) {
    await new Promise(r => requestAnimationFrame(r));
    if (Date.now() - start > timeout) return null;
  }
  return root.querySelector(selector);
}

function getImageDataUrl(inputId) {
  return new Promise((resolve) => {
    const file = document.getElementById(inputId)?.files?.[0];
    if (!file) return resolve('');
    if (file.size > 50 * 1024 * 1024) {
      alert("⚠️ Please upload an image under 50MB.");
      return resolve('');
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function normalizeSpaces(s = "") {
  return s.replace(/\s+/g, " ").trim();
}

function findEmail(texts) {
  const all = texts.join(" ");
  const m = all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function findPhone(texts) {
  const all = texts.join(" ");
  const m = all.match(/(\+27|0)\s?\d{2}\s?\d{3}\s?\d{4}/);
  return m ? normalizeSpaces(m[0]) : "";
}

function findBrokerName(texts) {
  for (let i = 0; i < texts.length; i++) {
    const t = (texts[i] || "").toLowerCase();
    if (t.includes("broker")) {
      for (let j = i + 1; j < Math.min(i + 10, texts.length); j++) {
        const candidate = (texts[j] || "").trim();
        if (!candidate) continue;
        if (candidate === ":" || candidate.endsWith(":")) continue;
        if (candidate.includes("@")) continue;
        if (/\d/.test(candidate)) continue;
        if (candidate.length < 3) continue;
        return candidate.toUpperCase();
      }
    }
  }
  return "";
}

async function getBrokerPhotoOverride() {
  const file = document.getElementById("broker-photo")?.files?.[0];
  if (!file) return "";
  const reader = new FileReader();
  return await new Promise(resolve => {
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// -----------------------------
// Broker Library (separate photos)
// -----------------------------
const BROKERS = {
  ALEX: {
    brokerName: "ALEX KRAUSE",
    brokerPhone: "078 549 2029",
    brokerEmail: "alex@auctioninc.co.za",
    brokerPhotoCatalogue: "assets/broker-photo.jpg",     // ✅ catalogue uses JPG
    brokerPhotoPresentation: "assets/broker-photo.png"   // ✅ presentation uses PNG
  }
};

function brokerFromSelection(selection) {
  if (!selection || selection === "AUTO" || selection === "CUSTOM") return null;
  return BROKERS[selection] || null;
}

// -----------------------------
// DOCX Extraction
// -----------------------------
async function extractDocxFields() {
  const fileInput = document.getElementById("docx-file");
  const file = fileInput?.files?.[0];
  if (!file) return {};

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, "application/xml");

  const texts = Array.from(xmlDoc.getElementsByTagName("w:t"))
    .map(t => (t.textContent || "").trim())
    .filter(Boolean);

  const fieldMap = {
    "Headline": "headline",
    "City": "city",
    "Suburb": "suburb",
    "Tagline 1": "tag1",
    "Tagline 2": "tag2",
    "Feature 1": "feat1",
    "Feature 2": "feat2",
    "Feature 3": "feat3",
    "GLA": "gla",
    "ERF Size": "erf",
    "Date & Time": "date"
  };

  const values = {};
  for (let i = 0; i < texts.length; i++) {
    const label = texts[i].replace(/:$/, "");
    const key = fieldMap[label];
    if (key) {
      for (let j = i + 1; j < texts.length; j++) {
        const candidate = texts[j];
        if (candidate && candidate !== ":") {
          values[key] = candidate;
          break;
        }
      }
    }
  }

  // ✅ Broker extraction
  values.docxBrokerName = findBrokerName(texts);
  values.docxBrokerEmail = findEmail(texts);
  values.docxBrokerPhone = findPhone(texts);

  return values;
}

// -----------------------------
// Data collection
// -----------------------------
async function collectCatalogueFormData() {
  const docxFields = await extractDocxFields();

  const selection = document.getElementById("broker-select")?.value || "AUTO";
  const selectedBroker = brokerFromSelection(selection);

  // Defaults
  let brokerName = "AUCTIONINC";
  let brokerPhone = "";
  let brokerEmail = "";
  let brokerPhotoCatalogue = "assets/broker-photo.jpg";
  let brokerPhotoPresentation = "assets/broker-photo.png";

  if (selection === "CUSTOM") {
    brokerName = (document.getElementById("broker-name")?.value || "AUCTIONINC").toUpperCase();
    brokerPhone = document.getElementById("broker-phone")?.value || "";
    brokerEmail = document.getElementById("broker-email")?.value || "";

    const overridePhoto = await getBrokerPhotoOverride();
    if (overridePhoto) {
      brokerPhotoCatalogue = overridePhoto;
      brokerPhotoPresentation = overridePhoto;
    }
  } else if (selectedBroker) {
    ({ brokerName, brokerPhone, brokerEmail, brokerPhotoCatalogue, brokerPhotoPresentation } = selectedBroker);

    const overridePhoto = await getBrokerPhotoOverride();
    if (overridePhoto) {
      brokerPhotoCatalogue = overridePhoto;
      brokerPhotoPresentation = overridePhoto;
    }
  } else {
    // AUTO from DOCX
    brokerName = (docxFields.docxBrokerName || "AUCTIONINC").toUpperCase();
    brokerPhone = docxFields.docxBrokerPhone || "";
    brokerEmail = docxFields.docxBrokerEmail || "";

    const overridePhoto = await getBrokerPhotoOverride();
    if (overridePhoto) {
      brokerPhotoCatalogue = overridePhoto;
      brokerPhotoPresentation = overridePhoto;
    }
  }

  return {
    ...docxFields,
    lot: document.getElementById('lot')?.value || "",
    propertyImage: await getImageDataUrl('property-img'),
    mapImage: await getImageDataUrl('map-img'),

    brokerName,
    brokerPhone,
    brokerEmail,
    brokerPhotoCatalogue,
    brokerPhotoPresentation
  };
}

// -----------------------------
// Template loader & rendering
// -----------------------------
async function loadTemplate(templatePath, targetId, data) {
  const res = await fetch(templatePath);
  let html = await res.text();

  // ✅ Add dash before headline ONLY for catalogue_page
  if (templatePath.includes('catalogue_page')) {
    if (data.headline && !data.headline.trim().startsWith('-')) {
      data.headline = '- ' + data.headline.trim();
    }
  }

  // Dynamic ERF/GLA combo logic
  let erfGlaText = '';
  if (data.erf && data.gla) {
    erfGlaText = `ERF Size: ${data.erf}   |   GLA: ${data.gla}`;
  } else if (data.erf) {
    erfGlaText = `ERF Size: ${data.erf}`;
  } else if (data.gla) {
    erfGlaText = `GLA: ${data.gla}`;
  }
  html = html.replaceAll('{{erfGlaText}}', erfGlaText);

  // Replace placeholders
  for (const key in data) {
    html = html.replaceAll(`{{${key}}}`, data[key] ?? "");
  }

  const target = document.getElementById(targetId);
  target.innerHTML = '';
  target.innerHTML = html;

  await waitForImagesToLoad(target);

  let containerSelector = '';
  if (templatePath.includes('catalogue_page')) {
    containerSelector = '#capture-container-catalogue_page';
  } else if (templatePath.includes('presentation')) {
    containerSelector = '#capture-container-presentation';
  }

  const container = await waitForElement(containerSelector, target);
  if (container) runFontResize(container);

  if (templatePath.includes('catalogue_page')) {
    drawCatalogueRedTagCanvasImage('catalogue-red-tag-canvas');
  }
}

function waitForImagesToLoad(container) {
  const images = container.querySelectorAll('img');
  const promises = Array.from(images).map(img =>
    new Promise(resolve => {
      if (img.complete) return resolve();
      img.onload = img.onerror = resolve;
    })
  );
  return Promise.all(promises).then(
    () => new Promise(r => requestAnimationFrame(() => r()))
  );
}

function drawCatalogueRedTagCanvasImage(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const redTag = new Image();
  redTag.crossOrigin = 'anonymous';

  redTag.onload = () => {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(redTag, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  redTag.src = 'assets/red-tag.png';
}

// -----------------------------
// Font resize
// -----------------------------
function adjustFontSize(textbox) {
  const span = textbox.querySelector('span');
  if (!span) return;

  const text = span.innerText;
  const maxWidth = textbox.offsetWidth - 20;
  const maxHeight = textbox.offsetHeight - 20;
  let fontSize = 200;

  const dummy = document.createElement('span');
  dummy.style.visibility = 'hidden';
  dummy.style.position = 'absolute';
  dummy.style.fontSize = fontSize + 'px';
  dummy.style.fontFamily = 'Roboto, sans-serif';
  dummy.innerText = text;
  document.body.appendChild(dummy);

  while ((dummy.offsetWidth > maxWidth || dummy.offsetHeight > maxHeight) && fontSize > 5) {
    fontSize--;
    dummy.style.fontSize = fontSize + 'px';
  }

  span.style.fontSize = fontSize + 'px';
  document.body.removeChild(dummy);
}

function runFontResize(container) {
  const ids = [
    'textboxA', 'textboxB', 'textboxC', 'textboxD',
    'textbox_1_Red_Tag', 'textbox_2_Red_Tag',
    'textbox_Red_Banner',
    'textbox_Heading1', 'textbox_Heading2',
    'textbox_Feature_1', 'textbox_Feature_2', 'textbox_Feature_3',
    'textbox_1_Broker_Name', 'textbox_2_Broker_Number',
    'textbox_suburb', 'textbox_title', 'textboxRT1', 'textboxRT2', 'textbox_Contact_Details'
  ];

  ids.forEach(id => {
    const el = container.querySelector(`#${id}`);
    if (el && el.querySelector('span')) adjustFontSize(el);
  });
}

// -----------------------------
// Download logic (blob-based)
// -----------------------------
async function downloadCanvasAsPng(canvas, filename) {
  if (canvas.toBlob) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          const link = document.createElement('a');
          link.download = filename;
          link.href = canvas.toDataURL('image/png');
          link.click();
          return resolve();
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve();
      }, 'image/png', 1.0);
    });
  }

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function generateAndDownload(templateType) {
  const data = await collectCatalogueFormData();

  let templatePath = '';
  let targetId = '';
  let filename = '';

  if (templateType === 'catalogue_page') {
    templatePath = 'templates/catalogue_page.html';
    targetId = 'catalogue-page-preview';
    filename = 'catalogue_page.png';
  } else if (templateType === 'presentation') {
    templatePath = 'templates/presentation.html';
    targetId = 'presentation-page-preview';
    filename = 'presentation_page.png';
  } else {
    alert("❌ Unknown template type.");
    return;
  }

  // Preload red tag
  const redTag = new Image();
  redTag.crossOrigin = 'anonymous';
  redTag.src = 'assets/red-tag.png';
  await new Promise(resolve => {
    redTag.onload = resolve;
    redTag.onerror = resolve;
  });

  await loadTemplate(templatePath, targetId, JSON.parse(JSON.stringify(data)));

  const wrapper = document.getElementById(targetId);
  const containerSelector = templateType === 'catalogue_page'
    ? '#capture-container-catalogue_page'
    : '#capture-container-presentation';

  const container = await waitForElement(containerSelector, wrapper);
  if (!container) return alert("❌ Could not render the selected template.");

  if (templateType === 'presentation') {
    container.style.height = "1130px";
  } else {
    container.style.height = (container.scrollHeight + 45) + "px";
  }

  await waitForImagesToLoad(container);
  await new Promise(resolve => setTimeout(resolve, 800));

  const canvas = await html2canvas(container, {
    scale: 2.5,
    useCORS: true,
    windowHeight: container.scrollHeight
  });

  await downloadCanvasAsPng(canvas, filename);

  container.innerHTML = '';
}

// -----------------------------
// UI wiring
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("broker-select");
  const custom = document.getElementById("custom-broker-fields");

  if (select && custom) {
    const refresh = () => {
      custom.style.display = (select.value === "CUSTOM") ? "block" : "none";
    };
    select.addEventListener("change", refresh);
    refresh();
  }
});
