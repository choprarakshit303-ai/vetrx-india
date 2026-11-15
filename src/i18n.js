/**
 * VetRx India — Comprehensive Trilingual Localization Module (`src/i18n.js`, v3.0.0)
 * Covers English (EN), Hindi (हिन्दी), and Marathi (मराठी) across tabs, steppers, labels, and alerts.
 */
(function (root) {
  'use strict';

  const I18N_DICT = {
    en: {
      appTitle: 'VetRx India — Student Clinical Decision-Support & Dosage Sandbox',
      disclaimerBanner: 'STUDENT & DECISION-SUPPORT TOOL ONLY: Preloaded profiles are unlicensed academic placeholders. Verify all doses against Plumb\'s, BSAVA, or physical package inserts. Not for use on real patients without a Registered Veterinary Practitioner.',
      tabDosage: '1. Dosage & 7-Stage Pipeline',
      tabFluids: '2. AAHA 2024 Fluids & KCl Clamp',
      tabCri: '3. CRI & Dextrose Engine',
      tabCpr: '4. RECOVER 2024 CPR & Crash Cart',
      tabCatalog: '5. Indian SKU Catalog & CDSCO Bans',
      tabRx: '6. e-Prescription & H1/X/DPDP Logs',
      tabTests: '7. Golden Test Vectors (TC-01–16)',
      step1Btn: 'Step 1: Patient & Weight',
      step2Btn: 'Step 2: Drug & Regimen',
      step3Btn: 'Step 3: Withdrawal & Queue',
      stepAllBtn: 'All Steps View',
      resultCardTitle: 'Live Dose Output & Safety Gate Summary',
      detailsSummaryToggle: 'Show Detailed Pharmacokinetic, BSA & Pack Breakdown',
      studyModeLabel: 'Student Study Mode (Allow Unverified Reference Monographs with Warning)',
      withdrawalTitle: 'Mandatory Food-Safety Milk & Meat Withdrawal Safe-Date Calculator',
      safeMilkLabel: 'Safe Milk Consumption / Sale From:',
      safeMeatLabel: 'Safe Meat Slaughter / Sale From:',
      whatsappShareBtn: 'Share via WhatsApp (Trilingual + QR)',
      sectionFluidsTitle: 'Two-Phase Compartmental Fluid Engine, 100 mL Burette & 15% KCl Clamping',
      sectionCriTitle: 'Syringe Pump vs. Carrier Bag CRI, Multi-Unit Selector & Dilution Lab',
      sectionCprTitle: '2024 RECOVER CPR Emergency Crash Cart & 3–5 Min Epinephrine Timer',
      sectionCatalogTitle: 'Indian SKU Catalog, Provenance Audit, Changelog & ADR Logger',
      sectionRxTitle: 'Clinical Worksheet Preview, Scannable QR & IndexedDB Backup/Restore',
      sectionTestsTitle: '16 Automated Golden Test Vectors (Direct VetDoseEngine Calls)'
    },
    hi: {
      appTitle: 'VetRx इंडिया — पशु चिकित्सा छात्र निर्णय-सहायता और खुराक कैलकुलेटर',
      disclaimerBanner: 'केवल शैक्षिक और निर्णय-सहायता उपकरण: यह ऐप पशु चिकित्सा छात्रों के अध्ययन और गणना अभ्यास के लिए है। किसी भी वास्तविक पशु पर उपयोग से पहले भौतिक दवा पर्ची (Leaflet), Plumb\'s या BSAVA से मिलान करें।',
      tabDosage: '1. खुराक और 7-चरणीय सुरक्षा',
      tabFluids: '2. AAHA 2024 फ्लूइड और KCl',
      tabCri: '3. CRI और डाइल्यूशन लैब',
      tabCpr: '4. RECOVER 2024 CPR इमरजेंसी',
      tabCatalog: '5. दवा सूची, गजट और ADR',
      tabRx: '6. वर्कशीट, QR और डेटा बैकअप',
      tabTests: '7. गोल्डन टेस्ट (TC-01–16)',
      step1Btn: 'चरण 1: पशु और वजन',
      step2Btn: 'चरण 2: दवा और खुराक',
      step3Btn: 'चरण 3: निकासी तिथि और सूची',
      stepAllBtn: 'सभी चरण एक साथ देखें',
      resultCardTitle: 'त्वरित खुराक परिणाम और सुरक्षा सारांश',
      detailsSummaryToggle: 'विस्तृत गणना, BSA और पैक जानकारी देखें',
      studyModeLabel: 'छात्र अध्ययन मोड (असत्यापित संदर्भ मोनोग्राफ की गणना चेतावनी के साथ अनुमति दें)',
      withdrawalTitle: 'अनिवार्य दूध और मांस निकासी (Withdrawal) सुरक्षित तिथि कैलकुलेटर',
      safeMilkLabel: 'दूध मानव उपयोग / बिक्री के लिए सुरक्षित तिथि:',
      safeMeatLabel: 'मांस बिक्री के लिए सुरक्षित तिथि:',
      whatsappShareBtn: 'WhatsApp पर साझा करें (हिंदी/मराठी/अंग्रेजी + QR)',
      sectionFluidsTitle: 'द्वि-चरणीय फ्लूइड थेरेपी, 100 mL ब्यूरेट और 15% KCl सुरक्षा क्लैंप',
      sectionCriTitle: 'सीरिंज पंप बनाम फ्लूइड बैग CRI और डाइल्यूशन प्रयोगशाला',
      sectionCprTitle: '2024 RECOVER CPR आपातकालीन चार्ट और 3–5 मिनट एपिनेफ्रीन टाइमर',
      sectionCatalogTitle: 'भारतीय दवा सूची, स्रोत सत्यापन, चेंजलॉग और ADR लॉग',
      sectionRxTitle: 'डिजिटल वर्कशीट, स्कैन करने योग्य QR कोड और IndexedDB बैकअप',
      sectionTestsTitle: '16 स्वचालित गोल्डन टेस्ट वेक्टर (सीधे VetDoseEngine परीक्षण)'
    },
    mr: {
      appTitle: 'VetRx इंडिया — पशुवैद्यकीय विद्यार्थी निर्णय-सहाय्य आणि डोस कॅल्क्युलेटर',
      disclaimerBanner: 'केवळ शैक्षणिक आणि निर्णय-सहाय्य साधन: हे ॲप पशुवैद्यकीय विद्यार्थ्यांच्या अभ्यासासाठी आहे. प्रत्यक्ष रुग्णावर वापरण्यापूर्वी मूळ औषध पत्रक (Leaflet), Plumb\'s किंवा BSAVA मधून खात्री करा.',
      tabDosage: '1. डोस आणि 7-स्तरीय सुरक्षा',
      tabFluids: '2. AAHA 2024 फ्लुइड आणि KCl',
      tabCri: '3. CRI आणि डायल्युशन लॅब',
      tabCpr: '4. RECOVER 2024 CPR आपत्कालीन',
      tabCatalog: '5. औषध सूची, राजपत्र आणि ADR',
      tabRx: '6. वर्कशीट, QR आणि डेटा बॅकअप',
      tabTests: '7. गोल्डन टेस्ट्स (TC-01–16)',
      step1Btn: 'टप्पा 1: प्राणी आणि वजन',
      step2Btn: 'टप्पा 2: औषध आणि मात्रा',
      step3Btn: 'टप्पा 3: विथड्रॉवल तारीख आणि यादी',
      stepAllBtn: 'सर्व टप्पे एकत्र पहा',
      resultCardTitle: 'तात्काळ डोस निकाल आणि सुरक्षा सारांश',
      detailsSummaryToggle: 'सविस्तर गणना, BSA आणि पॅक माहिती पहा',
      studyModeLabel: 'विद्यार्थी अभ्यास मोड (असत्यापित संदर्भ मोनोग्राफची गणना इशाऱ्यासह करण्याची परवानगी द्या)',
      withdrawalTitle: 'अनिवार्य दूध आणि मांस विथड्रॉवल (Withdrawal) सुरक्षित तारीख कॅल्क्युलेटर',
      safeMilkLabel: 'दूध विक्री / वापरासाठी सुरक्षित तारीख:',
      safeMeatLabel: 'मांस विक्रीसाठी सुरक्षित तारीख:',
      whatsappShareBtn: 'WhatsApp वर शेअर करा (मराठी/हिंदी/इंग्रजी + QR)',
      sectionFluidsTitle: 'द्वि-स्तरीय फ्लुइड थेरपी, 100 mL ब्युरेट आणि 15% KCl सुरक्षा क्लॅम्प',
      sectionCriTitle: 'सिरिंज पंप विरुद्ध फ्लुइड बॅग CRI आणि डायल्युशन लॅब',
      sectionCprTitle: '2024 RECOVER CPR आपत्कालीन तक्ता आणि 3–5 मिनिट एपिनेफ्रिन टाइमर',
      sectionCatalogTitle: 'भारतीय औषध सूची, स्रोत पडताळणी, चेंजलॉग आणि ADR लॉग',
      sectionRxTitle: 'डिजिटल वर्कशीट, स्कॅन करण्यायोग्य QR कोड आणि IndexedDB बॅकअप',
      sectionTestsTitle: '16 स्वयंचलित गोल्डन टेस्ट व्हेक्टर्स (थेट VetDoseEngine चाचण्या)'
    }
  };

  root.VetI18n = I18N_DICT;
})(typeof window !== 'undefined' ? window : globalThis);

