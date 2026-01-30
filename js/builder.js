// js/builder.js (FINAL - Broker dropdown + separate JPG/PNG photos + fit contact block)

async function waitForElement(selector, root = document, timeout = 1500) {
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

// -----------------------------------------
// Broker library (JPG for catalogue, PNG for presentation)
// -----------------------------------------
const BROKERS = {
  "alex-krause": {
    displayName: "Alex Krause",
    brokerName: "ALEX KRAUSE",
    brokerPhone: "078 549 2029",
    brokerEmail: "alex@auctioninc.co.za",
    brokerPhotoCatalogue: "assets/brokers/alex-krause/catalogue.jpg",
    brokerPhotoPresentation: "assets/brokers/alex-krause/presentation.png"
  },
  "jodi-bedil": {
    displayName: "Jodi Bedil",
    brokerName: "JODI BEDIL",
    brokerPhone: "076 637 1273",
    brokerEmail: "jodib@auctioninc.co.za",
    brokerPhotoCatalogue: "assets/brokers/jodi-bedil/catalogue.jpg",
    brokerPhotoPresentation: "assets/brokers/jodi-bedil/presentation.png"
  },
  "gary-brower": {
    displayName: "Gary Brower",
    brokerName: "GARY BROWER",
    brokerPhone: "",   // fill in
    brokerEmail: "",   // fill in
    brokerPhotoCatalogue: "assets/brokers/gary-brower/catalogue.jpg",
    brokerPhotoPresentation: "assets/brokers/gary-brower/presentation.png"
  }
  // Add more brokers here...
};

// Optional: a safe default if someone forgets to choose
const DEFAULT_BROKER_SLUG = "alex-krause";

// -----------------------------------------
// Populate broker dropdown on load
// -----------------------------------------
function populateBrokerDropdown() {
  const select = document.getElementById("broker-select");
  if (!select) return;

  const entries = Object.entries(BROKERS);

  // Sort by display name for friendliness
  entries.sort((a, b) => {
    const an = (a[1].displayName || a[0]).toLowerCase();
    const bn = (b[1].displayName || b[0]).toLowerCase();
    return an.localeCompare(bn);
  });

  select.innerHTML = "";

  // Add options
  for (const [slug, b] of entries) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = b.displayName || b.brokerName || slug;
    select.appendChild(opt);
  }

  // Default selection
  if (BROKERS[DEFAULT_BROKER_SLUG]) {
    select.value = DEFAULT_BROKER_SLUG;
  } else if (select.options.length) {
    select.selectedIndex = 0;
  }
}

document.addEventListener("DOMContentLoaded", populateBrokerDropdown);

// -----------------------------------------
// DOCX extraction (property fields ONLY - no broker parsing)
// -----------------------------------------
async function extractDocxFields() {
  const file = document.getElementById("docx-file")?.files?.[0];
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

  return values;
}

// -----------------------------------------
// Data collection (broker comes from dropdown)
// -----------------------------------------
async function collectCatalogueFormData() {
  const docxFields = await extractDocxFields();

  const selectedSlug =
    document.getElementById("broker-select")?.value ||
    DEFAULT_BROKER_SLUG;

  const broker = BROKERS[selectedSlug] || BROKERS[DEFAULT_BROKER_SLUG];

  // Fallbacks so nothing breaks even if missing info
  const brokerName = (broker?.brokerName || "AUCTIONINC").toUpperCase();
  const brokerPhone = broker?.brokerPhone || "";
  const brokerEmail = broker?.brokerEmail || "";
  const brokerPhotoCatalogue = broker?.brokerPhotoCatalogue || "";
  const brokerPhotoPresentation = broker?.brokerPhotoPresentation || "";

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

// -----------------------------------------
// Template loader & rendering
// -----------------------------------------
async function loadTemplate(templatePath, targetId, data) {
  const res = await fetch(templatePath);
  let html = await res.text();

  // Add dash before headline ONLY for catalogue_page
  if (templatePath.includes('catalogue_page')) {
    if (data.headline && !data.headline.trim().startsWith('-')) {
      data.headline = '- ' + data.headline.trim();
    }
  }

  // ERF/GLA combo
  let erfGlaText = '';
  if (data.erf && data.gla) {
    erfGlaText = `GLA: ${data.gla}`;
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
  if (templatePath.includes('catalogue_page')) containerSelector = '#capture-container-catalogue_page';
  if (templatePath.includes('presentation')) containerSelector = '#capture-container-presentation';

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
  return Promise.all(promises).then(() => new Promise(r => requestAnimationFrame(r)));
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

  redTag.src = 'assets/shared/red-tag.png';
}

// -----------------------------------------
// Font resize utilities
// -----------------------------------------
function fitSpanToBox(span, maxWidth, maxHeight, startSize = 80, minSize = 10) {
  let fontSize = startSize;
  span.style.fontSize = fontSize + 'px';

  while ((span.scrollWidth > maxWidth || span.scrollHeight > maxHeight) && fontSize > minSize) {
    fontSize--;
    span.style.fontSize = fontSize + 'px';
  }
}

function runFontResize(container) {
  const singleSpanIds = [
    'textboxA','textboxB','textboxC','textboxD',
    'textbox_1_Red_Tag','textbox_2_Red_Tag',
    'textbox_Red_Banner',
    'textbox_Heading1','textbox_Heading2',
    'textbox_Feature_1','textbox_Feature_2','textbox_Feature_3',
    'textbox_1_Broker_Name','textbox_2_Broker_Number'
  ];

  singleSpanIds.forEach(id => {
    const el = container.querySelector(`#${id}`);
    const span = el?.querySelector('span');
    if (!el || !span) return;
    const maxW = el.clientWidth - 20;
    const maxH = el.clientHeight - 20;
    fitSpanToBox(span, maxW, maxH, 120, 8);
  });

  // Catalogue contact details: fit each line so nothing overlaps
  const contact = container.querySelector('#textbox_Contact_Details');
  if (contact) {
    const spans = contact.querySelectorAll('span');
    spans.forEach((sp) => {
      fitSpanToBox(sp, contact.clientWidth - 10, 45, 42, 18);
    });
  }
}

// -----------------------------------------
// Download logic
// -----------------------------------------
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

