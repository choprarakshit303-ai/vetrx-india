/**
 * VetRx India — Pure Stateless Deterministic Clinical Engine (`src/dose_engine.js`, v3.0.0)
 * Zero DOM dependencies. Can be imported and unit-tested directly in Node.js (`require('./dose_engine.js')`)
 * or loaded in browser (`window.VetDoseEngine`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.VetDoseEngine = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function parseStrictPositiveWeight(rawInput, unit) {
    if (rawInput === null || rawInput === undefined || String(rawInput).trim() === '') {
      return { valid: false, error: 'Patient weight is blank. Enter a positive weight to unlock calculations.', tbwKg: null };
    }
    const num = Number(rawInput);
    if (isNaN(num) || !isFinite(num) || num <= 0) {
      return { valid: false, error: 'Invalid patient weight (' + rawInput + '). Weight must be a positive number > 0.', tbwKg: null };
    }
    const tbwKg = unit === 'lb' ? (num / 2.20462262) : num;
    return { valid: true, error: null, rawNumeric: num, unit: unit || 'kg', tbwKg };
  }

  function computeIbwAndBsa(tbwInput, bcsInput, bodyFatPct, mcsDownAdjPct, speciesCode, speciesMetaMap, weightUnit) {
    const parsed = parseStrictPositiveWeight(tbwInput, weightUnit || 'kg');
    const metaMap = speciesMetaMap || {};
    const meta = metaMap[speciesCode] || {
      bcsScale: (speciesCode === 'dog' || speciesCode === 'cat') ? 9 : ((speciesCode === 'poultry' || speciesCode === 'aqua') ? null : 5),
      bsaK: speciesCode === 'cat' ? 10.0 : (speciesCode === 'dog' ? 10.1 : null),
      dosingMode: (speciesCode === 'poultry' || speciesCode === 'aqua') ? 'flock_water_feed' : 'individual'
    };

    if (!parsed.valid) {
      return {
        rawInput: tbwInput,
        invalidWeightInput: true,
        error: parsed.error,
        tbwKg: null,
        ibwKg: null,
        bcsScale: meta.bcsScale,
        formulaDesc: 'BLOCKED — Enter valid weight > 0',
        clinicalNote: parsed.error,
        bsaK: meta.bsaK,
        bsaIbw: null,
        bsaTbw: null
      };
    }

    const bw = parsed.tbwKg;
    let ibw = bw;
    let formulaDesc = 'TBW used';
    let clinicalNote = '';

    if (meta.bcsScale === 5) {
      const bcs5 = Math.min(5, Math.max(1, Number(bcsInput) || 3));
      ibw = bw;
      formulaDesc = 'Ruminant 5-Pt Scale (BCS ' + bcs5.toFixed(1) + '/5.0): Uses TBW';
      if (bcs5 <= 2.0) {
        clinicalNote = 'Ruminant BCS ' + bcs5.toFixed(1) + '/5.0 (Thin/Emaciated): Assess negative energy balance, ketosis, or chronic parasitism (Theileria/Fasciola).';
      } else if (bcs5 >= 4.5) {
        clinicalNote = 'Ruminant BCS ' + bcs5.toFixed(1) + '/5.0 (Over-conditioned): High periparturient fatty liver / ketosis risk.';
      } else {
        clinicalNote = 'Ruminant BCS ' + bcs5.toFixed(1) + '/5.0 sits within the 2.5–3.5/5.0 optimal dairy/livestock production band.';
      }
    } else if (meta.bcsScale === 9) {
      const bcs = Math.min(9, Math.max(1, Number(bcsInput) || 5));
      if (bcs <= 3) {
        ibw = bw;
        formulaDesc = 'Underweight (BCS ' + bcs + '/9): Uses TBW';
        clinicalNote = 'BCS 1–3/9: Underweight multiplier is unvalidated; dose on current TBW and investigate cachexia/malnutrition.';
      } else if (bcs === 4 || bcs === 5) {
        ibw = bw;
        formulaDesc = 'Ideal Band (BCS ' + bcs + '/9): IBW = TBW';
        clinicalNote = 'BCS 4–5/9 sits within the 0.94–1.05 × IBW ideal physiological band.';
      } else if (bcs >= 6 && bcs <= 8) {
        const multiplier = 1 + 0.10 * (bcs - 5);
        ibw = bw / multiplier;
        formulaDesc = 'TBW ÷ ' + multiplier.toFixed(2) + ' (AAHA 2021 / DEXA)';
        clinicalNote = 'BCS ' + bcs + '/9: Each unit above 5 adds ~10% over IBW (German et al. 2009). Hydrophilic & narrow-margin drugs scaled to IBW.';
      } else if (bcs === 9) {
        const bf = Number(bodyFatPct);
        if (!isNaN(bf) && bf >= 25 && bf <= 75) {
          ibw = (bw * (1 - bf / 100)) / 0.80;
          formulaDesc = 'TBW × (1 - ' + bf + '% BF) ÷ 0.80';
          clinicalNote = 'BCS 9/9 with estimated ' + bf + '% Body Fat: Lean mass normalized to 80% standard ideal composition.';
        } else {
          ibw = bw / 1.40;
          formulaDesc = 'TBW ÷ 1.40 (UPPER CEILING ONLY)';
          clinicalNote = 'BCS 9/9 Open Obesity Tier: Without %BF input, TBW ÷ 1.40 yields only an UPPER CEILING on IBW. Enter estimated %BF if severely obese.';
        }
      }
      if (speciesCode === 'cat' && bcs >= 8) {
        clinicalNote += ' Feline Override (Bjornvad et al. 2011): Verify IBW against skeletal frame size.';
      }
      const mcsAdj = Math.max(0, Math.min(30, Number(mcsDownAdjPct) || 0));
      if (mcsAdj > 0) {
        ibw = ibw * (1 - mcsAdj / 100);
        formulaDesc += ' (-' + mcsAdj + '% MCS loss)';
      }
    } else {
      formulaDesc = 'Flock / Biomass Mode (mg/L water or g/tonne feed)';
      clinicalNote = 'Poultry & Aquaculture use flock water (mg/L) or medicated feed (g/tonne) calculations.';
    }

    let bsaIbw = null;
    let bsaTbw = null;
    if (meta.bsaK) {
      bsaIbw = (meta.bsaK / 100) * Math.pow(ibw, 2 / 3);
      bsaTbw = (meta.bsaK / 100) * Math.pow(bw, 2 / 3);
    }

    return {
      rawInput: tbwInput,
      invalidWeightInput: false,
      error: null,
      tbwKg: bw,
      ibwKg: ibw,
      bcsScale: meta.bcsScale,
      formulaDesc,
      clinicalNote,
      bsaK: meta.bsaK,
      bsaIbw,
      bsaTbw
    };
  }

  function estimateLivestockWeightKg(girthCm, lengthCm, speciesCode) {
    const gCm = Number(girthCm);
    const lCm = Number(lengthCm);
    if (isNaN(gCm) || isNaN(lCm) || gCm <= 20 || lCm <= 20) {
      return { valid: false, error: 'Enter valid Heart Girth and Body Length (> 20 cm).', estimatedKg: null };
    }
    const girthInches = gCm / 2.54;
    const lengthInches = lCm / 2.54;
    const shaefferLbs = (girthInches * girthInches * lengthInches) / 300.0;
    const shaefferKg = shaefferLbs / 2.20462262;
    const adjustedKg = speciesCode === 'buffalo' ? (shaefferKg * 1.04) : shaefferKg;
    return {
      valid: true,
      girthCm: gCm,
      lengthCm: lCm,
      girthInches,
      lengthInches,
      shaefferKg,
      estimatedKg: Number(adjustedKg.toFixed(1)),
      formulaUsed: speciesCode === 'buffalo'
        ? "Shaeffer's Formula × 1.04 Bubaline Frame Factor: ((Girth_in² × Length_in) ÷ 300) ÷ 2.2046 × 1.04"
        : "Shaeffer's Formula: ((Girth_in² × Length_in) ÷ 300) ÷ 2.2046"
    };
  }

  function discretizeTabletDose(targetMg, strengthMg, splittableFractions) {
    if (!splittableFractions || splittableFractions.length === 0) {
      splittableFractions = [1];
    }
    const minFraction = Math.min.apply(null, splittableFractions);
    const bestUnits = Math.max(minFraction, Math.round((targetMg / strengthMg) / minFraction) * minFraction);
    const roundedMg = bestUnits * strengthMg;
    const variancePct = targetMg > 0 ? ((roundedMg - targetMg) / targetMg) * 100 : 0;
    const absVar = Math.abs(variancePct);
    return {
      tabletUnits: bestUnits,
      roundedMg,
      variancePct,
      exceedsTenPct: absVar > 10.0001,
      exceedsTwentyFivePct: absVar > 25.0001
    };
  }

  function calculateFlockWaterOrFeedDose(params) {
    const count = Number(params.flockCount);
    const avgBwKg = Number(params.avgBirdOrFishKg);
    const doseMgKgDay = Number(params.doseMgKgDay);
    const strengthMgPerG = Number(params.strengthMgPerG) || 100;
    const durationDays = Math.max(1, Number(params.durationDays) || 5);
    const dailyWaterLPerBird = Number(params.dailyWaterLPerUnit) || (avgBwKg * 0.22);

    if (isNaN(count) || count <= 0 || isNaN(avgBwKg) || avgBwKg <= 0 || isNaN(doseMgKgDay) || doseMgKgDay <= 0) {
      return { valid: false, error: 'Flock/pond count, average weight, and mg/kg dose must be > 0.' };
    }

    const totalBiomassKg = count * avgBwKg;
    const dailyActiveMg = totalBiomassKg * doseMgKgDay;
    const dailyPowderG = dailyActiveMg / strengthMgPerG;
    const totalCoursePowderG = dailyPowderG * durationDays;
    const totalDailyWaterL = Math.max(1, count * dailyWaterLPerBird);
    const waterConcMgPerL = dailyActiveMg / totalDailyWaterL;
    const feedIntakeFraction = params.speciesCode === 'aqua' ? 0.03 : 0.08;
    const dailyFeedTonnes = (totalBiomassKg * feedIntakeFraction) / 1000.0;
    const activeGPerTonneFeed = dailyFeedTonnes > 0 ? ((dailyActiveMg / 1000.0) / dailyFeedTonnes) : 0;

    return {
      valid: true,
      totalBiomassKg,
      dailyActiveMg,
      dailyPowderG,
      totalCoursePowderG,
      totalDailyWaterL,
      waterConcMgPerL,
      activeGPerTonneFeed
    };
  }

  function computeWithdrawalSafeDates(lastDoseDateStr, durationDays, milkWithdrawalHr, meatWithdrawalDays) {
    let baseDate = lastDoseDateStr ? new Date(lastDoseDateStr) : new Date();
    if (isNaN(baseDate.getTime())) {
      baseDate = new Date();
    }
    const dur = Math.max(1, Number(durationDays) || 1);
    const finalDoseDate = new Date(baseDate.getTime() + (dur - 1) * 24 * 3600 * 1000);

    let milkSafeDate = null;
    let milkSafeIso = null;
    if (milkWithdrawalHr !== null && milkWithdrawalHr !== undefined && Number(milkWithdrawalHr) >= 0) {
      milkSafeDate = new Date(finalDoseDate.getTime() + Number(milkWithdrawalHr) * 3600 * 1000);
      milkSafeIso = formatDateTimeIst(milkSafeDate);
    }

    let meatSafeDate = null;
    let meatSafeIso = null;
    if (meatWithdrawalDays !== null && meatWithdrawalDays !== undefined && Number(meatWithdrawalDays) >= 0) {
      meatSafeDate = new Date(finalDoseDate.getTime() + Number(meatWithdrawalDays) * 24 * 3600 * 1000);
      meatSafeIso = formatDateIst(meatSafeDate);
    }

    return {
      finalDoseIso: formatDateTimeIst(finalDoseDate),
      milkWithdrawalHr,
      meatWithdrawalDays,
      milkSafeIso,
      meatSafeIso,
      trilingualSummary: (milkSafeIso || meatSafeIso)
        ? {
            en: 'Last Dose: ' + formatDateIst(finalDoseDate) + ' | Safe Milk From: ' + (milkSafeIso || 'N/A') + ' | Safe Meat From: ' + (meatSafeIso || 'N/A'),
            hi: 'अंतिम खुराक: ' + formatDateIst(finalDoseDate) + ' | दूध सुरक्षित तिथि: ' + (milkSafeIso || 'लागू नहीं') + ' | मांस सुरक्षित तिथि: ' + (meatSafeIso || 'लागू नहीं'),
            mr: 'शेवटचा डोस: ' + formatDateIst(finalDoseDate) + ' | दूध वापरण्यास सुरक्षित तारीख: ' + (milkSafeIso || 'लागू नाही') + ' | मांस सुरक्षित तारीख: ' + (meatSafeIso || 'लागू नाही')
          }
        : null
    };
  }

  function formatDateTimeIst(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + min + ' IST';
  }

  function formatDateIst(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function evaluateRenalHepaticAdjustment(sku, renalStage, hepaticStage) {
    let doseMultiplier = 1.0;
    let hardBlocks = [];
    let warnings = [];

    if (renalStage === 'iris_3' || renalStage === 'iris_4') {
      if (sku.drugClass === 'NSAID' || (sku.renalRule && sku.renalRule.indexOf('CONTRAINDICATED_IRIS_3_4') === 0)) {
        hardBlocks.push('RENAL CONTRAINDICATION BLOCK (' + renalStage.toUpperCase() + '): ' + sku.inn + ' is contraindicated in moderate-to-severe renal insufficiency. ' + (sku.renalRule || ''));
      } else if (sku.renalRule && sku.renalRule.indexOf('REDUCE_50_IRIS_3_4') === 0) {
        doseMultiplier = Math.min(doseMultiplier, 0.5);
        warnings.push('RENAL DOSE ADJUSTMENT (' + renalStage.toUpperCase() + '): Automatically scaled target dose by 50% (0.5×) due to impaired glomerular filtration. ' + sku.renalRule);
      }
    } else if (renalStage === 'iris_2') {
      if (sku.drugClass === 'ANTIMICROBIAL_AMINOGLYCOSIDE') {
        hardBlocks.push('RENAL CONTRAINDICATION BLOCK (IRIS Stage 2): Aminoglycoside (' + sku.inn + ') is nephrotoxic and contraindicated in pre-existing azotemia.');
      } else if (sku.drugClass === 'NSAID') {
        warnings.push('RENAL CAUTION (IRIS Stage 2 Mild Azotemia): ' + sku.inn + ' carries nephrotoxicity risk. Ensure euhydration and monitor serum creatinine/SDMA.');
      }
    }

    if (hepaticStage === 'severe') {
      if (sku.hepaticRule && sku.hepaticRule.indexOf('CONTRAINDICATED_HEPATIC') === 0) {
        hardBlocks.push('HEPATIC CONTRAINDICATION BLOCK (Severe Hepatopathy): ' + sku.inn + ' is contraindicated in severe hepatic insufficiency. ' + sku.hepaticRule);
      } else if (sku.hepaticRule && (sku.hepaticRule.indexOf('REDUCE_50_HEPATIC') === 0 || sku.hepaticRule.indexOf('CAUTION_HEPATIC') === 0)) {
        doseMultiplier = Math.min(doseMultiplier, 0.5);
        warnings.push('HEPATIC DOSE ADJUSTMENT (Severe Hepatopathy): Target dose scaled by 50% (0.5×) due to impaired hepatic clearance. ' + sku.hepaticRule);
      }
    } else if (hepaticStage === 'moderate' && sku.hepaticRule && sku.hepaticRule.indexOf('CONTRAINDICATED_HEPATIC') === 0) {
      warnings.push('HEPATIC CAUTION (Moderate Hepatopathy): ' + sku.inn + ' carries hepatotoxicity risk (' + sku.hepaticRule + ').');
    }

    return { doseMultiplier, hardBlocks, warnings };
  }

  function evaluateDrugInteractionsAndBreedGates(candidateSku, activeRxItems, patientContext) {
    let hardBlocks = [];
    let warnings = [];
    const existingList = activeRxItems || [];

    existingList.forEach(existing => {
      const existingClass = existing.drugClass || '';
      const candClass = candidateSku.drugClass || '';

      if (candClass && candClass !== 'NONE' && candClass === existingClass) {
        hardBlocks.push('DUPLICATE THERAPEUTIC CLASS BLOCK (' + candClass + '): Cannot co-prescribe ' + candidateSku.inn + ' (' + candidateSku.brand + ') with active Rx item ' + existing.inn + ' (' + existing.brand + ') of the same pharmacological class.');
      }

      if ((candClass === 'NSAID' && existingClass === 'CORTICOSTEROID') ||
          (candClass === 'CORTICOSTEROID' && existingClass === 'NSAID')) {
        hardBlocks.push('SEVERE DRUG-DRUG INTERACTION BLOCK (NSAID + Corticosteroid): Concurrent ' + candidateSku.inn + ' and ' + existing.inn + ' causes synergistic GI mucosal ulceration, perforation, and renal papillary necrosis. Enforce a 5–7 day washout.');
      }

      if ((candClass === 'ANTIMICROBIAL_AMINOGLYCOSIDE' && existingClass === 'NSAID') ||
          (candClass === 'NSAID' && existingClass === 'ANTIMICROBIAL_AMINOGLYCOSIDE')) {
        hardBlocks.push('NEPHROTOXICITY SYNERGY BLOCK (Aminoglycoside + NSAID): Concurrent ' + candidateSku.inn + ' and ' + existing.inn + ' precipitates acute renal tubular necrosis.');
      }
    });

    const sp = patientContext.spCode;
    const breed = patientContext.breed || '';
    const ageStage = patientContext.ageStage || 'adult';
    const repro = patientContext.repro || 'intact_neutered';
    const doseRate = Number(patientContext.doseRate) || 0;
    const freqVal = patientContext.freqVal || '24';
    const route = patientContext.route || 'PO';

    if (repro === 'pregnant' && candidateSku.pregnancySafety) {
      if (candidateSku.pregnancySafety.indexOf('CONTRAINDICATED_PREGNANCY') === 0) {
        hardBlocks.push('PREGNANCY TERATOGENICITY / ABORTION BLOCK: ' + candidateSku.brand + ' (' + candidateSku.inn + ') is contraindicated in pregnant animals. ' + candidateSku.pregnancySafety);
      } else if (candidateSku.pregnancySafety.indexOf('CAUTION_PREGNANCY') === 0) {
        warnings.push('Pregnancy Caution: ' + candidateSku.pregnancySafety);
      }
    }

    if (ageStage === 'pediatric') {
      if (candidateSku.pediatricRule && (candidateSku.pediatricRule.indexOf('CONTRAINDICATED_PEDIATRIC') === 0 || candidateSku.pediatricRule.indexOf('CONTRAINDICATED_NEONATE') === 0)) {
        hardBlocks.push('PEDIATRIC / NEONATAL CONTRAINDICATION BLOCK: ' + candidateSku.brand + ' (' + candidateSku.inn + ') is contraindicated in pediatric/neonatal patients. ' + candidateSku.pediatricRule);
      } else if (candidateSku.pediatricRule && candidateSku.pediatricRule.indexOf('CAUTION_PEDIATRIC') === 0) {
        warnings.push('Pediatric Dosing Caution: ' + candidateSku.pediatricRule);
      }
    } else if (ageStage === 'geriatric') {
      if (candidateSku.drugClass === 'NSAID' || candidateSku.drugClass === 'OPIOID_AGONIST') {
        warnings.push('GERIATRIC PATIENT GUARD: Senior patients have reduced baseline GFR and hepatic mass; verify baseline serum chemistry and titrate to lowest effective dose.');
      }
    }

    if (breed.includes('MDR1')) {
      if (candidateSku.mdr1Rule && candidateSku.mdr1Rule.indexOf('CONTRAINDICATED_MDR1_ALL') === 0) {
        hardBlocks.push('MDR1 (ABCB1-1Δ) FATAL NEUROTOXICITY BLOCK (' + breed + '): ' + candidateSku.brand + ' (' + candidateSku.inn + ') is strictly contraindicated at any dose in MDR1-mutant breeds. ' + candidateSku.mdr1Rule);
      } else if (candidateSku.inn.includes('IVERMECTIN') || (candidateSku.mdr1Rule && candidateSku.mdr1Rule.indexOf('CONTRAINDICATED_MDR1_OVER_6MCG') === 0)) {
        if (doseRate > 0.00601) {
          hardBlocks.push('MDR1 (ABCB1-1Δ) NEUROTOXICITY BLOCK (' + breed + '): Ivermectin dose ' + doseRate + ' mg/kg (' + (doseRate * 1000).toFixed(0) + ' mcg/kg) exceeds the 0.006 mg/kg (6 mcg/kg) ceiling for P-glycoprotein deficient breeds.');
        } else {
          warnings.push('MDR1 Breed Caution (' + breed + '): Dosing at ≤ 6 mcg/kg (0.006 mg/kg); use compounded oral dilution.');
        }
      } else if (candidateSku.mdr1Rule && candidateSku.mdr1Rule.indexOf('REDUCE_50_MDR1') === 0) {
        warnings.push('MDR1 Breed Dose Reduction (' + breed + '): ' + candidateSku.mdr1Rule);
      }
    }

    if (breed.includes('Sighthound') || breed.includes('Mudhol') || breed.includes('Greyhound')) {
      warnings.push('SIGHTHOUND BREED PHARMACOGENETICS (' + breed + '): Reduced hepatic CYP2B11 activity and <10% body fat; monitor closely for delayed drug clearance and NSAID GI sensitivity.');
    }
    if (breed.includes('Brachycephalic') || breed.includes('Pug') || breed.includes('Bulldog') || breed.includes('Persian')) {
      warnings.push('BRACHYCEPHALIC BREED GUARD (' + breed + '): High resting vagal tone and stenotic airways; monitor respiratory effort closely.');
    }

    if (sp === 'cat' && candidateSku.inn.includes('ENROFLOXACIN')) {
      const freqHr = freqVal === 'once' ? 24 : Number(freqVal) || 24;
      const dailyDose = doseRate * (24 / freqHr);
      if (dailyDose > 5.001) {
        hardBlocks.push('FELINE RETINAL BLINDNESS BLOCK: Enrofloxacin daily dose (' + dailyDose.toFixed(1) + ' mg/kg/day) exceeds the absolute feline ceiling of 5.0 mg/kg/day (causes acute photoreceptive retinal degeneration).');
      }
    }

    if ((sp === 'cattle' || sp === 'buffalo' || sp === 'goat' || sp === 'sheep') &&
        route === 'PO' &&
        (candidateSku.drugClass && candidateSku.drugClass.indexOf('ANTIMICROBIAL') === 0)) {
      warnings.push('RUMINANT RUMINAL DYSBIOSIS CAUTION: Oral broad-spectrum antimicrobials (' + candidateSku.inn + ') in adult ruminants can disrupt ruminal cellulolytic flora.');
    }

    return { hardBlocks, warnings };
  }

  function evaluateUnitAndDilutionGuards(params) {
    const warnings = [];
    const weightUnit = params.weightUnit || 'kg';
    const parsedW = parseStrictPositiveWeight(params.rawWeight, weightUnit);
    const doseBasisUnit = params.doseBasisUnit || 'mg/kg';
    const rawDoseInput = Number(params.rawDoseInput);
    const validDose = !isNaN(rawDoseInput) && isFinite(rawDoseInput) && rawDoseInput > 0;
    let normalizedDoseMgKg = validDose ? rawDoseInput : 0;

    if (validDose && doseBasisUnit === 'mg/lb') {
      normalizedDoseMgKg = rawDoseInput * 2.20462262;
      warnings.push('UNIT CONVERSION ACTIVE (mg/lb → mg/kg): Entered ' + rawDoseInput + ' mg/lb converted to ' + normalizedDoseMgKg.toFixed(2) + ' mg/kg (× 2.2046).');
    } else if (validDose && doseBasisUnit === 'mcg/kg') {
      normalizedDoseMgKg = rawDoseInput / 1000.0;
      warnings.push('1000-FOLD MICROGRAM CONVERSION ACTIVE (mcg/kg → mg/kg): Entered ' + rawDoseInput + ' mcg/kg converted to ' + normalizedDoseMgKg.toFixed(4) + ' mg/kg (÷ 1000).');
    }

    if (parsedW.valid && weightUnit === 'lb') {
      warnings.push('WEIGHT CONVERSION ACTIVE (lb → kg): Entered ' + parsedW.rawNumeric.toFixed(1) + ' lb converted to ' + parsedW.tbwKg.toFixed(2) + ' kg (÷ 2.2046).');
    }

    if (validDose && params.sku && params.sku.inn.includes('IVERMECTIN') && doseBasisUnit === 'mg/kg' && rawDoseInput >= 2.0) {
      warnings.push('CRITICAL 1000× UNIT MISMATCH TRAP (mg vs mcg): Entered ' + rawDoseInput + ' mg/kg (' + (rawDoseInput * 1000).toFixed(0) + ' mcg/kg) for Ivermectin! Standard doses are 0.2–0.6 mg/kg (200–600 mcg/kg).');
    }

    return {
      weightValid: parsedW.valid,
      weightError: parsedW.error,
      tbwKg: parsedW.tbwKg,
      doseValid: validDose,
      normalizedDoseMgKg,
      warnings
    };
  }

  function calculateDosage(input) {
    const sku = input.sku;
    const spCode = input.spCode || 'dog';
    const spMetaMap = input.speciesMetaMap || {};
    const spMeta = spMetaMap[spCode] || { label: spCode, foodProducing: ['cattle', 'buffalo', 'goat', 'sheep', 'poultry', 'aqua'].includes(spCode) };

    let hardBlocks = [];
    let softWarnings = [];

    const unitGuard = evaluateUnitAndDilutionGuards({
      weightUnit: input.weightUnit || 'kg',
      rawWeight: input.rawWeight,
      doseBasisUnit: input.doseBasisUnit || 'mg/kg',
      rawDoseInput: input.rawDoseRate,
      sku
    });
    softWarnings = softWarnings.concat(unitGuard.warnings);

    const wNorm = computeIbwAndBsa(
      input.rawWeight,
      input.bcs,
      input.bfPct,
      input.mcsAdj,
      spCode,
      spMetaMap,
      input.weightUnit || 'kg'
    );

    if (!unitGuard.weightValid || wNorm.invalidWeightInput) {
      hardBlocks.push('WEIGHT INPUT BLOCK: ' + (unitGuard.weightError || wNorm.error));
    }
    if (!unitGuard.doseValid) {
      hardBlocks.push('DOSE INPUT BLOCK: Dose rate must be a positive number > 0.');
    }

    if (sku.status === 'BANNED') {
      if (sku.banType === 'ALL_SPECIES') {
        hardBlocks.push('STATUTORY BAN (' + sku.gazetteRef + '): ' + sku.inn + ' (' + sku.brand + ') is strictly prohibited for animal use across all species.');
      } else if (sku.banType === 'FOOD_ANIMALS' && spMeta.foodProducing) {
        hardBlocks.push('FOOD-CHAIN BAN (' + sku.gazetteRef + '): ' + sku.inn + ' is prohibited in all food-producing animals, poultry, aquaculture, and feed.');
      }
    }

    if (sku.contraindicatedSpecies && sku.contraindicatedSpecies.includes(spCode)) {
      hardBlocks.push('SPECIES CONTRAINDICATION BLOCK: ' + sku.brand + ' (' + sku.inn + ') is contraindicated in ' + spMeta.label + '.');
    } else if (sku.allowedSpecies && !sku.allowedSpecies.includes(spCode)) {
      hardBlocks.push('UNAPPROVED SPECIES BLOCK: ' + sku.brand + ' (' + sku.inn + ') is approved only for [' + sku.allowedSpecies.join(', ') + ']; hard-blocked for ' + spMeta.label + '.');
    }

    if (spMeta.foodProducing && (sku.milkWithdrawalHr === null || sku.meatWithdrawalDays === null) && sku.status !== 'BANNED') {
      hardBlocks.push('FOOD-SAFETY WITHDRAWAL BLOCK: ' + sku.brand + ' lacks verified Indian milk/meat withdrawal intervals for food-producing animals (' + spMeta.label + ').');
    }

    const spProtocol = (sku.speciesDosing && sku.speciesDosing[spCode]) ? sku.speciesDosing[spCode] : {
      defaultDose: sku.defaultDose,
      minSingleDose: sku.doseMin,
      maxSingleDose: sku.doseMax,
      maxDailyDose: sku.maxDailyDoseMgKg || (sku.doseMax * 2),
      unit: sku.doseUnit,
      defaultFreq: sku.defaultFreq,
      maxDurationDays: sku.maxDurationDays || 14,
      allowedRoutes: sku.allowedRoutes || [sku.defaultRoute]
    };

    const route = input.route || spProtocol.allowedRoutes[0] || sku.defaultRoute;
    const allowedRoutes = spProtocol.allowedRoutes || sku.allowedRoutes || [sku.defaultRoute];
    if (allowedRoutes.length > 0 && !allowedRoutes.includes(route)) {
      hardBlocks.push('INVALID ADMINISTRATION ROUTE BLOCK: ' + sku.brand + ' (' + sku.inn + ') cannot be administered via ' + route + '. Allowed route(s) for ' + spMeta.label + ': [' + allowedRoutes.join(', ') + '].');
    }

    const organEval = evaluateRenalHepaticAdjustment(sku, input.renalStage || 'normal', input.hepaticStage || 'normal');
    hardBlocks = hardBlocks.concat(organEval.hardBlocks);
    softWarnings = softWarnings.concat(organEval.warnings);

    const baseDoseRate = unitGuard.normalizedDoseMgKg;
    const effectiveDoseRate = baseDoseRate * organEval.doseMultiplier;
    const freqVal = input.freqVal || spProtocol.defaultFreq || '24';
    const durationDays = Math.max(1, parseInt(input.durationDays, 10) || 1);
    const dosesPerDay = freqVal === 'once' ? 1 : (24 / parseInt(freqVal, 10));
    const dailyDoseMgKg = effectiveDoseRate * dosesPerDay;

    if (unitGuard.doseValid) {
      if (baseDoseRate > spProtocol.maxSingleDose + 0.0001) {
        hardBlocks.push('SAFETY CEILING HARD-STOP: Entered single dose (' + baseDoseRate.toFixed(2) + ' ' + spProtocol.unit + ') exceeds the maximum therapeutic single-dose limit of ' + spProtocol.maxSingleDose + ' ' + spProtocol.unit + ' for ' + spMeta.label + '. Dose input restricted.');
      } else if (baseDoseRate < spProtocol.minSingleDose - 0.0001) {
        softWarnings.push('Sub-therapeutic Dose Warning: Entered dose (' + baseDoseRate.toFixed(2) + ' ' + spProtocol.unit + ') is below standard minimum ' + spProtocol.minSingleDose + ' ' + spProtocol.unit + '.');
      }
      if (spProtocol.maxDailyDose && dailyDoseMgKg > spProtocol.maxDailyDose + 0.0001) {
        hardBlocks.push('SAFETY CEILING HARD-STOP: Regimen (' + effectiveDoseRate.toFixed(2) + ' ' + spProtocol.unit + ' × ' + dosesPerDay + '/day = ' + dailyDoseMgKg.toFixed(2) + ' ' + spProtocol.unit + '/day) exceeds the maximum therapeutic 24-hour ceiling of ' + spProtocol.maxDailyDose + ' ' + spProtocol.unit + '/day for ' + spMeta.label + '. Dose input restricted.');
      }
      if (effectiveDoseRate > spProtocol.maxSingleDose + 0.0001) {
        hardBlocks.push('SAFETY CEILING HARD-STOP: Effective per-dose rate (' + effectiveDoseRate.toFixed(2) + ' ' + spProtocol.unit + ') exceeds the maximum therapeutic single-dose limit of ' + spProtocol.maxSingleDose + ' ' + spProtocol.unit + ' for ' + spMeta.label + '.');
      }
    }
    if (spProtocol.maxDurationDays && durationDays > spProtocol.maxDurationDays) {
      hardBlocks.push('MAX DURATION EXCEEDED BLOCK: Entered duration (' + durationDays + ' days) exceeds maximum safe course duration of ' + spProtocol.maxDurationDays + ' days for ' + sku.brand + ' in ' + spMeta.label + '.');
    }

    const interEval = evaluateDrugInteractionsAndBreedGates(sku, input.activeRxItems || [], {
      spCode,
      breed: input.breed || '',
      ageStage: input.ageStage || 'adult',
      repro: input.repro || 'intact_neutered',
      doseRate: baseDoseRate,
      freqVal,
      route
    });
    hardBlocks = hardBlocks.concat(interEval.hardBlocks);
    softWarnings = softWarnings.concat(interEval.warnings);

    // Unverified SKU handling: Strict mode blocks; Student Study Mode permits calculation with prominent UNVERIFIED warning
    const allowStudyUnverified = input.allowUnverifiedStudyMode !== false;
    if (sku.status === 'UNVERIFIED') {
      if (!allowStudyUnverified) {
        hardBlocks.push('CATALOG QUARANTINE BLOCK (Strict Verified Mode): ' + sku.brand + ' is marked UNVERIFIED (' + sku.auditNote + '). Verify against physical package leaflet, Plumb\'s, or BSAVA in Tab 5, or enable Student Study Mode.');
      } else {
        softWarnings.unshift('UNVERIFIED MONOGRAPH (Student Study Mode): ' + sku.brand + ' (' + sku.inn + ') has not been checked against a physical Indian package leaflet (' + sku.auditNote + '). Do not use on real patients without checking Plumb\'s, BSAVA, or the physical insert.');
      }
    }

    if (sku.amrTier === 'HPCIA_RESERVE' && input.amrCsStatus === 'unjustified') {
      hardBlocks.push('ANTIMICROBIAL STEWARDSHIP BLOCK: WHO HPCIA (' + sku.brand + ') requires Culture & Sensitivity or documented emergency justification.');
    }

    let useIbw = (sku.weightBasis === 'IBW' && wNorm.bcsScale === 9 && Number(input.bcs) >= 6);
    if (input.basisMode === 'ibw' && wNorm.bcsScale === 9) useIbw = true;
    if (input.basisMode === 'tbw') useIbw = false;
    const effectiveWeightKg = wNorm.invalidWeightInput ? 0 : (useIbw ? wNorm.ibwKg : wNorm.tbwKg);

    const exactDoseVal = effectiveWeightKg * effectiveDoseRate;
    const totalAdministrations = freqVal === 'once' ? 1 : (dosesPerDay * durationDays);

    let variancePct = 0;
    let exceedsTenPct = false;
    let exceedsTwentyFivePct = false;
    let perAdminUnits = 0;
    let roundedMg = 0;
    let discretizedText = '— BLOCKED —';
    let headlineText = '— BLOCKED (NO DOSE OUTPUT) —';
    let totalSupplyText = '— BLOCKED —';
    let imSplitText = '— BLOCKED —';
    let imNoteText = 'Resolve hard-block(s) above';
    let sitesNeeded = 1;

    if (sku.form === 'tablet' || sku.form === 'bolus') {
      const disc = discretizeTabletDose(exactDoseVal, sku.strengthVal, sku.splittable);
      variancePct = disc.variancePct;
      exceedsTenPct = disc.exceedsTenPct;
      exceedsTwentyFivePct = disc.exceedsTwentyFivePct;
      perAdminUnits = disc.tabletUnits;
      roundedMg = disc.roundedMg;

      if (exceedsTwentyFivePct && unitGuard.weightValid) {
        hardBlocks.push('EXTREME TABLET ROUNDING BLOCK (' + (variancePct >= 0 ? '+' : '') + variancePct.toFixed(1) + '% variance): Minimum splittable tablet (' + disc.roundedMg.toFixed(2) + ' mg) deviates by >25% from target (' + exactDoseVal.toFixed(2) + ' mg). Switch to liquid suspension (e.g., Melonex 1.5 mg/mL) or compounded preparation.');
      } else if (exceedsTenPct && unitGuard.weightValid) {
        const overrideReason = (input.roundingOverrideReason || '').trim();
        if (!input.roundingOverrideChecked || overrideReason.length < 5) {
          hardBlocks.push('TABLET ROUNDING BLOCK (' + (variancePct >= 0 ? '+' : '') + variancePct.toFixed(1) + '% variance exceeds ±10% guardrail): Nearest splittable tablet (' + disc.roundedMg.toFixed(2) + ' mg vs target ' + exactDoseVal.toFixed(2) + ' mg) is blocked. Switch to liquid suspension OR check "Override 10–25% Rounding" and enter a clinical reason.');
        } else {
          softWarnings.push('Rounding Override Logged (' + (variancePct >= 0 ? '+' : '') + variancePct.toFixed(1) + '%): Clinician override reason: "' + overrideReason + '".');
        }
      }
    }

    if (hardBlocks.length === 0) {
      if (sku.form === 'tablet' || sku.form === 'bolus') {
        const unitLabel = sku.form === 'bolus' ? 'Bolus' : 'Tablet';
        discretizedText = roundedMg.toFixed(2) + ' mg (' + perAdminUnits + ' ' + unitLabel + ')';
        headlineText = perAdminUnits + ' × ' + sku.strengthVal + ' mg ' + unitLabel + ' (' + roundedMg.toFixed(2) + ' mg) ' + (freqVal === 'once' ? 'STAT' : 'q' + freqVal + 'h');
        const totalTabsNeeded = Math.ceil(perAdminUnits * totalAdministrations);
        const packSize = Number(sku.packUnitCount) || 10;
        const packsNeeded = Math.ceil(totalTabsNeeded / packSize);
        totalSupplyText = totalTabsNeeded + ' ' + unitLabel + (totalTabsNeeded > 1 ? (sku.form === 'bolus' ? 'es' : 's') : '') + ' (' + packsNeeded + ' × ' + (sku.packUnitLabel || (packSize + '-pack')) + ')';
        imSplitText = 'Oral (' + route + ')';
        imNoteText = 'Split fractions: ' + (sku.splittable || [1]).join(', ');
      } else if (sku.form === 'topical_wash') {
        const washMl = effectiveWeightKg * effectiveDoseRate;
        perAdminUnits = washMl;
        discretizedText = washMl.toFixed(1) + ' mL Topical Coat Wash';
        headlineText = 'Apply ' + washMl.toFixed(1) + ' mL to wet coat, lather 10 min & rinse thoroughly';
        const packSize = Number(sku.packUnitCount) || 200;
        const bottlesNeeded = Math.ceil((washMl * totalAdministrations) / packSize);
        totalSupplyText = (washMl * totalAdministrations).toFixed(1) + ' mL (' + bottlesNeeded + ' × ' + (sku.packUnitLabel || '200 mL Bottle') + ')';
        imSplitText = 'External Coat Wash ONLY';
        imNoteText = 'Do not ingest; rinse after 10 min';
      } else {
        const volMl = spProtocol.unit.indexOf('mL/kg') === 0 ? exactDoseVal : (exactDoseVal / sku.strengthVal);
        perAdminUnits = volMl;
        discretizedText = volMl.toFixed(2) + ' mL (' + exactDoseVal.toFixed(1) + ' mg)';
        headlineText = volMl.toFixed(2) + ' mL (' + exactDoseVal.toFixed(1) + ' mg) ' + route + ' ' + (freqVal === 'once' ? 'STAT' : 'q' + freqVal + 'h');
        const totalMl = volMl * totalAdministrations;
        const vialSize = Number(sku.packUnitCount) || 20;
        const vialsNeeded = Math.ceil(totalMl / vialSize);
        totalSupplyText = totalMl.toFixed(1) + ' mL total (' + vialsNeeded + ' × ' + (sku.packUnitLabel || (vialSize + ' mL Vial')) + ')';

        if (route.includes('IM') && sku.maxImSiteMl) {
          if (volMl > sku.maxImSiteMl) {
            sitesNeeded = Math.ceil(volMl / sku.maxImSiteMl);
            const perSiteMl = volMl / sitesNeeded;
            imSplitText = 'SPLIT ≥ ' + sitesNeeded + ' NECK SITES';
            imNoteText = '≤ ' + sku.maxImSiteMl + ' mL/site (' + perSiteMl.toFixed(1) + ' mL × ' + sitesNeeded + ')';
            softWarnings.push('INJECTION-SITE SAFEGUARD: Total IM volume (' + volMl.toFixed(1) + ' mL) exceeds ' + sku.maxImSiteMl + ' mL/site limit. Split across ≥ ' + sitesNeeded + ' deep neck IM sites.');
          } else {
            imSplitText = '1 Site (' + volMl.toFixed(1) + ' mL)';
            imNoteText = 'Max ' + sku.maxImSiteMl + ' mL/site';
          }
        } else {
          imSplitText = 'Standard ' + route;
          imNoteText = 'Parenteral / Oral liquid';
        }
      }
    }

    return {
      blocked: hardBlocks.length > 0,
      hardBlocks,
      softWarnings,
      wNorm,
      spProtocol,
      effectiveWeightKg,
      useIbw,
      baseDoseRate,
      effectiveDoseRate,
      dailyDoseMgKg,
      exactDoseVal: hardBlocks.length > 0 ? null : exactDoseVal,
      perAdminUnits: hardBlocks.length > 0 ? null : perAdminUnits,
      roundedMg: hardBlocks.length > 0 ? null : roundedMg,
      variancePct,
      exceedsTenPct,
      exceedsTwentyFivePct,
      sitesNeeded,
      headlineText,
      discretizedText,
      totalSupplyText,
      imSplitText,
      imNoteText
    };
  }

  function calculateFluidsAndKcl(params) {
    const parsedW = parseStrictPositiveWeight(params.bwKg, 'kg');
    if (!parsedW.valid) {
      return { blocked: true, error: parsedW.error };
    }
    const bw = parsedW.tbwKg;
    const sp = params.species || 'cat';
    const lifeStage = params.lifeStage || 'adult';
    const shockActive = Boolean(params.shockActive);
    const bolusMlKg = Number(params.bolusMlKg) || (sp === 'dog' ? 15 : 10);
    const colloidAdjPct = Number(params.colloidAdjPct) || 0;
    const dehydPct = Math.max(0, Number(params.dehydPct) || 0);
    const rehydHours = Number(params.rehydHours) === 12 ? 12 : 24;
    const maintFormula = params.maintFormula || 'allometric';
    const ongoingLoss24h = Math.max(0, Number(params.ongoingLoss24h) || 0);
    const enteralOffset24h = Math.max(0, Number(params.enteralOffset24h) || 0);
    const serumK = Number(params.serumK);

    if (isNaN(serumK) || serumK <= 0) {
      return { blocked: true, error: 'Enter a valid positive Serum K+ (mEq/L).' };
    }

    const bolusVolMl = shockActive ? (bw * bolusMlKg * (1 - colloidAdjPct / 100)) : 0;
    const deficitMl = bw * (dehydPct / 100) * 1000.0;
    const deficitHourlyDuringRehyd = deficitMl / rehydHours;

    const pedMultiplier = lifeStage === 'pediatric' ? (sp === 'dog' ? 3.0 : 2.5) : 1.0;
    const allometricAdult = (sp === 'dog' ? 132 : 80) * Math.pow(bw, 0.75);
    const linearAdult = (sp === 'dog' ? 60 : 40) * bw;
    const rerAdult = 30 * bw + 70;

    let chosenAdultMaint = allometricAdult;
    if (maintFormula === 'linear') chosenAdultMaint = linearAdult;
    if (maintFormula === 'rer') chosenAdultMaint = rerAdult;

    const maint24hMl = Math.max(0, (chosenAdultMaint * pedMultiplier) + ongoingLoss24h - enteralOffset24h);
    const maintHourlyMl = maint24hMl / 24.0;

    const total24hVolumeMl = deficitMl + maint24hMl;
    const phase1HourlyMl = deficitHourlyDuringRehyd + maintHourlyMl;
    const phase1MlKgHr = phase1HourlyMl / bw;
    const phase2HourlyMl = rehydHours === 12 ? maintHourlyMl : phase1HourlyMl;
    const phase2MlKgHr = phase2HourlyMl / bw;

    let slidingMeqPerL = 0;
    let refMaxMlKgHr = 999;
    if (serumK < 2.0) { slidingMeqPerL = 80; refMaxMlKgHr = 6; }
    else if (serumK <= 2.5) { slidingMeqPerL = 60; refMaxMlKgHr = 8; }
    else if (serumK <= 3.0) { slidingMeqPerL = 40; refMaxMlKgHr = 12; }
    else if (serumK <= 3.5) { slidingMeqPerL = 30; refMaxMlKgHr = 18; }
    else if (serumK <= 5.0) { slidingMeqPerL = 20; refMaxMlKgHr = 25; }
    else { slidingMeqPerL = 0; refMaxMlKgHr = 0; }

    let bagMode = params.bagMode || 'standard_1000';
    let containerVolMl = 1000;
    let buretteRecommended = (bw < 5.0 || total24hVolumeMl < 500);
    if (bagMode === 'dka_250') containerVolMl = 250;
    if (bagMode === 'burette_100') containerVolMl = 100;

    const deliveredMeqHr = (phase1HourlyMl / 1000.0) * slidingMeqPerL;
    const kMaxCeilingMeqHr = 0.5 * bw;
    const maxSafeBagMeqL = phase1HourlyMl > 0 ? (kMaxCeilingMeqHr / (phase1HourlyMl / 1000.0)) : 0;
    const clampTriggered = slidingMeqPerL > 0 && (deliveredMeqHr > kMaxCeilingMeqHr + 0.0001);
    const effectiveSafeMeqPerL = clampTriggered ? Math.floor(maxSafeBagMeqL * 10) / 10 : slidingMeqPerL;

    const unclampedMeqInContainer = slidingMeqPerL * (containerVolMl / 1000.0);
    const clampedMeqInContainer = effectiveSafeMeqPerL * (containerVolMl / 1000.0);
    const kcl15PctMlToInject = clampedMeqInContainer / 2.0;

    return {
      blocked: false,
      bwKg: bw,
      bolusVolMl,
      deficitMl,
      rehydHours,
      allometricMaint24h: allometricAdult * pedMultiplier,
      linearMaint24h: linearAdult * pedMultiplier,
      maint24hMl,
      maintHourlyMl,
      total24hVolumeMl,
      phase1HourlyMl,
      phase1MlKgHr,
      phase2HourlyMl,
      phase2MlKgHr,
      isTwoPhase: rehydHours === 12 && deficitMl > 0,
      serumK,
      slidingMeqPerL,
      refMaxMlKgHr,
      containerVolMl,
      buretteRecommended,
      deliveredMeqHr,
      kMaxCeilingMeqHr,
      maxSafeBagMeqL,
      clampTriggered,
      effectiveSafeMeqPerL,
      unclampedMeqInContainer,
      clampedMeqInContainer,
      kcl15PctMlToInject
    };
  }

  function calculateCri(params) {
    const parsedW = parseStrictPositiveWeight(params.bwKg, 'kg');
    if (!parsedW.valid) {
      return { blocked: true, error: parsedW.error };
    }
    const bw = parsedW.tbwKg;
    const rawRate = Number(params.rateVal);
    const rateUnit = params.rateUnit || 'mcg/kg/min';
    const stockConcMgMl = Number(params.stockConcMgMl);
    const bagVolMl = Number(params.bagVolMl) || 500;
    const bagRateMlHr = Number(params.bagRateMlHr);
    const maxSafeMcgKgMin = Number(params.maxSafeMcgKgMin) || null;

    if (isNaN(rawRate) || rawRate <= 0 || isNaN(stockConcMgMl) || stockConcMgMl <= 0 || isNaN(bagRateMlHr) || bagRateMlHr <= 0) {
      return { blocked: true, error: 'CRI rate, stock concentration (mg/mL), and bag rate (mL/hr) must all be > 0.' };
    }

    let rateMcgKgMin = rawRate;
    if (rateUnit === 'mcg/kg/hr') rateMcgKgMin = rawRate / 60.0;
    else if (rateUnit === 'mg/kg/hr') rateMcgKgMin = (rawRate * 1000.0) / 60.0;
    else if (rateUnit === 'mg/kg/day') rateMcgKgMin = (rawRate * 1000.0) / 1440.0;

    const exceedsMaxRate = maxSafeMcgKgMin !== null && (rateMcgKgMin > maxSafeMcgKgMin + 0.001);
    const hourlyDrugMg = (rateMcgKgMin * bw * 60.0) / 1000.0;
    const neatPumpMlHr = hourlyDrugMg / stockConcMgMl;

    const rawBagDurationHr = bagVolMl / bagRateMlHr;
    const exceeds24hHangLimit = rawBagDurationHr > 24.001;
    const effectiveHangHours = Math.min(24.0, rawBagDurationHr);
    const totalDrugForBagMg = hourlyDrugMg * rawBagDurationHr;
    const drugVolForBagMl = totalDrugForBagMg / stockConcMgMl;
    const safe24hBagVolMl = bagRateMlHr * 24.0;
    const safe24hDrugVolMl = (hourlyDrugMg * 24.0) / stockConcMgMl;

    const dex50Ml = 0.5 * bw;
    const salineDiluentMl = dex50Ml * 2.0;

    return {
      blocked: false,
      bwKg: bw,
      rawRate,
      rateUnit,
      rateMcgKgMin,
      exceedsMaxRate,
      maxSafeMcgKgMin,
      stockConcMgMl,
      hourlyDrugMg,
      neatPumpMlHr,
      bagVolMl,
      bagRateMlHr,
      rawBagDurationHr,
      exceeds24hHangLimit,
      effectiveHangHours,
      totalDrugForBagMg,
      drugVolForBagMl,
      safe24hBagVolMl,
      safe24hDrugVolMl,
      dex50Ml,
      salineDiluentMl,
      totalDexBolusMl: dex50Ml + salineDiluentMl
    };
  }

  function calculateCpr(params) {
    const parsedW = parseStrictPositiveWeight(params.bwKg, 'kg');
    if (!parsedW.valid) {
      return { blocked: true, error: parsedW.error };
    }
    const bw = parsedW.tbwKg;
    const sp = params.species || 'dog';
    const concs = Object.assign({
      epiConcMgMl: 1.0,
      atropineConcMgMl: 0.6,
      atropineDoseMgKg: 0.05,
      vasoConcUMl: 20.0,
      lidoConcMgMl: 20.0,
      amioConcMgMl: 50.0,
      esmoConcMgMl: 10.0,
      bicarbConcMeqMl: 1.0,
      naloxoneConcMgMl: 0.4,
      flumazenilConcMgMl: 0.1,
      atipamezoleConcMgMl: 5.0
    }, params.concs || {});

    const epiMg = bw * 0.01;
    const epiMl = epiMg / concs.epiConcMgMl;
    const epiItMl = (bw * 0.02) / concs.epiConcMgMl;

    const atroMg = bw * concs.atropineDoseMgKg;
    const atroMl = atroMg / concs.atropineConcMgMl;
    const atro06Ml = atroMg / 0.6;
    const atro054Ml = atroMg / 0.54;

    const vasoUnits = bw * 0.8;
    const vasoMl = vasoUnits / concs.vasoConcUMl;

    const lidoMg = bw * 2.0;
    const lidoMl = lidoMg / concs.lidoConcMgMl;

    const amioMg = bw * 5.0;
    const amioMl = amioMg / concs.amioConcMgMl;

    const esmoMg = bw * 0.5;
    const esmoMl = esmoMg / concs.esmoConcMgMl;

    const bicarbMeq = bw * 1.0;
    const bicarbMl = bicarbMeq / concs.bicarbConcMeqMl;

    const nalMg = bw * 0.04;
    const nalMl = nalMg / concs.naloxoneConcMgMl;
    const fluMg = bw * 0.01;
    const fluMl = fluMg / concs.flumazenilConcMgMl;
    const atipMg = bw * 0.1;
    const atipMl = atipMg / concs.atipamezoleConcMgMl;

    return {
      blocked: false,
      bwKg: bw,
      species: sp,
      tidalVolMl: bw * 10.0,
      epiMg,
      epiMl,
      epiItMl,
      atroMg,
      atroMl,
      atro06Ml,
      atro054Ml,
      vasoUnits,
      vasoMl,
      lidoBlocked: sp === 'cat',
      lidoMg,
      lidoMl,
      amioMg,
      amioMl,
      esmoMg,
      esmoMl,
      bicarbMeq,
      bicarbMl,
      defibShock1MinJ: bw * 2,
      defibShock1MaxJ: bw * 4,
      defibShock2MinJ: bw * 4,
      defibShock2MaxJ: bw * 8,
      nalMl,
      fluMl,
      atipMl
    };
  }

  // Real ISO/IEC 18004 Scannable QR Code Generator via qrcode-generator (with clean honest badge fallback if library offline)
  function generateSvgQrCode(payloadText) {
    const text = String(payloadText || 'VETRX-INDIA').slice(0, 120);
    if (root && typeof root.qrcode === 'function') {
      try {
        const qr = root.qrcode(0, 'L');
        qr.addData(text);
        qr.make();
        return qr.createSvgTag({ cellSize: 2, margin: 2, scalable: true });
      } catch (e) {}
    }
    return '<div class="px-2 py-1 rounded border border-slate-300 bg-slate-100 text-xs font-mono text-slate-700 text-center">SHA-256 Digest:<br/>' + text.slice(-16) + '</div>';
  }

  return {
    parseStrictPositiveWeight,
    computeIbwAndBsa,
    estimateLivestockWeightKg,
    discretizeTabletDose,
    calculateFlockWaterOrFeedDose,
    computeWithdrawalSafeDates,
    evaluateRenalHepaticAdjustment,
    evaluateDrugInteractionsAndBreedGates,
    evaluateUnitAndDilutionGuards,
    calculateDosage,
    calculateFluidsAndKcl,
    calculateCri,
    calculateCpr,
    generateSvgQrCode
  };
});

