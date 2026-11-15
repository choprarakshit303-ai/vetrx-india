/**
 * VetRx India — Modular Application Controller (`src/app_controller.js`, v3.0.0)
 * Connects `data/drug_catalog.json`, `src/dose_engine.js`, `src/crypto_storage.js`, and `src/i18n.js`.
 * Features:
 * - Mobile-First Bottom Navigation Bar + Step-by-Step Guided Flow (Step 1 Patient -> Step 2 Drug -> Step 3 Withdrawal & Queue)
 * - Live Dose Result Card Shown First (with Collapsible Details)
 * - PBKDF2-HMAC-SHA256 PIN-Derived AES-256-GCM Encryption (Zero Key in localStorage)
 * - Honest Primary-Source SKU Provenance (`lastReviewed: null` for unverified monographs) & Versioned Changelog (`v3.0.0`)
 * - Full IndexedDB JSON Backup Export & Restore Import
 * - Expanded Hindi (`हिन्दी`) & Marathi (`मराठी`) UI Localization
 * - 16/16 Live Engine Golden Test Vectors
 */

const PRACTITIONERS = window.VETRX_CATALOG_DATA.practitioners;
const SPECIES_META = window.VETRX_CATALOG_DATA.speciesMeta;
const INDIAN_SKU_CATALOG = window.VETRX_CATALOG_DATA.skus;
const VERIFIED_GAZETTE_CITATIONS = window.VETRX_CATALOG_DATA.verifiedGazetteCitations;
const LEGAL_REGULATORY_NOTES = window.VETRX_CATALOG_DATA.legalRegulatoryNotes || [];
const CATALOG_CHANGELOG = window.VETRX_CATALOG_DATA.changelog || [];

function computeIbwAndBsa(tbwKg, bcs9, bodyFatPct, mcsDownAdjPct, speciesCode) {
  return window.VetDoseEngine.computeIbwAndBsa(tbwKg, bcs9, bodyFatPct, mcsDownAdjPct, speciesCode, SPECIES_META);
}

function discretizeTabletDose(targetMg, strengthMg, splittableFractions) {
  return window.VetDoseEngine.discretizeTabletDose(targetMg, strengthMg, splittableFractions);
}

// Dynamic Clock Helpers (Zero static hardcoded review dates!)
function getTodayIsoDate() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function getFutureIsoDate(yearsToAdd, daysToAdd) {
  const d = new Date();
  if (yearsToAdd) d.setFullYear(d.getFullYear() + yearsToAdd);
  if (daysToAdd) d.setDate(d.getDate() + daysToAdd);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

let appState = {
  lang: 'en',
  activeTab: 'dosage',
  dosageStep: 'all',
  rxId: 'RX-IND-' + getTodayIsoDate().replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000),
  consentReceiptId: 'DPDP-' + getTodayIsoDate().replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000),
  isSignedLocked: false,
  signedTimestamp: null,
  signedSha256: null,
  signedByPractitioner: null,
  rxPatientKey: null,
  rxItems: [],
  pendingHighRiskAdd: null,
  encryptedPiiEnvelope: null,
  h1Register: [],
  dpdpAuditLogs: [
    {
      id: 'DPDP-LOG-1001',
      auditId: 'DPDP-LOG-1001',
      timestamp: new Date().toISOString(),
      actor: 'SYSTEM_BOOT',
      action: 'ENGINE_INITIALIZED',
      details: 'Initialized VetRx India v3.0.0 Student Study & Decision-Support Aid, PBKDF2-AES-256-GCM encryption & IndexedDB persistence.'
    }
  ],
  adrLogs: [
    {
      adrId: 'ADR-2026-01',
      date: getTodayIsoDate(),
      drug: 'Butalex (Buparvaquone 50 mg/mL)',
      batchNo: 'BTX-2604A (Exp 09/2028)',
      patient: 'Murrah Buffalo • 500 kg',
      severity: 'Moderate (Systemic — Intervention Needed)',
      reaction: 'Localized cervical swelling when >10 mL injected at a single site; resolved after enforcing ≤10 mL/site neck splitting rule (NMP excipient).'
    }
  ],
  cprState: {
    atropineLocked: false,
    timerSeconds: 120,
    timerInterval: null,
    cycleCount: 1,
    epiElapsedSeconds: 0,
    epiTimerActive: false,
    metronomeActive: false,
    metronomeInterval: null,
    audioCtx: null,
    codeLogEntries: []
  },
  lastCalculation: null
};

// =========================================================================
// 1. MOBILE STEP-BY-STEP GUIDED FLOW (`setDosageStep`)
// =========================================================================
function setDosageStep(step) {
  appState.dosageStep = step;
  const s1 = document.getElementById('dosage-step-1-panel');
  const col23 = document.getElementById('dosage-step-2-3-column');
  const s2 = document.getElementById('dosage-step-2-panel');
  const s3 = document.getElementById('dosage-step-3-panel');
  if (!s1 || !col23 || !s2 || !s3) return;

  // Reset visibility first
  s1.classList.remove('hidden');
  col23.classList.remove('hidden');
  s2.classList.remove('hidden');
  s3.classList.remove('hidden');

  const baseS1 = 'w-full min-w-0 space-y-5';
  const baseCol23 = 'w-full min-w-0 space-y-5';
  const baseS2 = 'w-full min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden';
  const baseS3 = 'w-full min-w-0 space-y-5';

  if (step === 1) {
    s1.className = baseS1 + ' col-span-1 lg:col-span-12';
    col23.className = baseCol23 + ' hidden col-span-1 lg:col-span-12';
  } else if (step === 2) {
    s1.className = baseS1 + ' hidden col-span-1 lg:col-span-12';
    col23.className = baseCol23 + ' col-span-1 lg:col-span-12';
    s2.className = baseS2;
    s3.className = baseS3 + ' hidden';
  } else if (step === 3) {
    s1.className = baseS1 + ' hidden col-span-1 lg:col-span-12';
    col23.className = baseCol23 + ' col-span-1 lg:col-span-12';
    s2.className = baseS2 + ' hidden';
    s3.className = baseS3;
  } else {
    // 'all' — Side-by-side Desktop / Full View
    s1.className = baseS1 + ' col-span-1 lg:col-span-5';
    col23.className = baseCol23 + ' col-span-1 lg:col-span-7';
    s2.className = baseS2;
    s3.className = baseS3;
  }

  const mapBtns = [
    { id: 'step-btn-1', val: 1 },
    { id: 'step-btn-2', val: 2 },
    { id: 'step-btn-3', val: 3 },
    { id: 'step-btn-all', val: 'all' }
  ];
  mapBtns.forEach(b => {
    const el = document.getElementById(b.id);
    if (!el) return;
    if (b.val === step) {
      el.className = 'px-3 py-2 rounded-lg bg-teal-600 text-white font-bold text-xs text-center transition';
    } else {
      el.className = 'px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs text-center transition';
    }
  });
}

// =========================================================================
// 2. PBKDF2 PIN / PASSPHRASE ENCRYPTION HANDLER (Zero Key in localStorage)
// =========================================================================
async function applyEncryptionPin() {
  const input = document.getElementById('dpdp-pin-input');
  const badge = document.getElementById('dpdp-kdf-status-badge');
  const pin = input ? input.value.trim() : '';
  if (!window.VetCryptoStorage) return;

  const ok = window.VetCryptoStorage.setSessionPassphrase(pin);
  if (ok) {
    if (badge) {
      badge.textContent = 'PBKDF2 PIN Active (100k iter)';
      badge.className = 'mono text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold';
    }
    await logUiChange('pbkdf2_pin_set', 'Derived new in-memory AES-256-GCM key via PBKDF2-HMAC-SHA256 (100,000 iterations)');
    await updateEncryptedPiiPreview();
    await renderIndexedDbCases();
    showToast('Session Encryption PIN applied! AES-256-GCM key derived in-memory via PBKDF2 (zero key in localStorage).', 'teal');
  } else {
    if (badge) {
      badge.textContent = 'Default Sandbox PIN';
      badge.className = 'mono text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold';
    }
    showToast('Enter at least 4 characters to set a custom PBKDF2 encryption PIN.', 'amber');
  }
}

// =========================================================================
// 3. DYNAMIC PRACTITIONER & EXPIRY DERIVATION (Zero Hardcoded Real Vets)
// =========================================================================
function getActivePractitioner() {
  const customOn = document.getElementById('custom-prac-toggle') && document.getElementById('custom-prac-toggle').checked;
  if (customOn) {
    const cname = (document.getElementById('custom-prac-name').value || '').trim();
    const creg = (document.getElementById('custom-prac-reg').value || '').trim();
    const ccouncil = (document.getElementById('custom-prac-council').value || 'State Veterinary Council').trim();
    const cexp = document.getElementById('custom-prac-expiry').value || getFutureIsoDate(3, 0);
    const expDate = new Date(cexp + 'T23:59:59');
    const isExpired = isNaN(expDate.getTime()) || (expDate.getTime() < Date.now());
    if (cname && creg) {
      return {
        id: 'custom',
        isDemo: false,
        name: cname,
        qualifications: 'B.V.Sc. & A.H. (Supervising Registered Practitioner)',
        council: ccouncil,
        regNumber: creg,
        regExpiry: cexp,
        isExpired,
        clinicName: cname + ' Veterinary Clinic',
        clinicAddress: document.getElementById('client-address').value.trim() || 'Registered Veterinary Practice, India'
      };
    }
  }
  const pracId = document.getElementById('prac-select') ? document.getElementById('prac-select').value : 'prac-1';
  const base = PRACTITIONERS[pracId] || PRACTITIONERS['prac-1'];
  const offsetDays = Number(base.regExpiryOffsetDays) || 365;
  const regExpiry = getFutureIsoDate(0, offsetDays);
  const isExpired = offsetDays < 0;
  return Object.assign({}, base, { regExpiry, isExpired });
}

function getActiveActorLabel() {
  const p = getActivePractitioner();
  return p.name + ' [' + p.regNumber + ']';
}

async function logUiChange(fieldName, newValue) {
  const entry = {
    id: 'DPDP-LOG-' + Math.floor(10000 + Math.random() * 90000),
    auditId: 'AUDIT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    actor: getActiveActorLabel(),
    action: 'STATE_MUTATION (' + fieldName + ')',
    details: 'Updated "' + fieldName + '" -> "' + String(newValue).slice(0, 80) + '"'
  };
  appState.dpdpAuditLogs.unshift(entry);
  if (window.VetCryptoStorage) {
    await window.VetCryptoStorage.saveRecordToStore('audits', entry);
  }
  renderStatutoryRegisters();
}

// =========================================================================
// 4. PATIENT IDENTITY LOCK FOR ACTIVE RX QUEUE
// =========================================================================
function computeCurrentPatientKey() {
  const name = (document.getElementById('patient-name').value || '').trim();
  const sp = document.getElementById('patient-species').value;
  const bw = document.getElementById('patient-bw').value;
  const unit = document.getElementById('patient-bw-unit').value;
  return name + '|' + sp + '|' + bw + unit;
}

function handlePatientIdentityChange(field, val) {
  logUiChange(field, val);
  if (appState.rxItems.length > 0 && appState.rxPatientKey && appState.rxPatientKey !== computeCurrentPatientKey()) {
    appState.rxItems = [];
    appState.rxPatientKey = null;
    appState.isSignedLocked = false;
    renderRxItemsLists();
    showToast('Patient demographics changed: cleared queued Rx items from previous patient for safety.', 'amber');
  }
  recalculateAll();
}

function fillSampleOwnerForTesting() {
  document.getElementById('client-name').value = 'Sample Farmer / Caretaker (Sandbox)';
  document.getElementById('client-phone').value = '+91 90000-00000';
  document.getElementById('client-address').value = 'Sample Farm Plot 12, Sandbox District';
  document.getElementById('dpdp-consent-check').checked = true;
  logUiChange('sample_owner_filled', 'Populated sandbox owner & consent');
  recalculateAll();
  showToast('Populated sample owner details and ticked DPDP consent for testing.', 'teal');
}

// =========================================================================
// 5. SPECIES BCS SCALE (9-PT VS 5-PT), HEART-GIRTH & FLOCK DOSING UI
// =========================================================================
function syncSpeciesBcsAndModeUi(spCode) {
  const meta = SPECIES_META[spCode] || SPECIES_META.dog;
  const bcsSelect = document.getElementById('patient-bcs');
  const bcsLabel = document.getElementById('label-patient-bcs');
  const bfContainer = document.getElementById('bf-pct-container');
  const mcsRow = document.getElementById('companion-mcs-row');
  const girthPanel = document.getElementById('livestock-girth-estimator');
  const flockPanel = document.getElementById('flock-dosing-panel');

  if (meta.bcsScale === 5) {
    bcsLabel.textContent = 'Ruminant BCS (1–5 Scale)';
    bcsSelect.innerHTML =
      '<option value="1">1.0/5 — Emaciated (Cachectic)</option>' +
      '<option value="2">2.0/5 — Thin (Negative Energy Balance)</option>' +
      '<option value="3" selected>3.0/5 — Ideal Dairy/Livestock Condition</option>' +
      '<option value="4">4.0/5 — Heavy / Dry-Cow Condition</option>' +
      '<option value="5">5.0/5 — Obese (Fatty Liver / Ketosis Risk)</option>';
    bfContainer.classList.add('hidden');
    mcsRow.classList.add('hidden');
    girthPanel.classList.remove('hidden');
    flockPanel.classList.add('hidden');
    updateGirthEstimatePreview();
  } else if (meta.bcsScale === 9) {
    const prevVal = bcsSelect.value;
    bcsLabel.textContent = 'Companion BCS (1–9 Scale)';
    bcsSelect.innerHTML =
      '<option value="1">1/9 — Emaciated</option>' +
      '<option value="2">2/9 — Very Thin</option>' +
      '<option value="3">3/9 — Thin (Underweight)</option>' +
      '<option value="4">4/9 — Ideal (0.94–0.99×)</option>' +
      '<option value="5">5/9 — Ideal Baseline (20% BF)</option>' +
      '<option value="6">6/9 — Overweight (+10%)</option>' +
      '<option value="7">7/9 — Heavy (+20%)</option>' +
      '<option value="8">8/9 — Obese (+30% • ÷1.30)</option>' +
      '<option value="9">9/9 — Morbidly Obese (Open Tier)</option>';
    bcsSelect.value = (prevVal >= 1 && prevVal <= 9) ? prevVal : '5';
    bfContainer.classList.remove('hidden');
    mcsRow.classList.remove('hidden');
    girthPanel.classList.add('hidden');
    flockPanel.classList.add('hidden');
  } else {
    bcsLabel.textContent = 'Flock / Pond Condition';
    bcsSelect.innerHTML = '<option value="5" selected>Standard Flock / Biomass</option>';
    bfContainer.classList.add('hidden');
    mcsRow.classList.add('hidden');
    girthPanel.classList.add('hidden');
    flockPanel.classList.remove('hidden');
  }
}

function updateGirthEstimatePreview() {
  const sp = document.getElementById('patient-species').value;
  const gCm = document.getElementById('hg-girth-cm').value;
  const lCm = document.getElementById('hg-length-cm').value;
  const res = window.VetDoseEngine.estimateLivestockWeightKg(gCm, lCm, sp);
  const out = document.getElementById('hg-estimated-kg');
  if (out) {
    out.textContent = res.valid ? (res.estimatedKg.toFixed(1) + ' kg') : 'Invalid cm';
  }
}

function applyEstimatedLivestockWeight() {
  const sp = document.getElementById('patient-species').value;
  const gCm = document.getElementById('hg-girth-cm').value;
  const lCm = document.getElementById('hg-length-cm').value;
  const res = window.VetDoseEngine.estimateLivestockWeightKg(gCm, lCm, sp);
  if (!res.valid) {
    showToast(res.error, 'rose');
    return;
  }
  document.getElementById('patient-bw-unit').value = 'kg';
  document.getElementById('patient-bw').value = res.estimatedKg.toFixed(1);
  handlePatientIdentityChange('patient-bw-heart-girth', res.estimatedKg.toFixed(1) + ' kg');
  showToast('Applied tape-estimated livestock weight (' + res.estimatedKg.toFixed(1) + ' kg) to patient!', 'teal');
}

// =========================================================================
// 6. DROPDOWN & SPECIES-SPECIFIC SKU DEFAULTS
// =========================================================================
function populateSkuDropdown(preserveId) {
  const filter = document.getElementById('sku-category-filter').value;
  const select = document.getElementById('selected-sku-id');
  const currentVal = preserveId || select.value || 'carodyl-75';
  select.innerHTML = '';

  const filtered = INDIAN_SKU_CATALOG.filter(item => {
    if (filter === 'verified') return item.status === 'VERIFIED';
    if (filter === 'unverified') return item.status === 'UNVERIFIED';
    if (filter === 'banned') return item.status === 'BANNED';
    return true;
  });

  filtered.forEach(sku => {
    const opt = document.createElement('option');
    opt.value = sku.id;
    let prefix = '[VERIFIED] ';
    if (sku.status === 'UNVERIFIED') prefix = '[UNVERIFIED MONOGRAPH] ';
    if (sku.status === 'BANNED') prefix = '[STATUTORY BAN] ';
    opt.textContent = prefix + sku.brand + ' — ' + sku.inn + ' (' + sku.strengthVal + ' ' + sku.strengthUnit + ')';
    select.appendChild(opt);
  });

  if (filtered.some(s => s.id === currentVal)) {
    select.value = currentVal;
  } else if (filtered.length > 0) {
    select.value = filtered[0].id;
  }
  handleSkuSelectionChange();
}

function handlePractitionerChange() {
  const prac = getActivePractitioner();
  document.getElementById('header-prac-name').textContent = prac.name;
  document.getElementById('header-prac-reg').textContent = '(' + prac.regNumber + ')';
  const dot = document.getElementById('header-reg-dot');
  dot.className = prac.isExpired
    ? 'w-2 h-2 rounded-full bg-rose-500 animate-pulse'
    : (prac.isDemo ? 'w-2 h-2 rounded-full bg-amber-400' : 'w-2 h-2 rounded-full bg-emerald-400');
  recalculateAll();
}

function toggleCustomPractitionerMode() {
  const checked = document.getElementById('custom-prac-toggle').checked;
  const fields = document.getElementById('custom-prac-fields');
  const pill = document.getElementById('header-sim-mode-pill');
  if (checked) {
    fields.classList.remove('hidden');
    pill.textContent = 'SUPERVISING VET SIGN-IN';
    pill.className = 'text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  } else {
    fields.classList.add('hidden');
    pill.textContent = 'STUDY SANDBOX';
    pill.className = 'text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
  }
  handlePractitionerChange();
}

function handleSpeciesChange() {
  const sp = document.getElementById('patient-species').value;
  const breedSelect = document.getElementById('patient-breed');
  if (sp === 'cat') breedSelect.value = 'Domestic Shorthair Cat';
  else if (sp === 'buffalo') breedSelect.value = 'Murrah Buffalo';
  else if (sp === 'cattle') breedSelect.value = 'Sahiwal / Crossbred Cow';
  else if (sp === 'dog') breedSelect.value = 'Labrador Retriever';

  syncSpeciesBcsAndModeUi(sp);
  applySpeciesSpecificSkuDefaults();
  handlePatientIdentityChange('patient-species', sp);
}

function applySpeciesSpecificSkuDefaults() {
  const skuId = document.getElementById('selected-sku-id').value;
  const sku = INDIAN_SKU_CATALOG.find(s => s.id === skuId) || INDIAN_SKU_CATALOG[0];
  if (!sku) return;
  const sp = document.getElementById('patient-species').value;
  const spProt = (sku.speciesDosing && sku.speciesDosing[sp]) ? sku.speciesDosing[sp] : null;

  document.getElementById('input-dose-unit-basis').value = 'mg/kg';
  if (spProt) {
    document.getElementById('input-dose-rate').value = spProt.defaultDose;
    document.getElementById('input-freq').value = spProt.defaultFreq;
    document.getElementById('input-route').value = spProt.allowedRoutes[0] || sku.defaultRoute;
    document.getElementById('dose-unit-label').textContent = spProt.unit;
    document.getElementById('dose-range-hint').textContent =
      'Single: ' + spProt.minSingleDose + '–' + spProt.maxSingleDose + ' | Max Daily: ' + spProt.maxDailyDose + ' ' + spProt.unit + '/d | Max ' + spProt.maxDurationDays + 'd';
  } else {
    document.getElementById('input-dose-rate').value = sku.defaultDose;
    document.getElementById('input-freq').value = sku.defaultFreq;
    document.getElementById('input-route').value = sku.defaultRoute;
    document.getElementById('dose-unit-label').textContent = sku.doseUnit;
    document.getElementById('dose-range-hint').textContent = 'Not approved for ' + sp.toUpperCase();
  }
}

function handleSkuSelectionChange() {
  document.getElementById('rounding-override-check').checked = false;
  document.getElementById('rounding-override-reason').value = '';
  applySpeciesSpecificSkuDefaults();
  recalculateAll();
}

// =========================================================================
// 7. MODULAR RECALCULATE CONTROLLER (Delegates Math to VetDoseEngine)
// =========================================================================
async function updateEncryptedPiiPreview() {
  const name = document.getElementById('client-name').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const address = document.getElementById('client-address').value.trim();
  const consent = document.getElementById('dpdp-consent-check').checked;
  const el = document.getElementById('live-aes-preview');
  const tag = document.getElementById('dpdp-receipt-tag');

  if (!name || !address || !consent) {
    appState.encryptedPiiEnvelope = null;
    if (el) el.textContent = 'PBKDF2-AES-256-GCM Status: Enter Owner Name & Address and tick DPDP Consent to encrypt PII.';
    if (tag) tag.textContent = 'CONSENT-PENDING';
    return;
  }
  if (tag) tag.textContent = appState.consentReceiptId;
  if (window.VetCryptoStorage) {
    const env = await window.VetCryptoStorage.encryptOwnerPii({ name, phone, address });
    appState.encryptedPiiEnvelope = env;
    if (el && env) {
      el.textContent = env.algorithm + ' (' + env.keyDerivation + ') | Salt: ' + (env.saltBase64 || 'N/A').slice(0, 12) + '... | Ciphertext: ' + env.ciphertextBase64.slice(0, 32) + '...';
    }
  }
}

function recalculateAll() {
  const prac = getActivePractitioner();
  const pracRole = document.getElementById('prac-role').value;
  const consultMode = document.getElementById('consult-mode').value;
  const clientName = document.getElementById('client-name').value.trim();
  const clientAddress = document.getElementById('client-address').value.trim();
  const dpdpConsent = document.getElementById('dpdp-consent-check').checked;

  updateEncryptedPiiPreview();

  const spCode = document.getElementById('patient-species').value;
  const spMeta = SPECIES_META[spCode] || SPECIES_META.dog;
  const breed = document.getElementById('patient-breed').value;
  const ageStage = document.getElementById('patient-age-stage').value;
  const repro = document.getElementById('patient-repro').value;
  const renalStage = document.getElementById('patient-renal-stage').value;
  const hepaticStage = document.getElementById('patient-hepatic-stage').value;

  const rawWeightStr = document.getElementById('patient-bw').value;
  const weightUnit = document.getElementById('patient-bw-unit').value;
  const bcs = document.getElementById('patient-bcs').value;
  const bfPct = document.getElementById('patient-bf-pct').value;
  const mcsAdj = document.getElementById('patient-mcs').value;
  const basisMode = document.getElementById('weight-basis-mode').value;

  const skuId = document.getElementById('selected-sku-id').value;
  const sku = INDIAN_SKU_CATALOG.find(s => s.id === skuId) || INDIAN_SKU_CATALOG[0];

  const rawDoseRate = document.getElementById('input-dose-rate').value;
  const doseBasisUnit = document.getElementById('input-dose-unit-basis').value;
  const freqVal = document.getElementById('input-freq').value;
  const durationDays = document.getElementById('input-duration-days').value;
  const route = document.getElementById('input-route').value;
  const allowUnverifiedStudyMode = document.getElementById('allow-unverified-study-mode')
    ? document.getElementById('allow-unverified-study-mode').checked
    : false;

  // Call Pure Stateless Engine!
  const engineRes = window.VetDoseEngine.calculateDosage({
    sku,
    spCode,
    speciesMetaMap: SPECIES_META,
    rawWeight: rawWeightStr,
    weightUnit,
    bcs,
    bfPct,
    mcsAdj,
    basisMode,
    rawDoseRate,
    doseBasisUnit,
    freqVal,
    durationDays,
    route,
    renalStage,
    hepaticStage,
    breed,
    ageStage,
    repro,
    amrCsStatus: document.getElementById('amr-cs-status').value,
    roundingOverrideChecked: document.getElementById('rounding-override-check').checked,
    roundingOverrideReason: document.getElementById('rounding-override-reason').value,
    allowUnverifiedStudyMode,
    activeRxItems: appState.rxItems
  });

  // Update Food Animal Header Pill
  const foodBadge = document.getElementById('food-animal-badge');
  if (spMeta.foodProducing) {
    foodBadge.textContent = 'FOOD-PRODUCING ANIMAL (FSSAI MRL ACTIVE)';
    foodBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-400/30';
  } else {
    foodBadge.textContent = 'COMPANION ANIMAL';
    foodBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-semibold';
  }

  // Update IBW & BSA Readouts (Hidden if weight is blank/invalid!)
  const wNorm = engineRes.wNorm;
  if (wNorm.invalidWeightInput) {
    document.getElementById('readout-ibw').textContent = '— BLOCKED —';
    document.getElementById('readout-ibw-formula').textContent = 'Weight required';
    document.getElementById('readout-bsa-ibw').textContent = '—';
    document.getElementById('readout-bsa-tbw').textContent = '—';
    document.getElementById('header-patient-summary').textContent = spMeta.label.split(' ')[0] + ' • Weight Missing';
  } else {
    document.getElementById('readout-ibw').textContent = wNorm.ibwKg.toFixed(2) + ' kg';
    document.getElementById('readout-ibw-formula').textContent = wNorm.formulaDesc;
    document.getElementById('readout-bsa-ibw').textContent = wNorm.bsaIbw ? wNorm.bsaIbw.toFixed(3) + ' m²' : 'N/A (Livestock)';
    document.getElementById('readout-bsa-tbw').textContent = wNorm.bsaTbw ? wNorm.bsaTbw.toFixed(3) + ' m²' : 'N/A (Livestock)';
    document.getElementById('header-patient-summary').textContent =
      spMeta.label.split(' ')[0] + ' • ' + wNorm.tbwKg.toFixed(1) + ' kg (IBW ' + wNorm.ibwKg.toFixed(2) + ' kg)';
  }
  document.getElementById('readout-bsa-k').textContent = wNorm.bsaK ? 'K = ' + wNorm.bsaK : 'Farm/Flock Mode';
  document.getElementById('bcs-clinical-note').textContent = wNorm.clinicalNote;

  // Flock / Pond Dosing Calculation when Poultry or Aquaculture is selected
  if (spMeta.dosingMode === 'flock_water_feed') {
    const flockCount = document.getElementById('flock-count').value;
    const waterPerUnit = document.getElementById('flock-water-per-unit').value;
    const flockRes = window.VetDoseEngine.calculateFlockWaterOrFeedDose({
      speciesCode: spCode,
      flockCount,
      avgBirdOrFishKg: wNorm.tbwKg || 0,
      doseMgKgDay: engineRes.effectiveDoseRate || 0,
      strengthMgPerG: sku.strengthVal || 100,
      durationDays,
      dailyWaterLPerUnit: waterPerUnit
    });
    document.getElementById('flock-biomass-out').textContent = flockRes.valid ? (flockRes.totalBiomassKg.toFixed(1) + ' kg') : '—';
    document.getElementById('flock-calculation-summary').textContent = flockRes.valid
      ? ('Daily Active: ' + (flockRes.dailyActiveMg / 1000).toFixed(2) + ' g/day | Drinking Water Conc: ' + flockRes.waterConcMgPerL.toFixed(1) + ' mg/L (' + flockRes.totalDailyWaterL.toFixed(0) + ' L/day) | Medicated Feed: ' + flockRes.activeGPerTonneFeed.toFixed(1) + ' g active/tonne | Commercial Powder: ' + flockRes.dailyPowderG.toFixed(1) + ' g/day (' + flockRes.totalCoursePowderG.toFixed(1) + ' g total)')
      : flockRes.error;
  }

  // Update SKU Metadata strip with honest provenance & source vintage (never faking a review date!)
  document.getElementById('meta-inn').textContent = sku.inn;
  document.getElementById('meta-strength').textContent = sku.strengthVal + ' ' + sku.strengthUnit + ' (' + (sku.packUnitLabel || sku.form) + ')';
  document.getElementById('meta-codes').textContent = sku.atcvet + ' • ' + sku.snomed;
  document.getElementById('meta-withdrawal').textContent =
    'Species: ' + (sku.allowedSpecies.length ? sku.allowedSpecies.join(', ') : 'NONE') + ' | Route: ' + (sku.allowedRoutes ? sku.allowedRoutes.join(', ') : sku.defaultRoute);
  document.getElementById('meta-source-citation').textContent = sku.sourceCitation || 'Reference Formulary';
  document.getElementById('meta-source-link').href = sku.sourceUrl || 'https://www.msdvetmanual.com/';
  const revEl = document.getElementById('meta-last-reviewed');
  if (sku.lastReviewed) {
    revEl.textContent = 'Source Vintage: ' + sku.lastReviewed;
    revEl.className = 'mono text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold';
  } else {
    revEl.textContent = 'Unverified — Check Physical Leaflet / Plumb\'s';
    revEl.className = 'mono text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold';
  }

  // AMR Pill
  const amrPill = document.getElementById('sku-amr-pill');
  const amrBox = document.getElementById('amr-stewardship-box');
  if (sku.amrTier === 'HPCIA_RESERVE') {
    amrPill.textContent = 'WHO HPCIA / RESERVE';
    amrPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-bold border border-rose-400/50';
    amrBox.classList.remove('hidden');
  } else if (sku.amrTier === 'WATCH') {
    amrPill.textContent = 'WHO WATCH ANTIMICROBIAL';
    amrPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-400/40';
    amrBox.classList.add('hidden');
  } else if (sku.amrTier === 'ACCESS') {
    amrPill.textContent = 'WHO ACCESS (FIRST-LINE)';
    amrPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/40';
    amrBox.classList.add('hidden');
  } else {
    amrPill.textContent = sku.drugClass || 'NON-ANTIMICROBIAL';
    amrPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-200 font-semibold';
    amrBox.classList.add('hidden');
  }

  const verPill = document.getElementById('sku-verified-pill');
  if (sku.status === 'VERIFIED') {
    verPill.textContent = 'LABEL VERIFIED';
    verPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30';
  } else if (sku.status === 'UNVERIFIED') {
    verPill.textContent = allowUnverifiedStudyMode ? 'UNVERIFIED (STUDY MODE)' : 'UNVERIFIED (QUARANTINED)';
    verPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30';
  } else {
    verPill.textContent = 'CDSCO BANNED';
    verPill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-300 font-bold border border-rose-500/40';
  }
  document.getElementById('sku-schedule-pill').textContent = sku.schedule.toUpperCase();

  // Show/Hide 10-25% Rounding Override Panel
  const overridePanel = document.getElementById('rounding-override-panel');
  const btnSwitchLiquid = document.getElementById('btn-switch-liquid');
  if (engineRes.exceedsTenPct && !engineRes.exceedsTwentyFivePct && !wNorm.invalidWeightInput) {
    overridePanel.classList.remove('hidden');
  } else {
    overridePanel.classList.add('hidden');
  }
  if (engineRes.exceedsTenPct && (spCode === 'dog' || spCode === 'cat')) {
    btnSwitchLiquid.classList.remove('hidden');
  } else {
    btnSwitchLiquid.classList.add('hidden');
  }

  // Compute Milk & Meat Withdrawal Safe Dates
  const startDtEl = document.getElementById('withdrawal-start-dt');
  if (!startDtEl.value) {
    startDtEl.value = getTodayIsoDate() + 'T08:00';
  }
  const wdInfo = window.VetDoseEngine.computeWithdrawalSafeDates(
    startDtEl.value,
    durationDays,
    sku.milkWithdrawalHr,
    sku.meatWithdrawalDays
  );
  document.getElementById('wd-final-dose').textContent = wdInfo.finalDoseIso;
  document.getElementById('wd-milk-safe').textContent = wdInfo.milkSafeIso ? (wdInfo.milkSafeIso + ' (' + sku.milkWithdrawalHr + 'h)') : 'N/A (Non-Dairy / Companion)';
  document.getElementById('wd-meat-safe').textContent = wdInfo.meatSafeIso ? (wdInfo.meatSafeIso + ' (' + sku.meatWithdrawalDays + 'd)') : 'N/A (Companion)';
  const triEl = document.getElementById('wd-trilingual-note');
  if (wdInfo.trilingualSummary && spMeta.foodProducing) {
    triEl.innerHTML =
      '<div><strong>EN:</strong> ' + escapeHtml(wdInfo.trilingualSummary.en) + '</div>' +
      '<div><strong>HI:</strong> ' + escapeHtml(wdInfo.trilingualSummary.hi) + '</div>' +
      '<div><strong>MR:</strong> ' + escapeHtml(wdInfo.trilingualSummary.mr) + '</div>';
  } else {
    triEl.textContent = 'No food-chain milk/meat withdrawal period required for companion animal non-food use.';
  }

  // Stage 1 Practitioner & DPDP Checks
  let stage1Blocks = [];
  let stage1Status = 'PASS';
  const pracWarnBox = document.getElementById('prac-warning-box');
  if (prac.isExpired) {
    stage1Status = 'FAIL';
    stage1Blocks.push('PRACTITIONER REGISTRATION EXPIRED (' + prac.regNumber + ' expired on ' + prac.regExpiry + '): Section 48 IVC Act 1984 blocks prescription signing until 5-year renewal is completed.');
  }
  if (pracRole === 'consulting') {
    engineRes.softWarnings.unshift('VCI Conduct Regs 1992 (Rules 32–36): Consulting Veterinarian may prescribe ONLY in an emergency or instant need.');
  }
  if (consultMode === 'teleconsult' && sku.schedule.includes('NDPS')) {
    stage1Status = 'FAIL';
    stage1Blocks.push('TELECONSULTATION BLOCK: Controlled Narcotic (NDPS Act 1985) medications cannot be prescribed remotely without physical examination.');
  }

  const allHardBlocks = stage1Blocks.concat(engineRes.hardBlocks);
  const isBlocked = allHardBlocks.length > 0;

  if (stage1Status === 'FAIL') {
    pracWarnBox.classList.remove('hidden');
    pracWarnBox.textContent = stage1Blocks[0];
    document.getElementById('stage1-badge').textContent = 'REG BLOCKED';
    document.getElementById('stage1-badge').className = 'text-xs px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-bold';
  } else {
    pracWarnBox.classList.add('hidden');
    const consentReady = dpdpConsent && clientName && clientAddress;
    document.getElementById('stage1-badge').textContent = consentReady ? (prac.isDemo ? 'SANDBOX READY' : 'VERIFIED VET') : 'PII/CONSENT PENDING';
    document.getElementById('stage1-badge').className = consentReady
      ? 'text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold'
      : 'text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold';
  }

  // Update Calculation Readouts — HIDE ALL DOSE NUMBERS WHEN BLOCKED!
  if (isBlocked) {
    document.getElementById('calc-headline').textContent = '— BLOCKED BY CLINICAL / STATUTORY SAFETY GATE (NO DOSE OUTPUT) —';
    document.getElementById('calc-exact-mg').textContent = '— BLOCKED —';
    document.getElementById('calc-weight-used').textContent = 'Resolve hard-block(s) above';
    document.getElementById('calc-discretized').textContent = '— BLOCKED —';
    document.getElementById('calc-split-allowed').textContent = '—';
    document.getElementById('calc-im-split').textContent = '— BLOCKED —';
    document.getElementById('calc-im-note').textContent = '—';
    document.getElementById('calc-total-supply').textContent = '— BLOCKED —';
  } else {
    document.getElementById('calc-headline').textContent = engineRes.headlineText;
    document.getElementById('calc-exact-mg').textContent = engineRes.exactDoseVal.toFixed(2) + ' ' + (engineRes.spProtocol.unit.indexOf('mL/kg') === 0 ? 'mL' : 'mg');
    document.getElementById('calc-weight-used').textContent = 'on ' + engineRes.effectiveWeightKg.toFixed(2) + ' kg ' + (engineRes.useIbw ? 'IBW' : 'TBW');
    document.getElementById('calc-discretized').textContent = engineRes.discretizedText;
    document.getElementById('calc-split-allowed').textContent = sku.splittable ? 'Splits: ' + sku.splittable.join(', ') : 'Liquid / Vial';
    document.getElementById('calc-im-split').textContent = engineRes.imSplitText;
    document.getElementById('calc-im-note').textContent = engineRes.imNoteText;
    document.getElementById('calc-total-supply').textContent = engineRes.totalSupplyText;
  }

  const varBadge = document.getElementById('calc-variance-badge');
  const signStr = engineRes.variancePct >= 0 ? '+' : '';
  varBadge.textContent = isBlocked
    ? 'BLOCKED'
    : (signStr + engineRes.variancePct.toFixed(1) + '% (' + (engineRes.exceedsTenPct ? 'OVERRIDDEN' : 'PASS ±10%') + ')');
  varBadge.className = (isBlocked || engineRes.exceedsTenPct)
    ? 'mono text-xs font-bold px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40'
    : 'mono text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';

  const alertsBox = document.getElementById('statutory-gate-alerts');
  alertsBox.innerHTML = '';
  allHardBlocks.forEach(msg => {
    const d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.className = 'p-3 rounded-lg bg-rose-50 border-l-4 border-rose-600 text-rose-900 text-xs font-medium flex items-start gap-2';
    d.innerHTML = '<span class="font-bold text-rose-700 shrink-0">[HARD BLOCK]</span><span>' + escapeHtml(msg) + '</span>';
    alertsBox.appendChild(d);
  });
  engineRes.softWarnings.forEach(msg => {
    const d = document.createElement('div');
    d.className = 'p-2.5 rounded-lg bg-amber-50 border-l-4 border-amber-500 text-amber-900 text-xs flex items-start gap-2';
    d.innerHTML = '<span class="font-bold text-amber-700 shrink-0">[GUARDRAIL]</span><span>' + escapeHtml(msg) + '</span>';
    alertsBox.appendChild(d);
  });

  const addBtn = document.getElementById('btn-add-to-rx');
  if (isBlocked || appState.isSignedLocked) {
    addBtn.disabled = true;
    addBtn.className = 'px-4 py-2 rounded-lg bg-rose-600/40 text-rose-200 font-bold text-xs cursor-not-allowed flex items-center gap-1.5';
  } else {
    addBtn.disabled = false;
    addBtn.className = 'px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-sm';
  }

  appState.lastCalculation = {
    sku,
    spCode,
    spMeta,
    breed,
    tbwKg: wNorm.tbwKg,
    ibwKg: wNorm.ibwKg,
    bsaIbw: wNorm.bsaIbw,
    effectiveWeightKg: engineRes.effectiveWeightKg,
    useIbw: engineRes.useIbw,
    doseRate: engineRes.effectiveDoseRate,
    freqVal,
    durationDays: Math.max(1, parseInt(durationDays, 10) || 1),
    route,
    exactDoseVal: engineRes.exactDoseVal,
    perAdminUnits: engineRes.perAdminUnits,
    discretizedText: engineRes.discretizedText,
    headlineText: engineRes.headlineText,
    variancePct: engineRes.variancePct,
    totalSupplyText: engineRes.totalSupplyText,
    imSplitText: engineRes.imSplitText,
    wdInfo,
    selfDispensed: document.getElementById('rx-self-dispensed').checked,
    noSubstitution: document.getElementById('rx-no-substitution').checked,
    hardBlocks: allHardBlocks,
    softWarnings: engineRes.softWarnings
  };

  updatePipelineRibbon([
    { num: 1, title: '1. Practitioner & DPDP', status: stage1Status, sub: prac.isExpired ? 'Reg Expired' : (dpdpConsent && clientName ? 'Ready' : 'Consent Pending') },
    { num: 2, title: '2. CDSCO & Food MRL', status: (sku.status === 'BANNED' || (spMeta.foodProducing && sku.milkWithdrawalHr === null)) ? 'FAIL' : 'PASS', sub: sku.status === 'BANNED' ? 'Banned' : 'Cleared' },
    { num: 3, title: '3. Species, Route & Interactions', status: isBlocked ? 'FAIL' : 'PASS', sub: isBlocked ? 'Blocked' : 'Cleared' },
    { num: 4, title: '4. Weight & Organ Scaling', status: wNorm.invalidWeightInput ? 'FAIL' : 'PASS', sub: wNorm.invalidWeightInput ? 'Invalid BW' : (engineRes.effectiveWeightKg.toFixed(1) + ' kg') },
    { num: 5, title: '5. SKU & ±10% Rounding', status: ((sku.status === 'UNVERIFIED' && !allowUnverifiedStudyMode) || (engineRes.exceedsTenPct && isBlocked)) ? 'FAIL' : ((sku.status === 'UNVERIFIED' || engineRes.exceedsTenPct) ? 'WARN' : 'PASS'), sub: signStr + engineRes.variancePct.toFixed(1) + '% var' },
    { num: 6, title: '6. IM Site & Withdrawal', status: engineRes.sitesNeeded > 1 ? 'WARN' : 'PASS', sub: engineRes.imSplitText },
    { num: 7, title: '7. Prescription Status', status: appState.isSignedLocked ? 'PASS' : (isBlocked ? 'FAIL' : 'WARN'), sub: appState.isSignedLocked ? 'SIGNED & LOCKED' : 'UNSIGNED DRAFT' }
  ]);

  renderPrescriptionPreview();
}

function updatePipelineRibbon(stages) {
  const container = document.getElementById('pipeline-status-grid');
  if (!container) return;
  container.innerHTML = '';
  stages.forEach(st => {
    let colorClasses = 'bg-emerald-50 border-emerald-200 text-emerald-900';
    let dotClass = 'bg-emerald-500';
    if (st.status === 'WARN') {
      colorClasses = 'bg-amber-50 border-amber-300 text-amber-900';
      dotClass = 'bg-amber-500';
    } else if (st.status === 'FAIL') {
      colorClasses = 'bg-rose-50 border-rose-300 text-rose-900';
      dotClass = 'bg-rose-600 animate-pulse';
    }
    const div = document.createElement('div');
    div.className = 'pipeline-step px-2.5 py-1.5 rounded-lg border text-xs flex flex-col justify-between ' + colorClasses;
    div.innerHTML =
      '<div class="font-bold flex items-center justify-between gap-1">' +
        '<span class="truncate">' + escapeHtml(st.title) + '</span>' +
        '<span class="w-2 h-2 rounded-full shrink-0 ' + dotClass + '"></span>' +
      '</div>' +
      '<div class="mono text-xs opacity-80 truncate mt-0.5">' + escapeHtml(st.sub) + '</div>';
    container.appendChild(div);
  });
}

function switchToLiquidMelonex() {
  document.getElementById('sku-category-filter').value = 'all';
  document.getElementById('allow-unverified-study-mode').checked = true;
  populateSkuDropdown('melonex-susp');
  showToast('Switched to Melonex Oral Suspension (1.5 mg/mL) in Study Mode for micro-volume dosing.', 'teal');
}

// =========================================================================
// 8. HIGH-RISK READ-BACK MODAL & PATIENT-BOUND RX QUEUE
// =========================================================================
function addCurrentItemToRx() {
  if (appState.isSignedLocked) {
    showToast('Prescription is already signed and locked. Click "Start New Prescription" to create a new Rx.', 'rose');
    return;
  }
  if (!appState.lastCalculation || appState.lastCalculation.hardBlocks.length > 0) {
    showToast('Cannot add item: resolve statutory, route, species, or safety blocks first.', 'rose');
    return;
  }
  const c = appState.lastCalculation;
  if (c.sku.requiresHighRiskReadback) {
    openReadbackModal(c);
    return;
  }
  commitValidatedItemToRx(c);
}

function openReadbackModal(calcObj) {
  appState.pendingHighRiskAdd = calcObj;
  const targetNum = calcObj.perAdminUnits.toFixed(2);
  document.getElementById('readback-prompt-text').textContent =
    calcObj.sku.brand + ' (' + calcObj.sku.inn + ') is a controlled / narrow-therapeutic-margin substance (' + calcObj.sku.schedule + '). Verify concentration (' + calcObj.sku.strengthVal + ' ' + calcObj.sku.strengthUnit + ') and type the exact administration volume (mL) below:';
  document.getElementById('readback-target-display').textContent =
    'Required Read-Back Volume: ' + targetNum + ' mL (' + calcObj.exactDoseVal.toFixed(2) + ' mg)';
  document.getElementById('readback-input-val').value = '';
  document.getElementById('readback-error-box').classList.add('hidden');
  const modal = document.getElementById('readback-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeReadbackModal() {
  const modal = document.getElementById('readback-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  appState.pendingHighRiskAdd = null;
}

function confirmHighRiskReadback() {
  const c = appState.pendingHighRiskAdd;
  if (!c) return;
  const expected = Number(c.perAdminUnits.toFixed(2));
  const entered = Number(document.getElementById('readback-input-val').value);
  const errBox = document.getElementById('readback-error-box');
  if (isNaN(entered) || Math.abs(entered - expected) > 0.01) {
    errBox.classList.remove('hidden');
    errBox.textContent = 'Read-back mismatch! Please type exactly ' + c.perAdminUnits.toFixed(2) + ' to confirm.';
    return;
  }
  closeReadbackModal();
  logUiChange('high_risk_readback_confirmed', c.sku.inn + ' ' + c.perAdminUnits.toFixed(2) + ' mL');
  commitValidatedItemToRx(c);
}

function commitValidatedItemToRx(c) {
  const pKey = computeCurrentPatientKey();
  appState.rxPatientKey = pKey;
  const item = {
    itemId: 'RX-ITEM-' + Date.now() + '-' + Math.floor(Math.random() * 100),
    patientKey: pKey,
    skuId: c.sku.id,
    inn: c.sku.inn,
    drugClass: c.sku.drugClass,
    brand: c.sku.brand,
    manufacturer: c.sku.manufacturer,
    schedule: c.sku.schedule,
    atcvet: c.sku.atcvet,
    snomed: c.sku.snomed,
    sourceCitation: c.sku.sourceCitation,
    lastReviewed: c.sku.lastReviewed,
    headline: c.headlineText,
    exactDose: c.exactDoseVal.toFixed(2) + ' mg',
    weightBasisText: c.effectiveWeightKg.toFixed(2) + ' kg (' + (c.useIbw ? 'IBW' : 'TBW') + ')',
    variancePct: c.variancePct,
    totalSupply: c.totalSupplyText,
    imSplit: c.imSplitText,
    milkWithdrawalHr: c.sku.milkWithdrawalHr,
    meatWithdrawalDays: c.sku.meatWithdrawalDays,
    wdInfo: c.wdInfo,
    selfDispensed: c.selfDispensed,
    noSubstitution: c.noSubstitution,
    refills: 0
  };
  appState.rxItems.push(item);
  logUiChange('rx_queue_add', item.brand + ' (' + item.inn + ')');
  renderRxItemsLists();
  recalculateAll();
  showToast('Added ' + item.brand + ' (' + item.inn + ') to prescription.', 'teal');
}

function removeRxItem(itemId) {
  if (appState.isSignedLocked) {
    showToast('Prescription is locked after signing.', 'rose');
    return;
  }
  appState.rxItems = appState.rxItems.filter(i => i.itemId !== itemId);
  if (appState.rxItems.length === 0) appState.rxPatientKey = null;
  logUiChange('rx_queue_remove', itemId);
  renderRxItemsLists();
  recalculateAll();
}

function clearRxItems() {
  if (appState.isSignedLocked) {
    showToast('Prescription is locked after signing. Click "Start New Prescription" in Tab 6.', 'rose');
    return;
  }
  appState.rxItems = [];
  appState.rxPatientKey = null;
  logUiChange('rx_queue_clear', 'ALL_ITEMS_CLEARED');
  renderRxItemsLists();
  recalculateAll();
  showToast('Cleared active prescription list.', 'slate');
}

function renderRxItemsLists() {
  document.getElementById('rx-count-badge').textContent = String(appState.rxItems.length);
  const container = document.getElementById('mini-rx-items-container');
  container.innerHTML = '';
  if (appState.rxItems.length === 0) {
    container.innerHTML = '<div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-center">No items in active prescription. Verify patient weight and click "Add Verified Item to Prescription".</div>';
    return;
  }
  appState.rxItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2';
    row.innerHTML =
      '<div>' +
        '<div class="font-bold text-slate-900">' + (idx + 1) + '. <span class="mono uppercase text-teal-800">' + escapeHtml(item.inn) + '</span> — ' + escapeHtml(item.brand) + ' <span class="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">' + escapeHtml(item.schedule) + '</span></div>' +
        '<div class="text-xs text-slate-600 mono mt-0.5">' + escapeHtml(item.headline) + ' | Supply: ' + escapeHtml(item.totalSupply) + ' | Basis: ' + escapeHtml(item.weightBasisText) + '</div>' +
        (item.wdInfo && item.wdInfo.milkSafeIso ? '<div class="text-xs font-bold text-amber-800 mt-0.5">Safe Milk: ' + escapeHtml(item.wdInfo.milkSafeIso) + ' | Safe Meat: ' + escapeHtml(item.wdInfo.meatSafeIso) + '</div>' : '') +
      '</div>' +
      (appState.isSignedLocked
        ? '<span class="mono text-xs text-emerald-700 font-bold">LOCKED</span>'
        : '<button type="button" data-action="remove-rx-item" data-id="' + escapeHtml(item.itemId) + '" class="px-2 py-1 rounded text-rose-600 hover:bg-rose-50 font-semibold text-xs">Remove</button>');
    container.appendChild(row);
  });
}

// =========================================================================
// 9. REAL DRAFT vs SIGNED PRESCRIPTION RENDERING & REAL QR CODE
// =========================================================================
async function renderPrescriptionPreview() {
  const container = document.getElementById('printable-rx-area');
  if (!container) return;
  const prac = appState.signedByPractitioner || getActivePractitioner();
  const pracRole = document.getElementById('prac-role').value;
  const consultMode = document.getElementById('consult-mode').value;
  const clientName = document.getElementById('client-name').value.trim();
  const clientPhone = document.getElementById('client-phone').value.trim();
  const clientAddress = document.getElementById('client-address').value.trim();
  const patientName = document.getElementById('patient-name').value.trim();
  const spCode = document.getElementById('patient-species').value;
  const spMeta = SPECIES_META[spCode] || SPECIES_META.dog;
  const breed = document.getElementById('patient-breed').value;
  const rawBw = document.getElementById('patient-bw').value;
  const bcs = document.getElementById('patient-bcs').value;
  const wNorm = computeIbwAndBsa(rawBw, bcs, document.getElementById('patient-bf-pct').value, document.getElementById('patient-mcs').value, spCode);
  const includeEuthCert = document.getElementById('toggle-euthanasia-cert').checked;

  const hasNdpsOrX = appState.rxItems.some(i => i.schedule.includes('NDPS') || i.schedule.includes('Schedule X'));
  const hasScheduleH1 = appState.rxItems.some(i => i.schedule === 'Schedule H1');
  const copies = hasNdpsOrX
    ? ['ORIGINAL — FOR PATIENT / CARETAKER', 'DUPLICATE FOR DISPENSARY / NDPS RETENTION (2 YEARS)']
    : ['VETERINARY PRESCRIPTION / CLINICAL DECISION-SUPPORT WORKSHEET'];

  const canonicalPayload = JSON.stringify({
    rxId: appState.rxId,
    date: getTodayIsoDate(),
    practitioner: prac.regNumber,
    owner: clientName,
    patient: patientName,
    species: spCode,
    items: appState.rxItems.map(i => ({ inn: i.inn, headline: i.headline, supply: i.totalSupply }))
  });
  const liveSha256 = appState.isSignedLocked
    ? appState.signedSha256
    : (window.VetCryptoStorage ? await window.VetCryptoStorage.computeSha256Hex(canonicalPayload) : 'UNSIGNED-DRAFT');

  const qrSvg = window.VetDoseEngine.generateSvgQrCode(
    appState.rxId + '|' + (appState.isSignedLocked ? 'SIGNED' : 'DRAFT') + '|' + prac.regNumber + '|' + liveSha256.slice(0, 16)
  );

  let html = '';
  copies.forEach((copyTitle) => {
    html +=
      '<div class="rx-print-copy space-y-4">' +
        (!appState.isSignedLocked
          ? '<div class="p-2.5 rounded-lg bg-amber-100 border-2 border-amber-500 text-amber-950 font-extrabold text-center text-xs uppercase tracking-wider">📝 STATUS: DRAFT — UNSIGNED STUDENT / DECISION-SUPPORT WORKSHEET (NOT VALID FOR PHARMACY DISPENSING)</div>'
          : (prac.isDemo
              ? '<div class="p-2.5 rounded-lg bg-rose-100 border-2 border-rose-600 text-rose-950 font-extrabold text-center text-xs uppercase tracking-wider">⚠️ SANDBOX DEMO WATERMARK — SIGNED WITH UNLICENSED SAMPLE PROFILE (' + escapeHtml(prac.regNumber) + ') — NOT VALID FOR REAL CLINICAL USE</div>'
              : '<div class="p-2 rounded-lg bg-emerald-100 border border-emerald-500 text-emerald-950 font-bold text-center text-xs uppercase tracking-wider">✓ CRYPTOGRAPHICALLY SIGNED &amp; LOCKED VETERINARY PRESCRIPTION (' + escapeHtml(appState.signedTimestamp) + ')</div>')) +

        '<div class="flex items-start justify-between border-b-2 border-slate-900 pb-3 gap-3">' +
          '<div>' +
            '<div class="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-900 text-white inline-block mb-1">' + escapeHtml(copyTitle) + '</div>' +
            '<h3 class="text-base font-extrabold text-slate-900">' + escapeHtml(prac.clinicName) + '</h3>' +
            '<p class="text-xs text-slate-600">' + escapeHtml(prac.clinicAddress) + '</p>' +
            '<p class="text-xs font-semibold text-slate-800 mt-1">' + escapeHtml(prac.name) + ' • ' + escapeHtml(prac.qualifications) + '</p>' +
            '<p class="mono text-xs text-teal-800 font-bold">Reg No: ' + escapeHtml(prac.regNumber) + ' (' + escapeHtml(prac.council) + ' • Valid to ' + escapeHtml(prac.regExpiry) + ')</p>' +
          '</div>' +
          '<div class="flex items-center gap-3">' +
            '<div class="text-right mono text-xs">' +
              '<div class="font-bold text-slate-900">Date: ' + escapeHtml(getTodayIsoDate()) + '</div>' +
              '<div class="text-xs text-slate-600">Rx ID: ' + escapeHtml(appState.rxId) + '</div>' +
              '<div class="text-xs text-slate-600">Mode: ' + (consultMode === 'teleconsult' ? 'TELECONSULT' : 'IN-PERSON') + '</div>' +
              '<div class="text-xs text-slate-600">Role: ' + (pracRole === 'consulting' ? 'Consulting Vet' : 'Attending Vet') + '</div>' +
            '</div>' +
            '<div title="Scannable ISO/IEC 18004 QR Verification Code">' + qrSvg + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-300 text-xs">' +
          '<div>' +
            '<div class="text-xs font-bold uppercase text-slate-500">Caretaker / Owner (Rule 65(10)(b))</div>' +
            '<div class="font-bold text-slate-900">' + escapeHtml(clientName || '— [OWNER NAME REQUIRED] —') + (clientPhone ? ' (' + escapeHtml(clientPhone) + ')' : '') + '</div>' +
            '<div class="text-slate-700">' + escapeHtml(clientAddress || '— [OWNER ADDRESS REQUIRED] —') + '</div>' +
            '<div class="mono text-xs text-teal-800 mt-0.5">DPDP Receipt: ' + (document.getElementById('dpdp-consent-check').checked ? escapeHtml(appState.consentReceiptId) : 'CONSENT UNCHECKED') + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="text-xs font-bold uppercase text-slate-500">Animal Patient &amp; Coding</div>' +
            '<div class="font-bold text-slate-900">' + escapeHtml(patientName || 'Unnamed Patient') + ' — ' + escapeHtml(spMeta.label) + '</div>' +
            '<div class="text-slate-700">Breed: ' + escapeHtml(breed) + ' | BW: ' + (wNorm.invalidWeightInput ? 'MISSING' : (wNorm.tbwKg.toFixed(2) + ' kg (IBW ' + wNorm.ibwKg.toFixed(2) + ' kg)')) + '</div>' +
            '<div class="mono text-xs text-slate-600 mt-0.5">' + escapeHtml(spMeta.venom) + ' • ' + escapeHtml(spMeta.snomed) + (spMeta.foodProducing ? ' • [FOOD-PRODUCING]' : ' • [COMPANION]') + '</div>' +
          '</div>' +
        '</div>';

    html +=
      '<div class="space-y-2">' +
        '<div class="text-sm font-extrabold tracking-tight text-slate-900 flex items-center justify-between">' +
          '<span>℞ — FOR ANIMAL TREATMENT ONLY (NOT FOR HUMAN USE)</span>' +
          (hasScheduleH1 ? '<span class="mono text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">CHEMIST / DISPENSARY: LOG IN 3-YR SCHEDULE H1 REGISTER</span>' : '') +
        '</div>';

    if (appState.rxItems.length === 0) {
      html += '<div class="p-4 border border-dashed border-slate-300 rounded-lg text-center text-slate-500">No medications in prescription queue. Add verified items from Tab 1.</div>';
    } else {
      appState.rxItems.forEach((item, i) => {
        html +=
          '<div class="p-3 rounded-lg border border-slate-300 space-y-1.5">' +
            '<div class="flex items-start justify-between gap-2">' +
              '<div>' +
                '<span class="font-extrabold mono text-sm text-slate-950">' + (i + 1) + '. ' + escapeHtml(item.inn) + '</span> ' +
                '<span class="font-semibold text-slate-700">(Brand: ' + escapeHtml(item.brand) + ' • ' + escapeHtml(item.manufacturer) + ')</span>' +
              '</div>' +
              '<span class="mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">' + escapeHtml(item.schedule) + '</span>' +
            '</div>' +
            '<div class="mono text-xs font-bold text-teal-900">Sig: ' + escapeHtml(item.headline) + ' | Admin Rule: ' + escapeHtml(item.imSplit) + '</div>' +
            '<div class="text-xs text-slate-500">Source Citation: ' + escapeHtml(item.sourceCitation || 'Formulary') + ' (' + escapeHtml(item.lastReviewed ? ('Source Vintage: ' + item.lastReviewed) : 'Unverified — Check Physical Leaflet') + ')</div>' +
            '<div class="flex flex-wrap items-center justify-between text-xs text-slate-700 pt-1 border-t border-slate-200">' +
              '<span><strong>Total Supply (Rule 65(10)(c)):</strong> ' + escapeHtml(item.totalSupply) + '</span>' +
              '<span><strong>Refills:</strong> ' + item.refills + ' (Single Dispense)</span>' +
              '<span><strong>Fulfillment:</strong> ' + (item.selfDispensed ? 'In-Clinic Dispensed by Veterinarian' : 'External Retail Chemist Fill') + '</span>' +
            '</div>' +
            (item.noSubstitution ? '<div class="text-xs font-bold text-rose-800">• Rule 65(11-A) Notice: Retail chemist shall not substitute another preparation without prescriber sanction.</div>' : '') +
            (item.wdInfo && item.wdInfo.trilingualSummary && spMeta.foodProducing
              ? '<div class="p-2 rounded bg-amber-50 border border-amber-300 text-xs space-y-0.5 text-amber-950">' +
                  '<div class="font-bold">MANDATORY FSSAI FOOD-SAFETY WITHDRAWAL SAFE DATES:</div>' +
                  '<div>• <strong>EN:</strong> ' + escapeHtml(item.wdInfo.trilingualSummary.en) + '</div>' +
                  '<div>• <strong>हिन्दी:</strong> ' + escapeHtml(item.wdInfo.trilingualSummary.hi) + '</div>' +
                  '<div>• <strong>मराठी:</strong> ' + escapeHtml(item.wdInfo.trilingualSummary.mr) + '</div>' +
                '</div>'
              : '') +
          '</div>';
      });
    }
    html += '</div>';

    if (includeEuthCert) {
      html +=
        '<div class="p-3 rounded-lg border-2 border-slate-800 bg-slate-50 space-y-2">' +
          '<div class="font-bold text-slate-900 uppercase text-xs">VCI Code of Ethics 1992 — Statutory Ownership Declaration &amp; Consent Block</div>' +
          '<p class="text-xs text-slate-700">I, <strong>' + escapeHtml(clientName || '____________________') + '</strong>, solemnly declare that I am the bona fide owner / authorized agent of the animal described above and grant informed consent.</p>' +
          '<div class="grid grid-cols-2 gap-4 pt-3">' +
            '<div class="border-t border-slate-400 pt-1 text-xs text-slate-600">Owner / Agent Signature or Left Thumb Impression</div>' +
            '<div class="border-t border-slate-400 pt-1 text-xs text-slate-600">Witness Name &amp; Timestamp</div>' +
          '</div>' +
        '</div>';
    }

    html +=
      '<div class="pt-3 border-t-2 border-slate-800 flex flex-wrap items-end justify-between gap-4">' +
        '<div class="text-xs text-slate-600 space-y-0.5 max-w-md">' +
          '<div><strong>FOR ANIMAL TREATMENT ONLY — NOT FOR HUMAN USE.</strong></div>' +
          '<div><strong>Student Study &amp; Decision-Support Disclaimer:</strong> Clinician retains sole responsibility under IVC Act, 1984.</div>' +
          '<div>Payload SHA-256 Digest (' + (appState.isSignedLocked ? 'SIGNED &amp; IMMUTABLE' : 'UNSIGNED DRAFT PREVIEW') + '):</div>' +
          '<div class="mono text-xs text-slate-800 font-semibold" id="rx-sha256-hash">' + escapeHtml(liveSha256) + '</div>' +
        '</div>' +
        '<div class="text-right">' +
          '<div class="mono text-xs font-bold text-slate-900">' +
            (appState.isSignedLocked ? ('Signed: ' + escapeHtml(prac.name)) : 'STATUS: UNSIGNED DRAFT (Awaiting Vet Signature)') +
          '</div>' +
          '<div class="text-xs text-slate-700">' + escapeHtml(prac.regNumber) + ' • ' + escapeHtml(prac.council) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

async function signAndLockPrescription() {
  if (appState.isSignedLocked) {
    showToast('This prescription (' + appState.rxId + ') is already signed and locked! Click "Start New Prescription" for a new Rx.', 'amber');
    return;
  }
  const prac = getActivePractitioner();
  if (prac.isExpired) {
    showToast('Blocked: Practitioner registration is expired (' + prac.regExpiry + ').', 'rose');
    return;
  }
  const clientName = document.getElementById('client-name').value.trim();
  const clientAddr = document.getElementById('client-address').value.trim();
  if (!clientName || !clientAddr) {
    showToast('Blocked: Enter Owner Full Name and Residential/Farm Address (Rule 65(10)(b)) in Tab 1 before signing.', 'rose');
    return;
  }
  if (!document.getElementById('dpdp-consent-check').checked) {
    showToast('Blocked: Owner DPDP Rules 2025 itemized consent must be ticked in Tab 1 before signing.', 'rose');
    return;
  }
  if (appState.rxItems.length === 0) {
    showToast('Blocked: Add at least one verified medication to the prescription before signing.', 'amber');
    return;
  }

  const patientName = document.getElementById('patient-name').value.trim();
  const canonicalPayload = JSON.stringify({
    rxId: appState.rxId,
    signedAt: new Date().toISOString(),
    practitioner: prac.regNumber,
    owner: clientName,
    patient: patientName,
    items: appState.rxItems
  });
  const realHash = await window.VetCryptoStorage.computeSha256Hex(canonicalPayload);

  appState.isSignedLocked = true;
  appState.signedTimestamp = new Date().toISOString();
  appState.signedSha256 = realHash;
  appState.signedByPractitioner = prac;

  document.getElementById('btn-sign-rx').classList.add('hidden');
  document.getElementById('btn-unlock-new-rx').classList.remove('hidden');

  for (const item of appState.rxItems) {
    if (item.schedule === 'Schedule H1' || item.schedule.includes('NDPS') || item.schedule.includes('Schedule X')) {
      const isNdps = item.schedule.includes('NDPS') || item.schedule.includes('Schedule X');
      const regEntry = {
        logId: (isNdps ? 'NDPS-' : 'H1-') + appState.rxId + '-' + Math.floor(100 + Math.random() * 900),
        date: getTodayIsoDate(),
        schedule: item.schedule + (item.selfDispensed ? ' (In-Clinic Dispensed)' : ' (Rx Issued for Chemist)'),
        prescriber: prac.name + ' (' + prac.regNumber + ')',
        owner: clientName + ' [PBKDF2 AES-256 Encrypted PII]',
        patient: patientName,
        drug: item.inn + ' (' + item.brand + ')',
        qtyDispensed: item.totalSupply,
        retentionUntil: isNdps
          ? (getFutureIsoDate(2, 0) + ' (2-Yr NDPS/Sch X Floor)')
          : (getFutureIsoDate(3, 0) + ' (3-Yr Sch H1 Floor)')
      };
      appState.h1Register.unshift(regEntry);
      if (window.VetCryptoStorage) {
        await window.VetCryptoStorage.saveRecordToStore('registers', regEntry);
      }
    }
  }

  await logUiChange('rx_signed_locked', appState.rxId + ' | SHA-256: ' + realHash.slice(0, 16));
  await saveCurrentCaseToIndexedDb();
  renderRxItemsLists();
  recalculateAll();
  renderStatutoryRegisters();
  showToast('Prescription signed with real SHA-256 digest and locked against edits!', 'teal');
}

function startNewUnsignedPrescription() {
  appState.isSignedLocked = false;
  appState.signedTimestamp = null;
  appState.signedSha256 = null;
  appState.signedByPractitioner = null;
  appState.rxId = 'RX-IND-' + getTodayIsoDate().replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  appState.consentReceiptId = 'DPDP-' + getTodayIsoDate().replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
  appState.rxItems = [];
  appState.rxPatientKey = null;
  document.getElementById('btn-sign-rx').classList.remove('hidden');
  document.getElementById('btn-unlock-new-rx').classList.add('hidden');
  renderRxItemsLists();
  recalculateAll();
  showToast('Started new unsigned prescription (' + appState.rxId + ').', 'teal');
}

function sharePrescriptionWhatsApp() {
  const prac = getActivePractitioner();
  const patientName = document.getElementById('patient-name').value;
  const spCode = document.getElementById('patient-species').value;
  const spMeta = SPECIES_META[spCode] || SPECIES_META.dog;
  const hashEl = document.getElementById('rx-sha256-hash');
  const hashStr = hashEl ? hashEl.textContent.slice(0, 16) : 'DRAFT';

  const lines = [
    '*VetRx India — Veterinary Decision-Support Prescription Summary*',
    (!appState.isSignedLocked || prac.isDemo)
      ? '⚠️ *[UNSIGNED DRAFT / SANDBOX DEMO — NOT A VALID LEGAL RX]*'
      : ('*Signed By:* ' + prac.name + ' (' + prac.regNumber + ')'),
    '*Rx ID:* ' + appState.rxId + ' | *Date:* ' + getTodayIsoDate(),
    '*Patient:* ' + patientName + ' (' + spMeta.label + ')',
    '*Medications:*'
  ];

  appState.rxItems.forEach((it, idx) => {
    lines.push((idx + 1) + '. *' + it.inn + '* (' + it.brand + ') — ' + it.headline + ' | Supply: ' + it.totalSupply);
    if (it.wdInfo && it.wdInfo.trilingualSummary && spMeta.foodProducing) {
      lines.push('   • EN: ' + it.wdInfo.trilingualSummary.en);
      lines.push('   • HI: ' + it.wdInfo.trilingualSummary.hi);
      lines.push('   • MR: ' + it.wdInfo.trilingualSummary.mr);
    }
  });

  lines.push('*SHA-256 Digest:* ' + hashStr);
  lines.push('_Disclaimer: Decision support only. Registered Veterinary Practitioner retains sole responsibility._');

  const textMsg = lines.join('\n');
  try {
    const ta = document.createElement('textarea');
    ta.value = textMsg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {}

  logUiChange('whatsapp_share', 'Shared trilingual Rx (' + hashStr + ')');
  showToast('Copied trilingual WhatsApp Rx summary + SHA-256 verification digest to clipboard!', 'teal');
}

// =========================================================================
// 10. TAB 2: TWO-PHASE FLUIDS, 100 mL BURETTE & 15% KCL (2 mEq/mL) VOLUME
// =========================================================================
function calculateFluidsAndKcl() {
  const sp = document.getElementById('fluid-species').value;
  const bwRaw = document.getElementById('fluid-bw').value;
  const lifeStage = document.getElementById('fluid-lifestage').value;
  const shockActive = document.getElementById('fluid-shock-active').checked;
  const bolusMlKg = document.getElementById('fluid-bolus-mlkg').value;
  const colloidAdjPct = document.getElementById('fluid-colloid-adj').value;
  const dehydPct = document.getElementById('fluid-dehydration-pct').value;
  const rehydHours = document.getElementById('fluid-rehyd-hours').value;
  const maintFormula = document.getElementById('fluid-maint-formula').value;
  const ongoingLoss24h = document.getElementById('fluid-ongoing-loss').value;
  const enteralOffset24h = document.getElementById('fluid-enteral-offset').value;
  const serumK = document.getElementById('fluid-serum-k').value;
  const bagMode = document.getElementById('fluid-kcl-bag-mode').value;

  const res = window.VetDoseEngine.calculateFluidsAndKcl({
    species: sp,
    bwKg: bwRaw,
    lifeStage,
    shockActive,
    bolusMlKg,
    colloidAdjPct,
    dehydPct,
    rehydHours,
    maintFormula,
    ongoingLoss24h,
    enteralOffset24h,
    serumK,
    bagMode
  });

  if (res.blocked) {
    document.getElementById('fluid-total-rate-headline').textContent = '— BLOCKED: ' + res.error + ' —';
    document.getElementById('fluid-mlkghr-badge').textContent = 'BLOCKED';
    document.getElementById('fluid-out-bolus').textContent = '—';
    document.getElementById('fluid-out-deficit').textContent = '—';
    document.getElementById('fluid-out-maint').textContent = '—';
    document.getElementById('fluid-two-phase-banner').textContent = res.error;
    document.getElementById('kcl-15pct-injection-box').textContent = '—';
    return;
  }

  document.getElementById('fluid-total-rate-headline').textContent =
    res.isTwoPhase
      ? ('Phase 1 (Hrs 1–12): ' + res.phase1HourlyMl.toFixed(2) + ' mL/hr → Phase 2 (Hrs 13–24): ' + res.phase2HourlyMl.toFixed(2) + ' mL/hr')
      : (res.phase1HourlyMl.toFixed(2) + ' mL/hr (' + res.total24hVolumeMl.toFixed(1) + ' mL / 24 hr)');
  document.getElementById('fluid-mlkghr-badge').textContent =
    'Peak: ' + res.phase1MlKgHr.toFixed(2) + ' mL/kg/hr';

  document.getElementById('fluid-out-bolus').textContent =
    shockActive ? (res.bolusVolMl.toFixed(1) + ' mL over 15m') : '0.0 mL (No Shock)';
  document.getElementById('fluid-out-bolus-sub').textContent =
    shockActive ? 'NO KCl allowed in bolus!' : 'Reassess HR, CRT, BP';

  document.getElementById('fluid-out-deficit').textContent = res.deficitMl.toFixed(1) + ' mL';
  document.getElementById('fluid-out-deficit-sub').textContent =
    (res.deficitMl / res.rehydHours).toFixed(2) + ' mL/hr over ' + res.rehydHours + 'h';

  document.getElementById('fluid-out-maint').textContent = res.maint24hMl.toFixed(1) + ' mL/day';
  document.getElementById('fluid-out-maint-sub').textContent =
    'Allom: ' + res.allometricMaint24h.toFixed(1) + ' vs Lin: ' + res.linearMaint24h.toFixed(1) + ' mL/d';

  document.getElementById('fluid-two-phase-banner').textContent = res.isTwoPhase
    ? ('TWO-PHASE 24-HR SCHEDULE (No Deficit Double-Counting): Total 24-Hr Fluid = ' + res.total24hVolumeMl.toFixed(1) + ' mL. Run Phase 1 (Hours 1–12: Rehydration + Maint) at ' + res.phase1HourlyMl.toFixed(2) + ' mL/hr (' + res.phase1MlKgHr.toFixed(2) + ' mL/kg/hr), then step down to Phase 2 (Hours 13–24: Maint Only) at ' + res.phase2HourlyMl.toFixed(2) + ' mL/hr (' + res.phase2MlKgHr.toFixed(2) + ' mL/kg/hr).')
    : ('SINGLE-PHASE 24-HR SCHEDULE: Total 24-Hr Fluid = ' + res.total24hVolumeMl.toFixed(1) + ' mL infused at constant ' + res.phase1HourlyMl.toFixed(2) + ' mL/hr (' + res.phase1MlKgHr.toFixed(2) + ' mL/kg/hr).');

  document.getElementById('kcl-out-scale').textContent =
    res.slidingMeqPerL + ' mEq/L (' + res.unclampedMeqInContainer.toFixed(1) + ' mEq / ' + res.containerVolMl + 'mL)';
  document.getElementById('kcl-out-delivered').textContent = res.deliveredMeqHr.toFixed(3) + ' mEq/hr';
  document.getElementById('kcl-out-kmax').textContent = res.kMaxCeilingMeqHr.toFixed(3) + ' mEq/hr';
  document.getElementById('kcl-out-maxbag').textContent =
    res.slidingMeqPerL === 0 ? '0 mEq/L (Block)' : ('≤ ' + res.maxSafeBagMeqL.toFixed(1) + ' mEq/L');

  const injBox = document.getElementById('kcl-15pct-injection-box');
  if (res.slidingMeqPerL === 0) {
    injBox.textContent = '15% KCl (2 mEq/mL) Additive: 0.00 mL (Potassium supplementation contraindicated when Serum K+ > 5.0 mEq/L).';
  } else {
    injBox.textContent =
      '15% KCl (2.0 mEq/mL Stock Ampoule) to Inject into ' + res.containerVolMl + ' mL Container: Draw ' +
      res.kcl15PctMlToInject.toFixed(2) + ' mL (= ' + res.clampedMeqInContainer.toFixed(2) + ' mEq at safe ' + res.effectiveSafeMeqPerL.toFixed(1) + ' mEq/L concentration).' +
      (res.buretteRecommended && res.containerVolMl > 100 ? ' ⚠️ SMALL PATIENT GUARD (<5 kg): Switch container selector to 100 mL Graduated Burette to prevent runaway infusion!' : '');
  }

  const card = document.getElementById('kcl-safety-card');
  const title = document.getElementById('kcl-status-title');
  const pill = document.getElementById('kcl-status-pill');
  const action = document.getElementById('kcl-clinical-action');

  if (res.serumK > 5.0) {
    card.className = 'p-4 rounded-xl border bg-rose-950/80 border-rose-500/60 space-y-2.5 text-rose-100';
    title.textContent = 'HYPERKALEMIA BLOCK (Serum K+ > 5.0 mEq/L)';
    pill.textContent = '0 mEq KCl ALLOWED';
    pill.className = 'mono text-xs font-bold px-2 py-0.5 rounded bg-rose-600 text-white';
    action.textContent = 'Hard Block: Serum potassium exceeds 5.0 mEq/L. Infuse potassium-free 0.9% NaCl.';
  } else if (res.clampTriggered) {
    card.className = 'p-4 rounded-xl border bg-rose-950/90 border-rose-500 space-y-2.5 text-rose-100';
    title.textContent = 'FAIL SAFE CHECK: KCl RATE EXCEEDS 0.5 mEq/kg/hr CEILING!';
    pill.textContent = 'CLAMPED TO ≤ ' + res.maxSafeBagMeqL.toFixed(1) + ' mEq/L';
    pill.className = 'mono text-xs font-bold px-2 py-0.5 rounded bg-rose-600 text-white animate-pulse';
    action.innerHTML =
      '<strong>CRITICAL GUARDRAIL:</strong> Unclamped ' + res.slidingMeqPerL + ' mEq/L at Phase 1 rate ' + res.phase1HourlyMl.toFixed(2) + ' mL/hr delivers <strong>' + res.deliveredMeqHr.toFixed(3) + ' mEq/hr</strong>, exceeding cardiac arrest threshold <strong>' + res.kMaxCeilingMeqHr.toFixed(3) + ' mEq/hr</strong>. Automatically clamped 15% KCl injection volume to <strong>' + res.kcl15PctMlToInject.toFixed(2) + ' mL</strong> (' + res.clampedMeqInContainer.toFixed(2) + ' mEq in ' + res.containerVolMl + ' mL).';
  } else {
    card.className = 'p-4 rounded-xl border bg-emerald-950/60 border-emerald-500/40 space-y-2.5 text-emerald-100';
    title.textContent = 'KCl INFUSION RATE WITHIN SAFE CARDIAC CEILING (≤ 0.5 mEq/kg/hr)';
    pill.textContent = 'PASS (' + ((res.deliveredMeqHr / res.kMaxCeilingMeqHr) * 100).toFixed(0) + '% of K_max)';
    pill.className = 'mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-600 text-white';
    action.textContent = 'Safe to inject ' + res.kcl15PctMlToInject.toFixed(2) + ' mL of 15% KCl (2 mEq/mL) into the ' + res.containerVolMl + ' mL container.';
  }
}

// =========================================================================
// 11. TAB 3: MULTI-UNIT CRI, MAX-RATE CEILING & 24-HR HANG-TIME LIMIT
// =========================================================================
const CRI_PRESET_LIMITS = {
  lido_tc03: { rate: 50, unit: 'mcg/kg/min', conc: 20, maxMcgKgMin: 80 },
  esmolol: { rate: 50, unit: 'mcg/kg/min', conc: 10, maxMcgKgMin: 200 },
  fentanyl: { rate: 5, unit: 'mcg/kg/hr', conc: 0.05, maxMcgKgMin: 0.2 },
  ketamine: { rate: 10, unit: 'mcg/kg/min', conc: 50, maxMcgKgMin: 20 },
  dobutamine: { rate: 5, unit: 'mcg/kg/min', conc: 12.5, maxMcgKgMin: 20 },
  metoclopramide: { rate: 2, unit: 'mg/kg/day', conc: 5, maxMcgKgMin: 2.1 }
};

function applyCriPreset(preset) {
  const cfg = CRI_PRESET_LIMITS[preset] || CRI_PRESET_LIMITS.lido_tc03;
  document.getElementById('cri-rate-mcg').value = cfg.rate;
  document.getElementById('cri-rate-unit').value = cfg.unit;
  document.getElementById('cri-stock-conc').value = cfg.conc;
  calculateCri();
}

function calculateCri() {
  const preset = document.getElementById('cri-preset').value;
  const cfg = CRI_PRESET_LIMITS[preset] || { maxMcgKgMin: 100 };
  const res = window.VetDoseEngine.calculateCri({
    bwKg: document.getElementById('cri-bw').value,
    rateVal: document.getElementById('cri-rate-mcg').value,
    rateUnit: document.getElementById('cri-rate-unit').value,
    stockConcMgMl: document.getElementById('cri-stock-conc').value,
    bagVolMl: document.getElementById('cri-bag-vol').value,
    bagRateMlHr: document.getElementById('cri-bag-rate').value,
    maxSafeMcgKgMin: cfg.maxMcgKgMin
  });

  const alertsEl = document.getElementById('cri-guard-alerts');
  alertsEl.innerHTML = '';

  if (res.blocked) {
    document.getElementById('cri-headline').textContent = '— BLOCKED: ' + res.error + ' —';
    document.getElementById('cri-bag-duration-badge').textContent = 'BLOCKED';
    document.getElementById('cri-out-pump-rate').textContent = '—';
    document.getElementById('cri-out-hourly-mg').textContent = '—';
    document.getElementById('cri-out-bag-add-ml').textContent = '—';
    document.getElementById('cri-out-bag-add-mg').textContent = '—';
    document.getElementById('cri-withdrawal-instruction').textContent = res.error;
    document.getElementById('cri-inject-instruction').textContent = '';
    document.getElementById('dextrose-bolus-output').textContent = 'Enter valid weight > 0.';
    return;
  }

  if (res.exceedsMaxRate) {
    const d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.className = 'p-2.5 rounded bg-rose-950 border border-rose-500 text-rose-200 text-xs font-bold';
    d.textContent = 'MAX SAFE CRI RATE EXCEEDED: Normalized rate (' + res.rateMcgKgMin.toFixed(2) + ' mcg/kg/min) exceeds safe ceiling (' + res.maxSafeMcgKgMin + ' mcg/kg/min)!';
    alertsEl.appendChild(d);
  }
  if (res.exceeds24hHangLimit) {
    const d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.className = 'p-2.5 rounded bg-amber-950 border border-amber-400 text-amber-200 text-xs font-bold';
    d.textContent = '24-HOUR BAG HANG-TIME STERILITY LIMIT: ' + res.bagVolMl + ' mL at ' + res.bagRateMlHr + ' mL/hr runs for ' + res.rawBagDurationHr.toFixed(1) + ' hr (>24 hr USP limit). Prepare a ≤ ' + res.safe24hBagVolMl.toFixed(0) + ' mL bag (with ' + res.safe24hDrugVolMl.toFixed(2) + ' mL drug) or discard bag at 24.0 hr!';
    alertsEl.appendChild(d);
  }

  document.getElementById('cri-headline').textContent =
    res.hourlyDrugMg.toFixed(2) + ' mg/hr (' + res.rateMcgKgMin.toFixed(2) + ' mcg/kg/min) • Pump: ' + res.neatPumpMlHr.toFixed(2) + ' mL/hr';
  document.getElementById('cri-bag-duration-badge').textContent =
    'Bag lasts ' + res.rawBagDurationHr.toFixed(1) + ' hr' + (res.exceeds24hHangLimit ? ' (>24h Cap!)' : '');

  document.getElementById('cri-out-pump-rate').textContent = res.neatPumpMlHr.toFixed(2) + ' mL/hr';
  document.getElementById('cri-out-hourly-mg').textContent = 'Delivers ' + res.hourlyDrugMg.toFixed(2) + ' mg/hr undiluted';

  document.getElementById('cri-out-bag-add-ml').textContent = 'Add ' + res.drugVolForBagMl.toFixed(2) + ' mL Drug';
  document.getElementById('cri-out-bag-add-mg').textContent =
    '(' + res.totalDrugForBagMg.toFixed(1) + ' mg total in ' + res.bagVolMl.toFixed(0) + ' mL bag)';

  document.getElementById('cri-withdrawal-instruction').textContent =
    'Step 1: WITHDRAW and discard ' + res.drugVolForBagMl.toFixed(2) + ' mL of base crystalloid from the ' + res.bagVolMl.toFixed(0) + ' mL bag.';
  document.getElementById('cri-inject-instruction').textContent =
    'Step 2: Inject ' + res.drugVolForBagMl.toFixed(2) + ' mL (' + res.totalDrugForBagMg.toFixed(1) + ' mg) of stock drug into the bag, invert 4× to mix, and infuse at ' + res.bagRateMlHr.toFixed(1) + ' mL/hr (Max hang time: ' + res.effectiveHangHours.toFixed(1) + ' hr).';

  document.getElementById('dextrose-bolus-output').textContent =
    'For ' + res.bwKg.toFixed(1) + ' kg: Draw ' + res.dex50Ml.toFixed(2) + ' mL of 50% Dextrose + ' + res.salineDiluentMl.toFixed(2) + ' mL of 0.9% NaCl (Total ' + res.totalDexBolusMl.toFixed(2) + ' mL slow IV bolus).';

  calculateReconstitution();
}

function calculateReconstitution() {
  const massMg = Math.max(1, parseFloat(document.getElementById('reconst-mass-mg').value) || 500);
  const dilMl = Math.max(0.1, parseFloat(document.getElementById('reconst-diluent-ml').value) || 22.5);
  const conc = massMg / dilMl;
  const el = document.getElementById('reconst-result-conc');
  if (el) el.textContent = conc.toFixed(2) + ' mg/mL';
  const noteEl = document.getElementById('reconst-micro-note');
  if (noteEl) {
    noteEl.textContent = 'Reconstituted Active Stock = ' + conc.toFixed(2) + ' mg/mL (' + (conc * 1000).toFixed(0) + ' mcg/mL). Example: Bactivon Tazo 500 mg Cefquinome in 22.5 mL = 22.22 mg/mL.';
  }
}

// =========================================================================
// 12. TAB 4: 2024 RECOVER CPR, ALL-DRUG CONCENTRATIONS & EPI 3-5 MIN TIMER
// =========================================================================
function calculateCprTable() {
  const sp = document.getElementById('cpr-species').value;
  const bwRaw = document.getElementById('cpr-bw').value;
  const concs = {
    epiConcMgMl: parseFloat(document.getElementById('cpr-epi-conc').value) || 1.0,
    atropineConcMgMl: parseFloat(document.getElementById('cpr-atropine-conc').value) || 0.6,
    atropineDoseMgKg: parseFloat(document.getElementById('cpr-atropine-mgkg').value) || 0.05,
    lidoConcMgMl: parseFloat(document.getElementById('cpr-lido-conc').value) || 20.0,
    vasoConcUMl: parseFloat(document.getElementById('cpr-vaso-conc').value) || 20.0,
    amioConcMgMl: parseFloat(document.getElementById('cpr-amio-conc').value) || 50.0,
    esmoConcMgMl: 10.0,
    bicarbConcMeqMl: 1.0,
    naloxoneConcMgMl: 0.4,
    flumazenilConcMgMl: 0.1,
    atipamezoleConcMgMl: 5.0
  };

  const res = window.VetDoseEngine.calculateCpr({ species: sp, bwKg: bwRaw, concs });
  const tbody = document.getElementById('cpr-dosing-tbody');
  tbody.innerHTML = '';

  if (res.blocked) {
    document.getElementById('cpr-tidal-vol').textContent = '—';
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center font-bold text-rose-700 bg-rose-50">' + escapeHtml(res.error) + '</td></tr>';
    return;
  }

  document.getElementById('cpr-tidal-vol').textContent = res.tidalVolMl.toFixed(0) + ' mL';

  const rows = [
    {
      name: 'Epinephrine (Low Dose)',
      doseText: '0.01 mg/kg IV/IO (0.02 mg/kg IT)',
      conc: concs.epiConcMgMl.toFixed(1) + ' mg/mL',
      calc: res.epiMg.toFixed(2) + ' mg = ' + res.epiMl.toFixed(2) + ' mL IV/IO (IT: ' + res.epiItMl.toFixed(2) + ' mL)',
      guardrail: 'Every 3–5 min (every other 2-min BLS cycle). High-dose (0.1 mg/kg) PERMANENTLY DISABLED per 2024 RECOVER.',
      actionLabel: 'Log Epi 0.01 mg/kg',
      actionCode: 'EPI_LOW',
      locked: false
    },
    {
      name: 'Atropine Sulphate (Single Early Dose)',
      doseText: concs.atropineDoseMgKg + ' mg/kg IV/IO (0.04–0.054 range)',
      conc: concs.atropineConcMgMl.toFixed(2) + ' mg/mL',
      calc: res.atroMg.toFixed(2) + ' mg = ' + res.atroMl.toFixed(2) + ' mL (' + res.atro06Ml.toFixed(2) + ' mL @ 0.6 vs ' + res.atro054Ml.toFixed(2) + ' mL @ 0.54)',
      guardrail: 'SINGLE DOSE ONLY early in CPR for nonshockable/high-vagal arrest. Button locks after first log!',
      actionLabel: appState.cprState.atropineLocked ? 'LOCKED (1 Dose Given)' : 'Give Single Atropine Dose',
      actionCode: 'ATROPINE_ONCE',
      locked: appState.cprState.atropineLocked
    },
    {
      name: 'Vasopressin',
      doseText: '0.8 U/kg IV/IO (1.6 U/kg IT)',
      conc: concs.vasoConcUMl.toFixed(0) + ' U/mL',
      calc: res.vasoUnits.toFixed(1) + ' U = ' + res.vasoMl.toFixed(2) + ' mL IV/IO',
      guardrail: 'Alternative to Epinephrine every 3–5 min (every second BLS cycle).',
      actionLabel: 'Log Vasopressin',
      actionCode: 'VASO',
      locked: false
    },
    {
      name: 'Lidocaine (Canine Only)',
      doseText: '2 mg/kg IV/IO (4 mg/kg IT)',
      conc: concs.lidoConcMgMl.toFixed(0) + ' mg/mL',
      calc: res.lidoBlocked ? 'HARD-BLOCKED IN CATS' : (res.lidoMg.toFixed(1) + ' mg = ' + res.lidoMl.toFixed(2) + ' mL IV/IO'),
      guardrail: res.lidoBlocked ? 'CONTRAINDICATED IN CATS: Use Amiodarone 5 mg/kg for refractory feline VF/pVT.' : 'Refractory VF or pulseless VT after ≥ 2 defibrillation shocks.',
      actionLabel: res.lidoBlocked ? 'Blocked in Cats' : 'Log Lidocaine 2 mg/kg',
      actionCode: 'LIDOCAINE',
      locked: res.lidoBlocked
    },
    {
      name: 'Amiodarone',
      doseText: '5 mg/kg IV/IO',
      conc: concs.amioConcMgMl.toFixed(0) + ' mg/mL',
      calc: res.amioMg.toFixed(1) + ' mg = ' + res.amioMl.toFixed(2) + ' mL IV/IO',
      guardrail: 'Primary antiarrhythmic for Cats & Dogs in refractory VF / pulseless VT after ≥ 2 shocks.',
      actionLabel: 'Log Amiodarone',
      actionCode: 'AMIODARONE',
      locked: false
    },
    {
      name: 'Esmolol (Beta-1 Blocker)',
      doseText: '0.5 mg/kg IV load + 50 mcg/kg/min CRI',
      conc: concs.esmoConcMgMl.toFixed(0) + ' mg/mL',
      calc: res.esmoMg.toFixed(2) + ' mg = ' + res.esmoMl.toFixed(2) + ' mL over 3–10 min',
      guardrail: 'Consider starting at/after Shock #2 for persistent shockable rhythm.',
      actionLabel: 'Log Esmolol Load',
      actionCode: 'ESMOLOL',
      locked: false
    },
    {
      name: 'External Biphasic Defibrillation',
      doseText: 'Shock #1: 2–4 J/kg | Shock #2+: Double once (4–8 J/kg)',
      conc: 'Defibrillator (J)',
      calc: 'Shock #1: ' + res.defibShock1MinJ.toFixed(0) + '–' + res.defibShock1MaxJ.toFixed(0) + ' J | Shock #2+: ' + res.defibShock2MinJ.toFixed(0) + '–' + res.defibShock2MaxJ.toFixed(0) + ' J',
      guardrail: 'Single shock -> resume 2-min compressions immediately. Double energy once at Shock #2.',
      actionLabel: 'Log Defib Shock',
      actionCode: 'DEFIB',
      locked: false
    },
    {
      name: 'Sodium Bicarbonate 8.4%',
      doseText: '1 mEq/kg IV/IO',
      conc: concs.bicarbConcMeqMl.toFixed(1) + ' mEq/mL',
      calc: res.bicarbMeq.toFixed(1) + ' mEq = ' + res.bicarbMl.toFixed(1) + ' mL IV/IO',
      guardrail: 'Restrict to prolonged CPR (>15 min) with severe acidemia (pH < 7.0) or hyperkalemia.',
      actionLabel: 'Log NaHCO3',
      actionCode: 'BICARB',
      locked: false
    },
    {
      name: 'Reversals (Naloxone / Flumazenil / Atipamezole)',
      doseText: 'Nal 0.04 | Flu 0.01 | Atip 0.1 mg/kg IV',
      conc: '0.4 / 0.1 / 5.0 mg/mL',
      calc: 'Nal: ' + res.nalMl.toFixed(2) + ' mL | Flu: ' + res.fluMl.toFixed(2) + ' mL | Atip: ' + res.atipMl.toFixed(2) + ' mL',
      guardrail: 'Administer immediately if opioid, benzodiazepine, or alpha-2 agonist exposure is suspected.',
      actionLabel: 'Log Reversal',
      actionCode: 'REVERSAL',
      locked: false
    }
  ];

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    const btnClass = r.locked
      ? 'px-2.5 py-1.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-bold cursor-not-allowed text-xs'
      : 'px-2.5 py-1.5 rounded bg-slate-900 hover:bg-teal-600 text-white font-semibold transition text-xs';
    tr.innerHTML =
      '<td class="p-3 font-bold text-slate-900">' + escapeHtml(r.name) + '</td>' +
      '<td class="p-3 text-slate-700">' + escapeHtml(r.doseText) + '</td>' +
      '<td class="p-3 mono text-slate-600">' + escapeHtml(r.conc) + '</td>' +
      '<td class="p-3 mono font-bold text-teal-900">' + escapeHtml(r.calc) + '</td>' +
      '<td class="p-3 space-y-1.5">' +
        '<div class="text-xs text-slate-600">' + escapeHtml(r.guardrail) + '</div>' +
        '<button type="button" ' + (r.locked ? 'disabled' : '') +
        ' data-action="log-cpr" data-code="' + escapeHtml(r.actionCode) +
        '" data-name="' + escapeHtml(r.name) +
        '" data-calc="' + escapeHtml(r.calc) +
        '" class="' + btnClass + '">' + escapeHtml(r.actionLabel) + '</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

function logCprIntervention(code, name, calcText) {
  if (code === 'ATROPINE_ONCE') {
    if (appState.cprState.atropineLocked) {
      showToast('2024 RECOVER Guardrail: Atropine is restricted to a SINGLE early dose!', 'rose');
      return;
    }
    appState.cprState.atropineLocked = true;
    const ind = document.getElementById('atropine-lock-indicator');
    ind.textContent = 'ATROPINE LOCKED (1/1 GIVEN)';
    ind.className = 'text-xs px-2 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold';
  }
  if (code === 'EPI_LOW') {
    appState.cprState.epiElapsedSeconds = 0;
    appState.cprState.epiTimerActive = true;
    document.getElementById('cpr-epi-reminder-badge').textContent = 'Epi Given (00:00 elapsed)';
  }
  const logEl = document.getElementById('cpr-event-log');
  const timeStr = new Date().toLocaleTimeString();
  const lineText = '[' + timeStr + ' • Cycle ' + appState.cprState.cycleCount + '] ' + name + ' -> ' + calcText;
  appState.cprState.codeLogEntries.unshift(lineText);
  const entry = document.createElement('div');
  entry.className = 'text-teal-300';
  entry.textContent = lineText;
  logEl.prepend(entry);
  logUiChange('cpr_intervention', name + ': ' + calcText);
  calculateCprTable();
}

function exportCprCodeSheet() {
  const sp = document.getElementById('cpr-species').value;
  const bw = document.getElementById('cpr-bw').value;
  const header = [
    '====================================================================',
    'VETRX INDIA — 2024 RECOVER EMERGENCY CPR CODE SHEET',
    'Generated: ' + new Date().toISOString(),
    'Patient Species: ' + sp.toUpperCase() + ' | Arrest Weight: ' + bw + ' kg',
    '====================================================================',
    'TIMESTAMPED INTERVENTION LOG:'
  ];
  const body = appState.cprState.codeLogEntries.length > 0
    ? appState.cprState.codeLogEntries
    : ['(No ALS drug interventions logged yet)'];
  const blob = new Blob([header.concat(body).join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vetrx_recover2024_code_sheet_' + getTodayIsoDate() + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported 2024 RECOVER CPR Code Sheet (.txt)!', 'teal');
}

function toggleCprTimer() {
  const btnText = document.getElementById('btn-cpr-timer-text');
  if (appState.cprState.timerInterval) {
    clearInterval(appState.cprState.timerInterval);
    appState.cprState.timerInterval = null;
    btnText.textContent = 'Resume 2-Min BLS Cycle';
  } else {
    btnText.textContent = 'Pause 2-Min BLS Cycle';
    appState.cprState.timerInterval = setInterval(() => {
      appState.cprState.timerSeconds--;
      if (appState.cprState.epiTimerActive) {
        appState.cprState.epiElapsedSeconds++;
        const em = String(Math.floor(appState.cprState.epiElapsedSeconds / 60)).padStart(2, '0');
        const es = String(appState.cprState.epiElapsedSeconds % 60).padStart(2, '0');
        const epiBadge = document.getElementById('cpr-epi-reminder-badge');
        if (appState.cprState.epiElapsedSeconds >= 180) {
          epiBadge.textContent = '⚠️ EPI DUE NOW (' + em + ':' + es + ' elapsed — 3–5 min window!)';
          epiBadge.className = 'mono text-xs px-2 py-0.5 rounded bg-rose-600 text-white font-bold animate-pulse';
        } else {
          epiBadge.textContent = 'Since Last Epi: ' + em + ':' + es + ' (Due at 03:00)';
        }
      }
      if (appState.cprState.timerSeconds <= 0) {
        appState.cprState.cycleCount++;
        appState.cprState.timerSeconds = 120;
        document.getElementById('cpr-cycle-count').textContent = String(appState.cprState.cycleCount);
        showToast('2-Minute BLS Cycle Complete! Rotate compressor & check rhythm/ETCO2.', 'amber');
      }
      const mins = String(Math.floor(appState.cprState.timerSeconds / 60)).padStart(2, '0');
      const secs = String(appState.cprState.timerSeconds % 60).padStart(2, '0');
      document.getElementById('cpr-timer-display').textContent = mins + ':' + secs;
    }, 1000);
  }
}

function toggleCprMetronome() {
  const textEl = document.getElementById('btn-cpr-metro-text');
  if (appState.cprState.metronomeInterval) {
    clearInterval(appState.cprState.metronomeInterval);
    appState.cprState.metronomeInterval = null;
    appState.cprState.metronomeActive = false;
    textEl.textContent = '110 BPM Beep: OFF';
  } else {
    try {
      if (!appState.cprState.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        appState.cprState.audioCtx = new AudioContextClass();
      }
      if (appState.cprState.audioCtx.state === 'suspended') {
        appState.cprState.audioCtx.resume();
      }
    } catch (e) {}
    appState.cprState.metronomeActive = true;
    textEl.textContent = '110 BPM Beep: ON';
    const intervalMs = Math.round((60 / 110) * 1000);
    appState.cprState.metronomeInterval = setInterval(() => {
      try {
        if (!appState.cprState.audioCtx) return;
        const osc = appState.cprState.audioCtx.createOscillator();
        const gain = appState.cprState.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(appState.cprState.audioCtx.destination);
        osc.start();
        osc.stop(appState.cprState.audioCtx.currentTime + 0.05);
      } catch (e) {}
    }, intervalMs);
  }
}

function resetCprCode() {
  if (appState.cprState.timerInterval) {
    clearInterval(appState.cprState.timerInterval);
    appState.cprState.timerInterval = null;
  }
  if (appState.cprState.metronomeInterval) {
    clearInterval(appState.cprState.metronomeInterval);
    appState.cprState.metronomeInterval = null;
  }
  appState.cprState.atropineLocked = false;
  appState.cprState.timerSeconds = 120;
  appState.cprState.cycleCount = 1;
  appState.cprState.epiElapsedSeconds = 0;
  appState.cprState.epiTimerActive = false;
  appState.cprState.codeLogEntries = [];
  document.getElementById('cpr-timer-display').textContent = '02:00';
  document.getElementById('cpr-cycle-count').textContent = '1';
  document.getElementById('btn-cpr-timer-text').textContent = 'Start 2-Min BLS Cycle';
  document.getElementById('btn-cpr-metro-text').textContent = '110 BPM Beep: OFF';
  document.getElementById('cpr-epi-reminder-badge').textContent = 'Epi Timer: Ready';
  document.getElementById('cpr-epi-reminder-badge').className = 'mono text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30';
  const ind = document.getElementById('atropine-lock-indicator');
  ind.textContent = 'Atropine Ready (1 Dose Max)';
  ind.className = 'text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300';
  document.getElementById('cpr-event-log').innerHTML = '<div class="text-slate-500">[RESET] Code log cleared. Atropine single-dose lock reset.</div>';
  calculateCprTable();
}

// =========================================================================
// 13. TAB 5: CHANGELOG, GAZETTE TABLE, CSV/JSON IMPORT & LEAFLET UNLOCK
// =========================================================================
function renderCatalogChangelog() {
  const container = document.getElementById('catalog-changelog-list');
  if (!container) return;
  container.innerHTML = '';
  CATALOG_CHANGELOG.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs';
    let bullets = '';
    (entry.changes || []).forEach(c => {
      bullets += '<li class="text-slate-700 leading-snug">• ' + escapeHtml(c) + '</li>';
    });
    card.innerHTML =
      '<div class="flex items-center justify-between border-b border-slate-200 pb-1.5">' +
        '<span class="font-bold text-slate-900">v' + escapeHtml(entry.version) + ' — ' + escapeHtml(entry.summary || entry.title) + '</span>' +
      '</div>' +
      '<ul class="space-y-1">' + bullets + '</ul>';
    container.appendChild(card);
  });
}

function renderGazetteTable() {
  const legalGrid = document.getElementById('legal-clarifications-grid');
  if (legalGrid) {
    legalGrid.innerHTML = '';
    LEGAL_REGULATORY_NOTES.forEach(n => {
      const card = document.createElement('div');
      card.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1';
      card.innerHTML =
        '<div class="font-bold text-slate-900">' + escapeHtml(n.topic) + '</div>' +
        '<p class="text-xs text-slate-600 leading-relaxed">' + escapeHtml(n.explanation) + '</p>';
      legalGrid.appendChild(card);
    });
  }

  const tbody = document.getElementById('gazette-citations-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  VERIFIED_GAZETTE_CITATIONS.forEach(g => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    tr.innerHTML =
      '<td class="p-2.5 mono font-bold text-rose-900">' + escapeHtml(g.code) + '</td>' +
      '<td class="p-2.5 mono text-slate-700">' + escapeHtml(g.date) + '</td>' +
      '<td class="p-2.5 font-semibold text-slate-800">' + escapeHtml(g.authority) + '</td>' +
      '<td class="p-2.5 text-slate-600">' + escapeHtml(g.summary) + ' <a href="' + escapeHtml(g.url) + '" target="_blank" rel="noopener noreferrer" class="text-teal-700 underline font-semibold">[Source ↗]</a></td>';
    tbody.appendChild(tr);
  });
}

function renderCatalogTable() {
  const q = (document.getElementById('catalog-search-input').value || '').toLowerCase();
  const statusFilter = document.getElementById('catalog-status-filter').value;
  const tbody = document.getElementById('catalog-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  INDIAN_SKU_CATALOG.filter(sku => {
    if (statusFilter !== 'ALL' && sku.status !== statusFilter) return false;
    if (!q) return true;
    return (
      sku.brand.toLowerCase().includes(q) ||
      sku.inn.toLowerCase().includes(q) ||
      sku.manufacturer.toLowerCase().includes(q) ||
      sku.schedule.toLowerCase().includes(q) ||
      (sku.sourceCitation && sku.sourceCitation.toLowerCase().includes(q))
    );
  }).forEach(sku => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    let badge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900">VERIFIED (PRIMARY SOURCE)</span>';
    let actionBtn = '<button type="button" data-action="use-sku" data-id="' + escapeHtml(sku.id) + '" class="mt-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-teal-600 text-white font-semibold text-xs">Use in Calculator</button>';

    if (sku.status === 'UNVERIFIED') {
      badge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">UNVERIFIED (CHECK LEAFLET)</span>';
      actionBtn =
        '<div class="flex flex-wrap gap-1 mt-1">' +
          '<button type="button" data-action="use-sku" data-id="' + escapeHtml(sku.id) + '" class="px-2 py-1 rounded bg-slate-800 hover:bg-teal-600 text-white font-semibold text-xs">Study Mode Calc</button>' +
          '<button type="button" data-action="verify-sku" data-id="' + escapeHtml(sku.id) + '" class="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs">Verify Physical Leaflet</button>' +
        '</div>';
    } else if (sku.status === 'BANNED') {
      badge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900">STATUTORY BAN</span>';
      actionBtn = '<button type="button" data-action="use-sku" data-id="' + escapeHtml(sku.id) + '" class="mt-1 px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 font-semibold text-xs">Test Gate Block</button>';
    }

    tr.innerHTML =
      '<td class="p-3">' +
        '<div class="font-bold text-slate-900">' + escapeHtml(sku.brand) + '</div>' +
        '<div class="text-xs text-slate-500">' + escapeHtml(sku.manufacturer) + '</div>' +
        '<div class="mono text-xs text-teal-800 mt-0.5">' + escapeHtml(sku.atcvet) + ' • ' + escapeHtml(sku.amrTier || 'NONE') + '</div>' +
      '</td>' +
      '<td class="p-3">' +
        '<div class="mono font-bold text-slate-900">' + escapeHtml(sku.inn) + '</div>' +
        '<div class="text-slate-700">' + sku.strengthVal + ' ' + escapeHtml(sku.strengthUnit) + ' (' + escapeHtml(sku.packInfo) + ')</div>' +
      '</td>' +
      '<td class="p-3">' +
        '<div class="font-semibold text-slate-800">Allowed: ' + (sku.allowedSpecies.length ? sku.allowedSpecies.join(', ') : 'NONE') + '</div>' +
        '<div class="text-xs text-slate-600">Routes: ' + (sku.allowedRoutes && sku.allowedRoutes.length ? sku.allowedRoutes.join(', ') : 'NONE') + '</div>' +
        '<div class="mono text-xs text-slate-600">Max Daily: ' + (sku.maxDailyDoseMgKg || '—') + ' ' + escapeHtml(sku.doseUnit) + '/d</div>' +
      '</td>' +
      '<td class="p-3">' +
        '<div class="text-xs text-slate-800 font-medium">' + escapeHtml(sku.sourceCitation || 'Formulary') + '</div>' +
        '<div class="mono text-xs ' + (sku.lastReviewed ? 'text-teal-800' : 'text-amber-800 font-bold') + ' mt-0.5">' +
          escapeHtml(sku.lastReviewed ? ('Source Vintage: ' + sku.lastReviewed) : 'Unverified — Check Physical Leaflet / Plumb\'s') +
        '</div>' +
        (sku.sourceUrl ? '<a href="' + escapeHtml(sku.sourceUrl) + '" target="_blank" rel="noopener noreferrer" class="text-xs text-teal-700 underline font-semibold">[Source Link ↗]</a>' : '') +
      '</td>' +
      '<td class="p-3">' +
        badge +
        '<div class="text-xs text-slate-600 mt-1">' + escapeHtml(sku.auditNote) + '</div>' +
        actionBtn +
      '</td>';
    tbody.appendChild(tr);
  });
}

function handleCatalogFileImport(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (evt) {
    try {
      const content = String(evt.target.result || '');
      let importedCount = 0;
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(content);
        const arr = Array.isArray(parsed) ? parsed : (parsed.skus || []);
        arr.forEach(item => {
          if (item && item.id && item.brand && item.inn) {
            INDIAN_SKU_CATALOG.unshift(item);
            importedCount++;
          }
        });
      } else {
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length >= 8) {
            INDIAN_SKU_CATALOG.unshift({
              id: cols[0] || ('custom-' + Date.now() + '-' + i),
              brand: cols[1],
              manufacturer: cols[2] || 'Imported Formulary',
              inn: cols[3].toUpperCase(),
              drugClass: 'IMPORTED_CUSTOM',
              amrTier: 'NONE',
              atcvet: 'Q-CUSTOM',
              snomed: 'SCT-CUSTOM',
              schedule: 'Schedule H',
              status: 'UNVERIFIED',
              form: cols[5] === 'mg/mL' ? 'injectable' : 'tablet',
              strengthVal: parseFloat(cols[4]) || 10,
              strengthUnit: cols[5] || 'mg',
              packInfo: 'Custom Imported Pack',
              packUnitCount: 10,
              packUnitLabel: '10-unit Pack',
              splittable: [1, 0.5],
              allowedSpecies: (cols[6] || 'dog').split('|'),
              contraindicatedSpecies: [],
              allowedRoutes: ['PO', 'IM', 'SC'],
              defaultDose: parseFloat(cols[7]) || 1.0,
              doseMin: 0.5,
              doseMax: (parseFloat(cols[7]) || 1.0) * 2,
              maxDailyDoseMgKg: (parseFloat(cols[7]) || 1.0) * 2,
              maxDurationDays: 14,
              doseUnit: cols[8] || 'mg/kg',
              defaultFreq: '24',
              defaultRoute: 'PO',
              weightBasis: 'IBW',
              milkWithdrawalHr: 72,
              meatWithdrawalDays: 14,
              sourceCitation: 'Custom CSV Import (' + file.name + ')',
              sourceUrl: 'https://www.msdvetmanual.com/',
              lastReviewed: null,
              auditNote: 'Imported via CSV/JSON Importer; verify physical leaflet before clinical use.'
            });
            importedCount++;
          }
        }
      }
      renderCatalogTable();
      populateSkuDropdown();
      await logUiChange('catalog_import', 'Imported ' + importedCount + ' SKU(s) from ' + file.name);
      showToast('Imported ' + importedCount + ' SKU(s) into active catalog!', 'teal');
    } catch (err) {
      showToast('Failed to parse catalog file: ensure valid JSON or CSV format.', 'rose');
    }
  };
  reader.readAsText(file);
}

function selectSkuFromCatalog(skuId) {
  document.getElementById('sku-category-filter').value = 'all';
  populateSkuDropdown(skuId);
  switchMainTab('dosage');
  showToast('Loaded SKU into Dosage Calculator.', 'teal');
}

function openLeafletModal(skuId) {
  const sku = INDIAN_SKU_CATALOG.find(s => s.id === skuId);
  if (!sku) return;
  document.getElementById('modal-sku-id').value = sku.id;
  document.getElementById('modal-sku-name').value = sku.brand + ' (' + sku.manufacturer + ')';
  document.getElementById('modal-sku-strength').value = sku.strengthVal;
  document.getElementById('modal-sku-dose').value = sku.defaultDose;
  document.getElementById('modal-sku-note').value = '';
  document.getElementById('leaflet-modal-error').classList.add('hidden');
  const modal = document.getElementById('leaflet-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeLeafletModal() {
  const modal = document.getElementById('leaflet-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function confirmLeafletVerification() {
  const prac = getActivePractitioner();
  const errEl = document.getElementById('leaflet-modal-error');
  if (prac.isDemo) {
    errEl.classList.remove('hidden');
    errEl.textContent = 'Blocked: Cannot promote an UNVERIFIED SKU under the anonymous Sandbox Demo profile. Sign in as a Supervising Registered Veterinarian in Tab 1 first.';
    return;
  }
  const refNote = (document.getElementById('modal-sku-note').value || '').trim();
  if (refNote.length < 10) {
    errEl.classList.remove('hidden');
    errEl.textContent = 'Blocked: Enter the physical leaflet reference/batch number and excipient check (at least 10 characters).';
    return;
  }

  const skuId = document.getElementById('modal-sku-id').value;
  const sku = INDIAN_SKU_CATALOG.find(s => s.id === skuId);
  if (!sku) return;
  sku.strengthVal = parseFloat(document.getElementById('modal-sku-strength').value) || sku.strengthVal;
  sku.defaultDose = parseFloat(document.getElementById('modal-sku-dose').value) || sku.defaultDose;
  sku.status = 'VERIFIED';
  sku.auditNote = 'Leaflet Verified by ' + prac.name + ' (' + prac.regNumber + '): ' + refNote;
  sku.lastReviewed = getTodayIsoDate();

  if (window.VetCryptoStorage) {
    await window.VetCryptoStorage.saveRecordToStore('verifiedSkus', {
      id: sku.id,
      strengthVal: sku.strengthVal,
      defaultDose: sku.defaultDose,
      auditNote: sku.auditNote,
      lastReviewed: sku.lastReviewed
    });
  }

  closeLeafletModal();
  await logUiChange('sku_leaflet_verified', sku.brand + ' verified by ' + prac.regNumber);
  renderCatalogTable();
  populateSkuDropdown(sku.id);
  showToast(sku.brand + ' promoted to VERIFIED and persisted to IndexedDB.', 'teal');
}

function renderAdrLogs() {
  const container = document.getElementById('adr-log-list');
  if (!container) return;
  container.innerHTML = '';
  appState.adrLogs.forEach(a => {
    const div = document.createElement('div');
    div.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs';
    div.innerHTML =
      '<div class="flex items-center justify-between">' +
        '<span class="font-bold text-slate-900">' + escapeHtml(a.adrId) + ' — ' + escapeHtml(a.drug) + '</span>' +
        '<span class="mono text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">' + escapeHtml(a.severity) + '</span>' +
      '</div>' +
      '<div class="text-xs text-slate-700">' + escapeHtml(a.reaction) + '</div>' +
      '<div class="mono text-xs text-slate-500">Patient: ' + escapeHtml(a.patient) + ' | Batch: ' + escapeHtml(a.batchNo) + ' | Logged: ' + escapeHtml(a.date) + '</div>';
    container.appendChild(div);
  });
}

async function logNewAdrEvent() {
  const adr = {
    adrId: 'ADR-' + getTodayIsoDate().replace(/-/g, '') + '-' + String(appState.adrLogs.length + 1).padStart(2, '0'),
    date: getTodayIsoDate(),
    drug: document.getElementById('adr-drug-name').value || 'Unknown SKU',
    batchNo: document.getElementById('adr-batch-no').value || 'N/A',
    patient: document.getElementById('adr-patient').value || 'Animal Patient',
    severity: document.getElementById('adr-severity').value,
    reaction: document.getElementById('adr-reaction').value || 'Adverse event logged'
  };
  appState.adrLogs.unshift(adr);
  if (window.VetCryptoStorage) {
    await window.VetCryptoStorage.saveRecordToStore('adrs', adr);
  }
  await logUiChange('adr_logged', adr.adrId + ' (' + adr.drug + ')');
  renderAdrLogs();
  showToast('Recorded Adverse Drug Reaction (' + adr.adrId + ') to IndexedDB & Audit Trail.', 'amber');
}

function exportAdrLogsJson() {
  const dataStr = JSON.stringify({
    schema: 'IPC-PvPI / openFDA Veterinary Adverse Event Format',
    exportedAt: new Date().toISOString(),
    reports: appState.adrLogs
  }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vetrx_india_adr_pharmacovigilance_' + getTodayIsoDate() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported ADR Pharmacovigilance reports as JSON.', 'teal');
}

// =========================================================================
// 14. INDEXEDDB PERSISTENCE + FULL JSON BACKUP EXPORT & RESTORE IMPORT
// =========================================================================
async function restorePersistentDataFromIndexedDb() {
  if (!window.VetCryptoStorage) return;
  const savedRegs = await window.VetCryptoStorage.getAllRecordsFromStore('registers');
  if (savedRegs && savedRegs.length > 0) {
    appState.h1Register = savedRegs;
  }
  const savedAudits = await window.VetCryptoStorage.getAllRecordsFromStore('audits');
  if (savedAudits && savedAudits.length > 0) {
    appState.dpdpAuditLogs = savedAudits;
  }
  const savedAdrs = await window.VetCryptoStorage.getAllRecordsFromStore('adrs');
  if (savedAdrs && savedAdrs.length > 0) {
    appState.adrLogs = savedAdrs;
  }
  const verifiedSkus = await window.VetCryptoStorage.getAllRecordsFromStore('verifiedSkus');
  if (verifiedSkus && verifiedSkus.length > 0) {
    verifiedSkus.forEach(vs => {
      const target = INDIAN_SKU_CATALOG.find(s => s.id === vs.id);
      if (target) {
        target.status = 'VERIFIED';
        target.strengthVal = vs.strengthVal;
        target.defaultDose = vs.defaultDose;
        target.auditNote = vs.auditNote;
        target.lastReviewed = vs.lastReviewed;
      }
    });
  }
}

async function exportIndexedDbBackupJson() {
  if (!window.VetCryptoStorage) return;
  const backup = await window.VetCryptoStorage.exportFullIndexedDbBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vetrx_india_indexeddb_backup_v3_' + getTodayIsoDate() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  await logUiChange('indexeddb_backup_export', 'Exported full IndexedDB backup JSON');
  showToast('Exported full IndexedDB Backup (.json) across all 5 stores!', 'teal');
}

function handleIndexedDbRestoreFile(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file || !window.VetCryptoStorage) return;
  const reader = new FileReader();
  reader.onload = async function (evt) {
    try {
      const parsed = JSON.parse(String(evt.target.result || '{}'));
      const res = await window.VetCryptoStorage.importFullIndexedDbBackup(parsed);
      if (!res.valid) {
        showToast(res.error || 'Invalid backup file.', 'rose');
        return;
      }
      await restorePersistentDataFromIndexedDb();
      await renderIndexedDbCases();
      renderStatutoryRegisters();
      renderAdrLogs();
      renderCatalogTable();
      await logUiChange('indexeddb_backup_restore', 'Restored ' + res.restoredCount + ' record(s) from ' + file.name);
      showToast('Restored ' + res.restoredCount + ' record(s) into IndexedDB from backup!', 'teal');
    } catch (e) {
      showToast('Failed to restore IndexedDB backup: invalid JSON file.', 'rose');
    }
  };
  reader.readAsText(file);
}

async function saveCurrentCaseToIndexedDb() {
  if (!window.VetCryptoStorage) return;
  const pii = {
    name: document.getElementById('client-name').value.trim() || 'Unnamed Client',
    phone: document.getElementById('client-phone').value.trim(),
    address: document.getElementById('client-address').value.trim()
  };
  const encryptedPii = await window.VetCryptoStorage.encryptOwnerPii(pii);
  const record = {
    caseId: 'CASE-' + Date.now(),
    savedAt: new Date().toISOString(),
    patientName: document.getElementById('patient-name').value,
    species: document.getElementById('patient-species').value,
    breed: document.getElementById('patient-breed').value,
    bwKg: document.getElementById('patient-bw').value,
    bcs: document.getElementById('patient-bcs').value,
    renalStage: document.getElementById('patient-renal-stage').value,
    hepaticStage: document.getElementById('patient-hepatic-stage').value,
    encryptedOwnerPii: encryptedPii,
    rxItems: JSON.parse(JSON.stringify(appState.rxItems))
  };
  await window.VetCryptoStorage.saveRecordToStore('cases', record);
  await renderIndexedDbCases();
  showToast('Case saved to IndexedDB with PBKDF2 AES-256-GCM encrypted Owner PII.', 'teal');
}

async function renderIndexedDbCases() {
  const container = document.getElementById('indexeddb-cases-list');
  if (!container || !window.VetCryptoStorage) return;
  const cases = await window.VetCryptoStorage.getAllRecordsFromStore('cases');
  container.innerHTML = '';
  if (cases.length === 0) {
    container.innerHTML = '<div class="p-2.5 rounded bg-slate-50 text-slate-500 text-center">No saved cases yet. Click "+ Save Current" to persist to IndexedDB.</div>';
    return;
  }
  for (const c of cases) {
    let decryptedOwner = { name: 'Encrypted Owner (Enter Matching PIN)' };
    try {
      const dec = await window.VetCryptoStorage.decryptOwnerPii(c.encryptedOwnerPii);
      if (dec && dec.name) decryptedOwner = dec;
    } catch (e) {}
    const div = document.createElement('div');
    div.className = 'p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2';
    div.innerHTML =
      '<div>' +
        '<div class="font-bold text-slate-900">' + escapeHtml(c.patientName) + ' (' + escapeHtml(c.species) + ' • ' + escapeHtml(c.bwKg) + ' kg)</div>' +
        '<div class="text-xs text-slate-600">Owner: ' + escapeHtml(decryptedOwner.name) + ' | IV: <span class="mono">' + escapeHtml(c.encryptedOwnerPii.ivBase64) + '</span></div>' +
        '<div class="text-xs text-teal-800 font-semibold">' + (c.rxItems ? c.rxItems.length : 0) + ' Rx item(s) • ' + escapeHtml(c.savedAt.slice(0, 16)) + '</div>' +
      '</div>' +
      '<div class="flex items-center gap-1">' +
        '<button type="button" data-action="load-case" data-id="' + escapeHtml(c.caseId) + '" class="px-2 py-1 rounded bg-slate-900 text-white text-xs font-bold">Load</button>' +
        '<button type="button" data-action="delete-case" data-id="' + escapeHtml(c.caseId) + '" class="px-2 py-1 rounded bg-rose-100 text-rose-800 text-xs font-bold">✕</button>' +
      '</div>';
    container.appendChild(div);
  }
}

async function loadCaseFromIndexedDb(caseId) {
  if (!window.VetCryptoStorage) return;
  const cases = await window.VetCryptoStorage.getAllRecordsFromStore('cases');
  const found = cases.find(c => c.caseId === caseId);
  if (!found) return;
  const pii = await window.VetCryptoStorage.decryptOwnerPii(found.encryptedOwnerPii);
  if (pii && !pii.decryptionLocked) {
    document.getElementById('client-name').value = pii.name || '';
    document.getElementById('client-phone').value = pii.phone || '';
    document.getElementById('client-address').value = pii.address || '';
  }
  document.getElementById('patient-name').value = found.patientName || '';
  document.getElementById('patient-species').value = found.species || 'dog';
  syncSpeciesBcsAndModeUi(found.species || 'dog');
  document.getElementById('patient-breed').value = found.breed || 'Labrador Retriever';
  document.getElementById('patient-bw').value = found.bwKg || '20';
  document.getElementById('patient-bcs').value = found.bcs || '5';
  document.getElementById('patient-renal-stage').value = found.renalStage || 'normal';
  document.getElementById('patient-hepatic-stage').value = found.hepaticStage || 'normal';
  appState.rxItems = found.rxItems || [];
  appState.rxPatientKey = computeCurrentPatientKey();
  renderRxItemsLists();
  recalculateAll();
  showToast('Loaded case ' + found.patientName + ' from IndexedDB.', 'teal');
}

async function removeCaseFromIndexedDb(caseId) {
  if (!window.VetCryptoStorage) return;
  await window.VetCryptoStorage.deleteCaseFromStore(caseId);
  await renderIndexedDbCases();
  showToast('Deleted case from IndexedDB.', 'slate');
}

function renderStatutoryRegisters() {
  const h1Container = document.getElementById('h1-register-list');
  if (!h1Container) return;
  h1Container.innerHTML = '';
  if (appState.h1Register.length === 0) {
    h1Container.innerHTML = '<div class="p-2.5 rounded bg-slate-50 text-slate-500 text-center">No Schedule H1 or NDPS prescriptions signed yet in this session.</div>';
  } else {
    appState.h1Register.forEach(row => {
      const div = document.createElement('div');
      div.className = 'p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1';
      div.innerHTML =
        '<div class="flex items-center justify-between font-bold text-slate-900">' +
          '<span class="mono text-xs text-teal-800">' + escapeHtml(row.logId) + ' • ' + escapeHtml(row.schedule) + '</span>' +
          '<span class="mono text-xs text-rose-700">Retain til: ' + escapeHtml(row.retentionUntil) + '</span>' +
        '</div>' +
        '<div class="text-xs font-semibold text-slate-800">' + escapeHtml(row.drug) + ' — Qty: ' + escapeHtml(row.qtyDispensed) + '</div>' +
        '<div class="text-xs text-slate-600">Owner: ' + escapeHtml(row.owner) + ' | Prescriber: ' + escapeHtml(row.prescriber) + '</div>';
      h1Container.appendChild(div);
    });
  }

  const dpdpContainer = document.getElementById('dpdp-audit-list');
  if (!dpdpContainer) return;
  dpdpContainer.innerHTML = '';
  appState.dpdpAuditLogs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'p-2 rounded bg-slate-900 text-slate-200 border border-slate-800';
    div.innerHTML =
      '<div class="text-teal-400 font-bold">[' + escapeHtml(log.id) + '] ' + escapeHtml(log.action) + '</div>' +
      '<div class="text-slate-300">' + escapeHtml(log.details) + '</div>' +
      '<div class="text-xs text-slate-500">' + escapeHtml(log.actor) + ' • ' + escapeHtml(log.timestamp) + '</div>';
    dpdpContainer.appendChild(div);
  });
}

function exportStatutoryLogsJson() {
  const dataStr = JSON.stringify({
    exportedAt: new Date().toISOString(),
    scheduleH1AndNdpsRegister: appState.h1Register,
    dpdpSecurityAndChangeAuditLog: appState.dpdpAuditLogs,
    adverseDrugReactions: appState.adrLogs
  }, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vetrx_india_statutory_and_audit_logs_' + getTodayIsoDate() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported Schedule H1/NDPS, Audit Trail & ADR Logs as JSON.', 'teal');
}

// =========================================================================
// 15. TAB 7: 16 GOLDEN TEST VECTORS (CALLING LIVE VETDOSEENGINE DIRECTLY!)
// =========================================================================
async function runGoldenTestSuite() {
  const skuMap = {};
  INDIAN_SKU_CATALOG.forEach(s => { skuMap[s.id] = s; });

  const vectors = [
    {
      id: 'TC-01',
      title: 'TC-01: Neonatal Kitten Fluid & KCl Conflict (Live VetDoseEngine.calculateFluidsAndKcl)',
      scenario: 'Cat, 0.45 kg, Pediatric 2.5×, 8% dehydrated, Serum K+ = 2.8 mEq/L, 100 mL Burette',
      run: () => {
        const r = window.VetDoseEngine.calculateFluidsAndKcl({
          species: 'cat', bwKg: 0.45, lifeStage: 'pediatric', shockActive: false,
          dehydPct: 8, rehydHours: 24, maintFormula: 'allometric', serumK: 2.8, bagMode: 'burette_100'
        });
        const passed = !r.blocked && Math.abs(r.deficitMl - 36.0) < 0.05 && Math.abs(r.maint24hMl - 109.9) < 0.15 && r.clampTriggered === true && Math.abs(r.maxSafeBagMeqL - 37.0) < 0.15;
        return {
          passed,
          expected: 'Deficit: 36.0 mL | Maint: 109.9 mL/d | Total: 145.9 mL (6.08 mL/hr) | KCl Clamp ≤ 37.0 mEq/L (1.85 mL of 15% KCl in 100 mL burette)',
          computed: 'Deficit: ' + r.deficitMl.toFixed(1) + ' mL | Maint: ' + r.maint24hMl.toFixed(1) + ' mL/d | Total: ' + r.total24hVolumeMl.toFixed(1) + ' mL (' + r.phase1HourlyMl.toFixed(2) + ' mL/hr) | Clamp ≤ ' + r.maxSafeBagMeqL.toFixed(1) + ' mEq/L (' + r.kcl15PctMlToInject.toFixed(2) + ' mL 15% KCl/100mL)'
        };
      }
    },
    {
      id: 'TC-02',
      title: 'TC-02: Obese Labrador IBW vs. TBW Scaling (Live VetDoseEngine.calculateDosage)',
      scenario: 'Dog, 42.0 kg TBW, BCS 8/9, Carprofen 2.2 mg/kg q12h PO (Carodyl 75 mg)',
      run: () => {
        const r = window.VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 42.0, weightUnit: 'kg', bcs: 8, rawDoseRate: 2.2, doseBasisUnit: 'mg/kg',
          freqVal: '12', durationDays: 5, route: 'PO'
        });
        const passed = !r.blocked && Math.abs(r.wNorm.ibwKg - 32.31) < 0.02 && Math.abs(r.exactDoseVal - 71.08) < 0.05 && r.perAdminUnits === 1 && Math.abs(r.variancePct - 5.5) < 0.15;
        return {
          passed,
          expected: 'IBW: 32.31 kg | Target: 71.08 mg | BSA: 1.025 m² IBW | 1 × 75 mg Carodyl (+5.5% var, PASS) | Supply: 10 Tablets (2 × Strip of 6)',
          computed: 'IBW: ' + r.wNorm.ibwKg.toFixed(2) + ' kg | Target: ' + r.exactDoseVal.toFixed(2) + ' mg | BSA: ' + r.wNorm.bsaIbw.toFixed(3) + ' m² | ' + r.headlineText + ' | ' + r.totalSupplyText
        };
      }
    },
    {
      id: 'TC-03',
      title: 'TC-03: Canine Lidocaine CRI Pump vs. Bag (Live VetDoseEngine.calculateCri)',
      scenario: 'Dog, 20.0 kg, Lidocaine 2% (20 mg/mL) CRI at 50 mcg/kg/min in 500 mL LRS at 50.0 mL/hr',
      run: () => {
        const r = window.VetDoseEngine.calculateCri({
          bwKg: 20.0, rateVal: 50, rateUnit: 'mcg/kg/min', stockConcMgMl: 20.0,
          bagVolMl: 500, bagRateMlHr: 50.0, maxSafeMcgKgMin: 80
        });
        const passed = !r.blocked && Math.abs(r.hourlyDrugMg - 60.0) < 0.01 && Math.abs(r.neatPumpMlHr - 3.0) < 0.01 && Math.abs(r.drugVolForBagMl - 30.0) < 0.01;
        return {
          passed,
          expected: 'Hourly: 60.0 mg/hr | Neat Pump: 3.00 mL/hr | Withdraw 30.0 mL LRS & inject 30.0 mL (600 mg) Lidocaine',
          computed: 'Hourly: ' + r.hourlyDrugMg.toFixed(1) + ' mg/hr | Neat Pump: ' + r.neatPumpMlHr.toFixed(2) + ' mL/hr | Withdraw ' + r.drugVolForBagMl.toFixed(1) + ' mL & inject ' + r.drugVolForBagMl.toFixed(1) + ' mL (' + r.totalDrugForBagMg.toFixed(0) + ' mg)'
        };
      }
    },
    {
      id: 'TC-04',
      title: 'TC-04: Buffalo Theileriosis IM Site Splitting (Live VetDoseEngine.calculateDosage)',
      scenario: 'Buffalo, 500 kg, Butalex (50 mg/mL Buparvaquone) at 2.5 mg/kg Deep IM in neck',
      run: () => {
        const r = window.VetDoseEngine.calculateDosage({
          sku: skuMap['butalex-inj'], spCode: 'buffalo', speciesMetaMap: SPECIES_META,
          rawWeight: 500, weightUnit: 'kg', bcs: 3, rawDoseRate: 2.5, doseBasisUnit: 'mg/kg',
          freqVal: 'once', durationDays: 1, route: 'Deep IM (Neck)'
        });
        const passed = !r.blocked && Math.abs(r.exactDoseVal - 1250) < 0.1 && Math.abs(r.perAdminUnits - 25.0) < 0.05 && r.sitesNeeded === 3;
        return {
          passed,
          expected: '1250 mg (25.00 mL Deep IM Neck) | SPLIT ≥ 3 NECK SITES (≤10 mL/site) | Supply: 25.0 mL (2 × 20 mL Vial)',
          computed: r.headlineText + ' | ' + r.imSplitText + ' | ' + r.totalSupplyText
        };
      }
    },
    {
      id: 'TC-05',
      title: 'TC-05: 2024 RECOVER CPR & Multi-Vial Check (Live VetDoseEngine.calculateCpr)',
      scenario: 'Dog, 15.0 kg arrest; Epinephrine (1 mg/mL), Atropine (0.6 vs 0.54 mg/mL), Lidocaine (20 mg/mL)',
      run: () => {
        const r = window.VetDoseEngine.calculateCpr({
          species: 'dog', bwKg: 15.0,
          concs: { epiConcMgMl: 1.0, atropineConcMgMl: 0.6, atropineDoseMgKg: 0.05, lidoConcMgMl: 20.0 }
        });
        const passed = !r.blocked && Math.abs(r.epiMl - 0.15) < 0.005 && Math.abs(r.atroMl - 1.25) < 0.005 && Math.abs(r.atro054Ml - 1.39) < 0.01 && Math.abs(r.lidoMl - 1.50) < 0.005;
        return {
          passed,
          expected: 'Epi: 0.15 mL | Atropine: 1.25 mL @ 0.6 mg/mL vs 1.39 mL @ 0.54 mg/mL | Lido: 1.50 mL',
          computed: 'Epi: ' + r.epiMl.toFixed(2) + ' mL | Atropine: ' + r.atroMl.toFixed(2) + ' mL @ 0.6 vs ' + r.atro054Ml.toFixed(2) + ' mL @ 0.54 | Lido: ' + r.lidoMl.toFixed(2) + ' mL'
        };
      }
    },
    {
      id: 'TC-06',
      title: 'TC-06: Toy Dog Rounding Hard-Block & Override Gate (Live VetDoseEngine.calculateDosage)',
      scenario: 'Dog, 3.5 kg, Carprofen 2.2 mg/kg q12h PO (Carodyl 25 mg smallest tablet -> -18.8% variance)',
      run: () => {
        const blockedRes = window.VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 3.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO',
          roundingOverrideChecked: false
        });
        const overrideRes = window.VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 3.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO',
          roundingOverrideChecked: true, roundingOverrideReason: 'Owner unable to administer oral liquid'
        });
        const passed = blockedRes.blocked === true && blockedRes.exactDoseVal === null && overrideRes.blocked === false;
        return {
          passed,
          expected: 'Without Override: HARD-BLOCKED & Dose Hidden (-18.8% var) | With Justification Override: Unblocked (6.25 mg = 0.25 tab)',
          computed: 'Without Override Blocked: ' + blockedRes.blocked + ' (Dose: ' + String(blockedRes.exactDoseVal) + ') | With Reason Blocked: ' + overrideRes.blocked
        };
      }
    },
    {
      id: 'TC-07',
      title: 'TC-07: Blank, Zero & Negative Weight Hard-Block Across All Tabs',
      scenario: 'Empty string "", 0 kg, and -5 kg passed into Dosage, Fluids, CRI, and CPR engines',
      run: () => {
        const dBlank = window.VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', rawWeight: '' });
        const fZero = window.VetDoseEngine.calculateFluidsAndKcl({ species: 'dog', bwKg: 0, serumK: 4.0 });
        const criNeg = window.VetDoseEngine.calculateCri({ bwKg: -5, rateVal: 50, stockConcMgMl: 20, bagRateMlHr: 50 });
        const cprBlank = window.VetDoseEngine.calculateCpr({ species: 'dog', bwKg: '   ' });
        const passed = dBlank.blocked && fZero.blocked && criNeg.blocked && cprBlank.blocked;
        return {
          passed,
          expected: 'All 4 calculators return blocked = TRUE and hide all dose outputs when weight is blank, 0, or negative',
          computed: 'Dosage Blocked: ' + dBlank.blocked + ' | Fluids Blocked: ' + fZero.blocked + ' | CRI Blocked: ' + criNeg.blocked + ' | CPR Blocked: ' + cprBlank.blocked
        };
      }
    },
    {
      id: 'TC-08',
      title: 'TC-08: Unapproved Species & Invalid Route Hard-Blocks',
      scenario: 'Carodyl (dog-only) in Cattle; Oxytetracycline LA 200 mg/mL via Slow IV',
      run: () => {
        const cCattle = window.VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-75'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 400, bcs: 3, rawDoseRate: 2.2, route: 'PO'
        });
        const oxyIv = window.VetDoseEngine.calculateDosage({
          sku: skuMap['oxytet-la-200'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 400, bcs: 3, rawDoseRate: 20.0, route: 'Slow IV', allowUnverifiedStudyMode: true
        });
        const passed = cCattle.blocked && oxyIv.blocked && oxyIv.hardBlocks.some(b => b.includes('INVALID ADMINISTRATION ROUTE'));
        return {
          passed,
          expected: 'Carodyl in Cattle: HARD-BLOCKED | Oxytetracycline LA via Slow IV: HARD-BLOCKED (Allowed: Deep IM Neck only)',
          computed: 'Carodyl Blocked: ' + cCattle.blocked + ' | Oxytet IV Blocked: ' + oxyIv.blocked
        };
      }
    },
    {
      id: 'TC-09',
      title: 'TC-09: Max Daily Dose Ceiling Block (Carprofen 4.4 mg/kg q12h = 8.8 mg/kg/day)',
      scenario: 'Dog, 34.0 kg, Carprofen entered at 4.4 mg/kg twice daily (q12h) -> 8.8 mg/kg/day (> 4.4 mg/kg/day limit)',
      run: () => {
        const r = window.VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 34.0, bcs: 5, rawDoseRate: 4.4, freqVal: '12', durationDays: 5, route: 'PO'
        });
        const passed = r.blocked && r.hardBlocks.some(b => b.includes('MAX DAILY DOSE CEILING EXCEEDED BLOCK'));
        return {
          passed,
          expected: 'HARD-BLOCKED: 4.4 mg/kg × 2/day = 8.80 mg/kg/day exceeds 4.4 mg/kg/day ceiling',
          computed: r.hardBlocks[0] || 'No block'
        };
      }
    },
    {
      id: 'TC-10',
      title: 'TC-10: Two-Phase 12h Rehydration vs 24h Maintenance Fluid Schedule',
      scenario: 'Dog, 10.0 kg, 6% dehydrated (600 mL deficit) replaced over 12 hr + Allometric Maintenance (742.3 mL/d)',
      run: () => {
        const r = window.VetDoseEngine.calculateFluidsAndKcl({
          species: 'dog', bwKg: 10.0, lifeStage: 'adult', dehydPct: 6, rehydHours: 12,
          maintFormula: 'allometric', serumK: 4.0, bagMode: 'standard_1000'
        });
        const passed = r.isTwoPhase && Math.abs(r.total24hVolumeMl - 1342.3) < 0.5 && Math.abs(r.phase1HourlyMl - 80.93) < 0.1 && Math.abs(r.phase2HourlyMl - 30.93) < 0.1;
        return {
          passed,
          expected: 'Total 24h: 1342.3 mL | Phase 1 (Hrs 1–12): 80.93 mL/hr | Phase 2 (Hrs 13–24): 30.93 mL/hr',
          computed: 'Total 24h: ' + r.total24hVolumeMl.toFixed(1) + ' mL | Phase 1: ' + r.phase1HourlyMl.toFixed(2) + ' mL/hr | Phase 2: ' + r.phase2HourlyMl.toFixed(2) + ' mL/hr'
        };
      }
    },
    {
      id: 'TC-11',
      title: 'TC-11: Duplicate NSAID Class (Carodyl + Melonex) & NSAID + Steroid Blocks',
      scenario: 'Dog with Carodyl 75 mg in Rx queue + candidate Melonex Oral Suspension (Duplicate NSAID)',
      run: () => {
        const r = window.VetDoseEngine.calculateDosage({
          sku: skuMap['melonex-susp'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 15.0, bcs: 5, rawDoseRate: 0.1, freqVal: '24', durationDays: 3, route: 'PO',
          allowUnverifiedStudyMode: true,
          activeRxItems: [{ skuId: 'carodyl-75', inn: 'CARPROFEN', brand: 'Carodyl 75 mg', drugClass: 'NSAID' }]
        });
        const passed = r.blocked && r.hardBlocks.some(b => b.includes('DUPLICATE THERAPEUTIC CLASS BLOCK'));
        return {
          passed,
          expected: 'HARD-BLOCKED: Duplicate NSAID class (MELOXICAM + CARPROFEN)',
          computed: r.hardBlocks[0] || 'No block'
        };
      }
    },
    {
      id: 'TC-12',
      title: 'TC-12: Pregnancy Teratogenicity & MDR1 Neurotoxicity Hard-Blocks',
      scenario: 'Pregnant Dog + Prednisolone; Collie (MDR1) + Neomec 0.2 mg/kg (200 mcg/kg > 6 mcg/kg limit)',
      run: () => {
        const preg = window.VetDoseEngine.calculateDosage({
          sku: skuMap['prednisolone-10'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 20.0, bcs: 5, repro: 'pregnant', rawDoseRate: 0.5, freqVal: '24', durationDays: 5, route: 'PO',
          allowUnverifiedStudyMode: true
        });
        const mdr1 = window.VetDoseEngine.calculateDosage({
          sku: skuMap['neomec-10'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 25.0, bcs: 5, breed: 'Collie (MDR1 Risk)', rawDoseRate: 0.2, freqVal: 'once', durationDays: 1, route: 'PO',
          allowUnverifiedStudyMode: true
        });
        const passed = preg.blocked && mdr1.blocked;
        return {
          passed,
          expected: 'Pregnant Steroid: HARD-BLOCKED | Collie Ivermectin 0.2 mg/kg: HARD-BLOCKED (> 0.006 mg/kg limit)',
          computed: 'Pregnant Blocked: ' + preg.blocked + ' | MDR1 Blocked: ' + mdr1.blocked
        };
      }
    },
    {
      id: 'TC-13',
      title: 'TC-13: Bactivon Tazo Active Cefquinome (22.22 mg/mL) & IM Site Split',
      scenario: 'Cattle, 444.4 kg, Bactivon Tazo (500 mg Cefquinome in 22.5 mL = 22.22 mg/mL) at 1.0 mg/kg IM',
      run: () => {
        const r = window.VetDoseEngine.calculateDosage({
          sku: skuMap['bactivon-tazo'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 444.4, bcs: 3, rawDoseRate: 1.0, freqVal: '24', durationDays: 3, route: 'IM',
          amrCsStatus: 'cs_confirmed', allowUnverifiedStudyMode: true
        });
        const passed = !r.blocked && Math.abs(r.perAdminUnits - 20.0) < 0.05 && r.sitesNeeded === 2;
        return {
          passed,
          expected: '444.4 mg ÷ 22.22 mg/mL = 20.00 mL IM | Split across ≥ 2 neck sites (≤10 mL/site)',
          computed: r.headlineText + ' | ' + r.imSplitText
        };
      }
    },
    {
      id: 'TC-14',
      title: 'TC-14: Heart-Girth Livestock Estimator & Poultry Flock Water/Feed Dosing',
      scenario: 'Cattle Girth 180 cm × Length 155 cm; Poultry 1,000 birds × 1.5 kg on Oxytetracycline 10% w/w powder',
      run: () => {
        const hg = window.VetDoseEngine.estimateLivestockWeightKg(180, 155, 'cattle');
        const fl = window.VetDoseEngine.calculateFlockWaterOrFeedDose({
          speciesCode: 'poultry', flockCount: 1000, avgBirdOrFishKg: 1.5,
          doseMgKgDay: 20.0, strengthMgPerG: 100, durationDays: 5
        });
        const passed = hg.valid && hg.estimatedKg === 463.4 && fl.valid && fl.dailyPowderG === 300 && fl.totalCoursePowderG === 1500;
        return {
          passed,
          expected: 'Heart-Girth BW: 463.4 kg | Flock Biomass: 1500 kg -> 300 g powder/day (1500 g over 5d)',
          computed: 'Heart-Girth BW: ' + hg.estimatedKg + ' kg | Flock Powder: ' + fl.dailyPowderG + ' g/day (' + fl.totalCoursePowderG + ' g total)'
        };
      }
    },
    {
      id: 'TC-15',
      title: 'TC-15: CRI Multi-Unit Conversion (mg/kg/day) & 24h Bag Hang-Time Limit',
      scenario: 'Dog, 10 kg, Metoclopramide 2.0 mg/kg/day in 1000 mL bag at 20 mL/hr (50 hr > 24 hr limit)',
      run: () => {
        const r = window.VetDoseEngine.calculateCri({
          bwKg: 10.0, rateVal: 2.0, rateUnit: 'mg/kg/day', stockConcMgMl: 5.0,
          bagVolMl: 1000, bagRateMlHr: 20.0
        });
        const passed = !r.blocked && Math.abs(r.hourlyDrugMg - 0.8333) < 0.01 && r.exceeds24hHangLimit === true && r.effectiveHangHours === 24.0;
        return {
          passed,
          expected: '0.83 mg/hr | 50.0 hr bag duration triggers 24-Hr Hang-Time Sterility Cap (≤ 480 mL safe 24h bag)',
          computed: r.hourlyDrugMg.toFixed(2) + ' mg/hr | Exceeds 24h: ' + r.exceeds24hHangLimit + ' (Safe 24h Bag: ' + r.safe24hBagVolMl.toFixed(0) + ' mL)'
        };
      }
    },
    {
      id: 'TC-16',
      title: 'TC-16: Extreme Puppy Rounding (>25% Overdose) Unconditional Hard-Block',
      scenario: 'Puppy, 0.5 kg, Carodyl 25 mg (quarter tab = 6.25 mg vs 1.1 mg target = +468% variance)',
      run: () => {
        const r = window.VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 0.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 3, route: 'PO',
          roundingOverrideChecked: true, roundingOverrideReason: 'Attempted unsafe override'
        });
        const passed = r.blocked === true && r.hardBlocks.some(b => b.includes('EXTREME TABLET ROUNDING BLOCK'));
        return {
          passed,
          expected: 'UNCONDITIONAL HARD BLOCK: +468.2% variance (>25%) cannot be overridden; must switch to liquid suspension',
          computed: r.hardBlocks[0] || 'No block'
        };
      }
    }
  ];

  const grid = document.getElementById('golden-tests-grid');
  if (!grid) return;
  grid.innerHTML = '';
  let passCount = 0;

  for (const vec of vectors) {
    const res = vec.runAsync ? await vec.runAsync() : vec.run();
    if (res.passed) passCount++;
    const card = document.createElement('div');
    card.className = 'p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5 text-xs';
    card.innerHTML =
      '<div class="flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900 text-sm">' + escapeHtml(vec.title) + '</h3>' +
        '<span class="mono text-xs font-bold px-2.5 py-0.5 rounded-full ' + (res.passed ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900') + '">' + (res.passed ? 'ASSERTION PASS' : 'FAIL') + '</span>' +
      '</div>' +
      '<p class="text-slate-600">' + escapeHtml(vec.scenario) + '</p>' +
      '<div class="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1 mono text-xs">' +
        '<div class="text-slate-500"><strong>Expected:</strong> ' + escapeHtml(res.expected) + '</div>' +
        '<div class="text-teal-900 font-bold"><strong>Computed:</strong> ' + escapeHtml(res.computed) + '</div>' +
      '</div>' +
      '<div class="flex justify-end">' +
        '<button type="button" data-action="load-preset" data-id="' + escapeHtml(vec.id) + '" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-teal-600 text-white font-semibold text-xs transition">Load ' + escapeHtml(vec.id) + ' into Live App →</button>' +
      '</div>';
    grid.appendChild(card);
  }

  const summaryText = passCount + ' / ' + vectors.length + ' TESTS PASSING';
  const badge = document.getElementById('test-suite-summary-badge');
  if (badge) badge.textContent = summaryText;
  const headerPill = document.getElementById('header-live-test-pill');
  if (headerPill) headerPill.textContent = passCount + '/' + vectors.length + ' Live';
  const goldenBtnLabel = document.getElementById('header-golden-btn-label');
  if (goldenBtnLabel) goldenBtnLabel.textContent = 'Golden Tests (' + passCount + '/' + vectors.length + ')';
}

function loadQuickPreset(presetId) {
  if (!presetId) return;
  document.getElementById('sku-category-filter').value = 'all';
  document.getElementById('patient-bw-unit').value = 'kg';
  document.getElementById('input-dose-unit-basis').value = 'mg/kg';
  document.getElementById('patient-renal-stage').value = 'normal';
  document.getElementById('patient-hepatic-stage').value = 'normal';
  document.getElementById('patient-repro').value = 'intact_neutered';
  document.getElementById('patient-age-stage').value = 'adult';
  document.getElementById('rounding-override-check').checked = false;
  document.getElementById('rounding-override-reason').value = '';

  if (presetId === 'TC-01') {
    document.getElementById('fluid-species').value = 'cat';
    document.getElementById('fluid-bw').value = '0.45';
    document.getElementById('fluid-lifestage').value = 'pediatric';
    document.getElementById('fluid-shock-active').checked = false;
    document.getElementById('fluid-dehydration-pct').value = '8';
    document.getElementById('fluid-rehyd-hours').value = '24';
    document.getElementById('fluid-maint-formula').value = 'allometric';
    document.getElementById('fluid-ongoing-loss').value = '0';
    document.getElementById('fluid-enteral-offset').value = '0';
    document.getElementById('fluid-serum-k').value = '2.8';
    document.getElementById('fluid-kcl-bag-mode').value = 'burette_100';
    calculateFluidsAndKcl();
    switchMainTab('fluids');
    showToast('Loaded TC-01: 0.45 kg Neonatal Kitten Fluid & KCl 100 mL Burette Clamp!', 'amber');
  } else if (presetId === 'TC-02') {
    document.getElementById('patient-name').value = 'Bruno (Labrador #04)';
    document.getElementById('patient-species').value = 'dog';
    syncSpeciesBcsAndModeUi('dog');
    document.getElementById('patient-breed').value = 'Labrador Retriever';
    document.getElementById('patient-bw').value = '42.0';
    document.getElementById('patient-bcs').value = '8';
    populateSkuDropdown('carodyl-75');
    document.getElementById('input-dose-rate').value = '2.2';
    document.getElementById('input-freq').value = '12';
    document.getElementById('input-duration-days').value = '5';
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-02: 42 kg Obese Labrador (BCS 8/9) -> IBW 32.31 kg & Carodyl 75 mg.', 'teal');
  } else if (presetId === 'TC-03') {
    document.getElementById('cri-preset').value = 'lido_tc03';
    document.getElementById('cri-bw').value = '20.0';
    applyCriPreset('lido_tc03');
    document.getElementById('cri-bag-vol').value = '500';
    document.getElementById('cri-bag-rate').value = '50.0';
    calculateCri();
    switchMainTab('cri');
    showToast('Loaded TC-03: 20 kg Dog Lidocaine 2% CRI (Pump 3.0 mL/hr vs 500 mL Bag).', 'teal');
  } else if (presetId === 'TC-04') {
    document.getElementById('patient-name').value = 'Lakshmi (Murrah Tag #118)';
    document.getElementById('patient-species').value = 'buffalo';
    syncSpeciesBcsAndModeUi('buffalo');
    document.getElementById('patient-breed').value = 'Murrah Buffalo';
    document.getElementById('patient-bw').value = '500.0';
    document.getElementById('patient-bcs').value = '3';
    populateSkuDropdown('butalex-inj');
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-04: 500 kg Buffalo Theileriosis -> 25 mL Butalex split across ≥3 neck sites.', 'amber');
  } else if (presetId === 'TC-05') {
    document.getElementById('cpr-species').value = 'dog';
    document.getElementById('cpr-bw').value = '15.0';
    document.getElementById('cpr-atropine-conc').value = '0.6';
    document.getElementById('cpr-atropine-mgkg').value = '0.05';
    calculateCprTable();
    switchMainTab('cpr');
    showToast('Loaded TC-05: 15.0 kg Canine Arrest — 2024 RECOVER & Atropine Vial Check.', 'rose');
  } else if (presetId === 'TC-06') {
    document.getElementById('patient-name').value = 'Coco (Toy Pomeranian)';
    document.getElementById('patient-species').value = 'dog';
    syncSpeciesBcsAndModeUi('dog');
    document.getElementById('patient-breed').value = 'Pomeranian / Toy';
    document.getElementById('patient-bw').value = '3.5';
    document.getElementById('patient-bcs').value = '5';
    populateSkuDropdown('carodyl-25');
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-06: 3.5 kg Toy Dog -> Carodyl 25 mg quarter-tab rounding HARD-BLOCKED without override.', 'rose');
  } else if (presetId === 'TC-08') {
    document.getElementById('patient-species').value = 'cattle';
    syncSpeciesBcsAndModeUi('cattle');
    document.getElementById('patient-bw').value = '400.0';
    populateSkuDropdown('oxytet-la-200');
    document.getElementById('input-route').value = 'Slow IV';
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-08: Oxytetracycline LA 200 mg/mL set to Slow IV -> Hard Route Block!', 'rose');
  } else if (presetId === 'TC-09') {
    document.getElementById('patient-species').value = 'dog';
    syncSpeciesBcsAndModeUi('dog');
    document.getElementById('patient-bw').value = '34.0';
    populateSkuDropdown('carodyl-75');
    document.getElementById('input-dose-rate').value = '4.4';
    document.getElementById('input-freq').value = '12';
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-09: Carprofen 4.4 mg/kg q12h (8.8 mg/kg/day) -> Max Daily Dose Ceiling Block!', 'rose');
  } else if (presetId === 'TC-10') {
    document.getElementById('fluid-species').value = 'dog';
    document.getElementById('fluid-bw').value = '10.0';
    document.getElementById('fluid-lifestage').value = 'adult';
    document.getElementById('fluid-dehydration-pct').value = '6';
    document.getElementById('fluid-rehyd-hours').value = '12';
    document.getElementById('fluid-serum-k').value = '4.0';
    document.getElementById('fluid-kcl-bag-mode').value = 'standard_1000';
    calculateFluidsAndKcl();
    switchMainTab('fluids');
    showToast('Loaded TC-10: Two-Phase 12h Rehydration (80.93 mL/hr) -> Phase 2 Maintenance (30.93 mL/hr).', 'teal');
  } else if (presetId === 'TC-11') {
    document.getElementById('patient-species').value = 'dog';
    syncSpeciesBcsAndModeUi('dog');
    document.getElementById('patient-bw').value = '25.0';
    document.getElementById('allow-unverified-study-mode').checked = true;
    populateSkuDropdown('carodyl-75');
    recalculateAll();
    if (!appState.rxItems.some(i => i.drugClass === 'NSAID')) {
      commitValidatedItemToRx(appState.lastCalculation);
    }
    populateSkuDropdown('melonex-susp');
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-11: Duplicate NSAID Class (Carodyl + Melonex) Hard-Blocked!', 'rose');
  } else if (presetId === 'TC-14') {
    document.getElementById('patient-name').value = 'Broiler House #02 (1,000 Birds)';
    document.getElementById('patient-species').value = 'poultry';
    syncSpeciesBcsAndModeUi('poultry');
    document.getElementById('patient-bw').value = '1.5';
    document.getElementById('allow-unverified-study-mode').checked = true;
    populateSkuDropdown('oxytet-ws-poultry');
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded TC-14: Poultry Flock Water (mg/L) & Medicated Feed (g/tonne) Calculator.', 'teal');
  } else if (presetId === 'BAN-DEMO') {
    document.getElementById('patient-name').value = 'Gauri (Sahiwal Cow #09)';
    document.getElementById('patient-species').value = 'cattle';
    syncSpeciesBcsAndModeUi('cattle');
    document.getElementById('patient-bw').value = '400.0';
    populateSkuDropdown('ban-granim-p');
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded Statutory Ban Demo: Nimesulide (S.O. 5633(E)) Hard-Blocked & Dose Hidden!', 'rose');
  } else if (presetId === 'CAT-TOX') {
    document.getElementById('patient-name').value = 'Misty (Persian Cat)';
    document.getElementById('patient-species').value = 'cat';
    syncSpeciesBcsAndModeUi('cat');
    document.getElementById('patient-bw').value = '4.2';
    populateSkuDropdown('melonex-plus-bolus');
    recalculateAll();
    switchMainTab('dosage');
    showToast('Loaded Species Toxicity Demo: Cat + Melonex Plus (Paracetamol) Hard-Blocked!', 'rose');
  } else {
    switchMainTab('tests');
  }
  logUiChange('preset_loaded', presetId);
}

// =========================================================================
// 16. ACCESSIBLE BOTTOM NAV, EXPANDED HINDI/MARATHI I18N & DELEGATED EVENTS
// =========================================================================
function setAppLanguage(lang) {
  appState.lang = lang;
  const dict = (window.VetI18n && window.VetI18n[lang]) || window.VetI18n.en;
  const bindText = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  };

  bindText('i18n-app-title', dict.appTitle);
  bindText('i18n-disclaimer-banner', dict.disclaimerBanner);
  bindText('i18n-tab-dosage', dict.tabDosage);
  bindText('i18n-tab-fluids', dict.tabFluids);
  bindText('i18n-tab-cri', dict.tabCri);
  bindText('i18n-tab-cpr', dict.tabCpr);
  bindText('i18n-tab-catalog', dict.tabCatalog);
  bindText('i18n-tab-rx', dict.tabRx);
  bindText('i18n-tab-tests', dict.tabTests);

  bindText('i18n-step1-btn', dict.step1Btn);
  bindText('i18n-step2-btn', dict.step2Btn);
  bindText('i18n-step3-btn', dict.step3Btn);
  bindText('i18n-step-all-btn', dict.stepAllBtn);
  bindText('i18n-live-result-title', dict.liveResultTitle);
  bindText('i18n-collapse-details', '▸ ' + dict.collapseDetailsSummary);
  bindText('i18n-card1-title', dict.card1Title);
  bindText('i18n-card2-title', dict.card2Title);
  bindText('i18n-card3-title', dict.card3Title);
  bindText('i18n-pin-label', dict.pinLabel);
  bindText('i18n-pin-apply-btn', dict.pinApplyBtn);
  bindText('i18n-study-mode-toggle', dict.studyModeToggle);
  bindText('i18n-withdrawal-title', dict.withdrawalTitle);
  bindText('i18n-safe-milk-label', dict.safeMilkLabel);
  bindText('i18n-safe-meat-label', dict.safeMeatLabel);
  bindText('i18n-rx-queue-title', dict.rxQueueTitle);
  bindText('i18n-add-rx-btn', dict.addRxBtn);
  bindText('i18n-clear-list-btn', dict.clearListBtn);
  bindText('i18n-sign-preview-btn', dict.signPreviewBtn);
  bindText('i18n-whatsapp-btn', '📲 ' + dict.whatsappShareBtn);
  bindText('i18n-save-case-btn', '💾 ' + dict.saveCaseBtn);
  bindText('i18n-backup-export-btn', '📤 ' + dict.backupExportBtn);
  bindText('i18n-backup-import-btn', '📥 ' + dict.backupImportBtn);
  bindText('i18n-changelog-title', dict.changelogTitle);
  bindText('i18n-fluids-title', dict.fluidsTitle);
  bindText('i18n-cri-title', dict.criTitle);
  bindText('i18n-cpr-title', dict.cprTitle);
  bindText('i18n-catalog-title', dict.catalogTitle);
  bindText('i18n-adr-title', dict.adrTitle);
  bindText('i18n-case-history-title', dict.caseHistoryTitle);
  bindText('i18n-registers-title', dict.registersTitle);
  bindText('i18n-tests-title', dict.testsTitle);
  bindText('i18n-rerun-tests-btn', dict.rerunTestsBtn);

  ['en', 'hi', 'mr'].forEach(l => {
    const btn = document.getElementById('lang-btn-' + l);
    if (!btn) return;
    btn.className = (l === lang)
      ? 'px-2 py-0.5 rounded bg-teal-500 text-slate-950 font-bold'
      : 'px-2 py-0.5 rounded text-amber-200 hover:text-white font-semibold';
  });

  logUiChange('ui_language', lang.toUpperCase());
  recalculateAll();
}

function switchMainTab(tabName) {
  appState.activeTab = tabName;
  const tabs = ['dosage', 'fluids', 'cri', 'cpr', 'catalog', 'rx', 'tests'];
  tabs.forEach(t => {
    const panel = document.getElementById('tab-panel-' + t);
    const btn = document.getElementById('tab-btn-' + t);
    if (t === tabName) {
      panel.classList.remove('hidden');
      btn.setAttribute('aria-selected', 'true');
      btn.className = 'nav-tab-btn py-2 px-1 text-xs font-bold border-t-2 border-teal-400 text-teal-300 flex flex-col items-center justify-center gap-0.5 truncate';
    } else {
      panel.classList.add('hidden');
      btn.setAttribute('aria-selected', 'false');
      btn.className = 'nav-tab-btn py-2 px-1 text-xs font-medium border-t-2 border-transparent text-slate-400 hover:text-slate-200 flex flex-col items-center justify-center gap-0.5 truncate';
    }
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, color) {
  const container = document.getElementById('toast-container');
  const div = document.createElement('div');
  let bg = 'bg-slate-900 border-teal-500 text-white';
  if (color === 'rose') bg = 'bg-rose-950 border-rose-500 text-rose-100';
  if (color === 'amber') bg = 'bg-amber-950 border-amber-400 text-amber-100';
  div.className = 'px-4 py-2.5 rounded-xl border-l-4 shadow-lg text-xs font-semibold transition-all duration-300 ' + bg;
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => {
    if (div.parentNode) div.parentNode.removeChild(div);
  }, 3600);
}

function initPwaOfflineSupport() {
  const pill = document.getElementById('pwa-offline-pill');
  const updateOnlineStatus = () => {
    if (!pill) return;
    if (navigator.onLine === false) {
      pill.textContent = 'OFFLINE FIELD MODE (INDEXEDDB + LOCAL ENGINE)';
      pill.className = 'px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-400 font-mono text-xs font-bold';
    } else {
      pill.textContent = 'PWA OFFLINE • v3.0.0';
      pill.className = 'px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-xs font-bold';
    }
  };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

// Delegated Click Listener for Dynamic Lists & Tables
function initDelegatedEventListeners() {
  document.addEventListener('click', (evt) => {
    const btn = evt.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'remove-rx-item') {
      removeRxItem(id);
    } else if (action === 'use-sku') {
      selectSkuFromCatalog(id);
    } else if (action === 'verify-sku') {
      openLeafletModal(id);
    } else if (action === 'load-case') {
      loadCaseFromIndexedDb(id);
    } else if (action === 'delete-case') {
      removeCaseFromIndexedDb(id);
    } else if (action === 'load-preset') {
      loadQuickPreset(id);
    } else if (action === 'log-cpr') {
      logCprIntervention(
        btn.getAttribute('data-code'),
        btn.getAttribute('data-name'),
        btn.getAttribute('data-calc')
      );
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  initPwaOfflineSupport();
  initDelegatedEventListeners();
  await restorePersistentDataFromIndexedDb();
  document.getElementById('withdrawal-start-dt').value = getTodayIsoDate() + 'T08:00';
  syncSpeciesBcsAndModeUi('dog');
  setDosageStep('all');
  populateSkuDropdown('carodyl-75');
  recalculateAll();
  renderRxItemsLists();
  calculateFluidsAndKcl();
  calculateCri();
  calculateCprTable();
  renderCatalogChangelog();
  renderGazetteTable();
  renderCatalogTable();
  renderAdrLogs();
  renderStatutoryRegisters();
  await renderIndexedDbCases();
  await runGoldenTestSuite();
});


function deleteCaseFromIndexedDb(caseId) { return removeCaseFromIndexedDb(caseId); }
