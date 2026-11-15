const fs = require('fs');
const path = require('path');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/drug_catalog.json'), 'utf8'));
const VetDoseEngine = require('../src/dose_engine.js');

const SPECIES_META = catalog.speciesMeta;
const skuMap = {};
catalog.skus.forEach(s => { skuMap[s.id] = s; });

const id = process.argv[2];
let out = {};
try {
  switch (id) {
    case 'TC-01': {
      const r = VetDoseEngine.calculateFluidsAndKcl({ species: 'cat', bwKg: 0.45, lifeStage: 'pediatric', shockActive: false, dehydPct: 8, rehydHours: 24, maintFormula: 'allometric', serumK: 2.8, bagMode: 'burette_100' });
      out = { blocked: r.blocked, clampTriggered: r.clampTriggered, buretteRecommended: r.buretteRecommended, kMaxCeilingMeqHr: r.kMaxCeilingMeqHr, kclVol: (r.kcl15PctMlToInject != null ? r.kcl15PctMlToInject : r.kcl15Ml) };
      break;
    }
    case 'TC-02': {
      const r = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 42, weightUnit: 'kg', bcs: 8, rawDoseRate: 2.2, doseBasisUnit: 'mg/kg', freqVal: '12', durationDays: 5, route: 'PO' });
      out = { blocked: r.blocked, ibwKg: r.wNorm.ibwKg, exactDoseVal: r.exactDoseVal, perAdminUnits: r.perAdminUnits, variancePct: r.variancePct };
      break;
    }
    case 'TC-03': {
      const r = VetDoseEngine.calculateCri({ bwKg: 20, rateVal: 50, rateUnit: 'mcg/kg/min', stockConcMgMl: 20, bagVolMl: 500, bagRateMlHr: 50 });
      out = { blocked: r.blocked, hourlyDrugMg: r.hourlyDrugMg, neatPumpMlHr: r.neatPumpMlHr, rawBagDurationHr: r.rawBagDurationHr, drugVolForBagMl: r.drugVolForBagMl, exceeds24hHangLimit: r.exceeds24hHangLimit };
      break;
    }
    case 'TC-04': {
      const r = VetDoseEngine.calculateDosage({ sku: skuMap['butalex-inj'], spCode: 'buffalo', speciesMetaMap: SPECIES_META, rawWeight: 500, weightUnit: 'kg', bcs: 3, rawDoseRate: 2.5, doseBasisUnit: 'mg/kg', freqVal: 'once', durationDays: 1, route: 'Deep IM (Neck)' });
      const sku = skuMap['butalex-inj'];
      const wd = r.withdrawal || r.withdrawals || {};
      const milkHr = wd.milk_hr ?? wd.milkHours ?? wd.milkHr ?? sku.milkWithdrawalHr ?? sku.milk_hr;
      const meatDays = wd.meat_days ?? wd.meatDays ?? sku.meatWithdrawalDays ?? sku.meat_days;
      out = { blocked: r.blocked, exactDoseVal: r.exactDoseVal, perAdminUnits: r.perAdminUnits, sitesNeeded: r.sitesNeeded, milkHr: Number(milkHr), meatDays: Number(meatDays) };
      break;
    }
    case 'TC-05': {
      const r = VetDoseEngine.calculateCpr({ species: 'dog', bwKg: 15.0, concs: { epiConcMgMl: 1.0, atropineConcMgMl: 0.6, atropineDoseMgKg: 0.05, lidoConcMgMl: 20.0 } });
      const rCat = VetDoseEngine.calculateCpr({ species: 'cat', bwKg: 4.0, concs: { lidoConcMgMl: 20.0 } });
      const atro054 = r.atro054Ml || r.atropineMl054 || r.atropineMlAt054;
      out = { blocked: r.blocked, epiMg: (r.epiMg || r.epinephrineMg), epiMl: (r.epiMl || r.epinephrineMl), atroMg: (r.atroMg || r.atropineMg), atroMl: (r.atroMl || r.atropineMl06 || r.atropineMlAt06), atro054: atro054, catLidoBlocked: rCat.lidoBlocked };
      break;
    }
    case 'TC-06': {
      const base = { sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 3.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO' };
      const blocked = VetDoseEngine.calculateDosage(Object.assign({}, base, { roundingOverrideChecked: false }));
      const overridden = VetDoseEngine.calculateDosage(Object.assign({}, base, { roundingOverrideChecked: true, roundingOverrideReason: 'Owner unable to administer oral liquid' }));
      out = { blockedExceedsTenPct: blocked.exceedsTenPct, blockedBlocked: blocked.blocked, overriddenBlocked: overridden.blocked };
      break;
    }
    case 'TC-07': {
      const cases = [
        VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: '', route: 'PO' }),
        VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 0, route: 'PO' }),
        VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: -5, route: 'PO' })
      ];
      out = cases.map(r => ({ blocked: r.blocked, exactDoseValNull: r.exactDoseVal == null }));
      break;
    }
    case 'TC-08': {
      const r1 = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'cattle', speciesMetaMap: SPECIES_META, rawWeight: 400, bcs: 3, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO' });
      const r2 = VetDoseEngine.calculateDosage({ sku: skuMap['oxytet-la-200'], spCode: 'cattle', speciesMetaMap: SPECIES_META, rawWeight: 400, bcs: 3, rawDoseRate: 20, freqVal: '24', durationDays: 3, route: 'Slow IV', allowUnverifiedStudyMode: true });
      out = { r1Blocked: r1.blocked, r2Blocked: r2.blocked };
      break;
    }
    case 'TC-09': {
      const r1 = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 4.4, doseBasisUnit: 'mg/kg', freqVal: '12', durationDays: 5, route: 'PO' });
      const r2 = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 2.2, doseBasisUnit: 'mg/kg', freqVal: '12', durationDays: 21, route: 'PO' });
      out = { r1Blocked: r1.blocked, r2Blocked: r2.blocked };
      break;
    }
    case 'TC-10': {
      const r = VetDoseEngine.calculateFluidsAndKcl({ species: 'dog', bwKg: 10, lifeStage: 'adult', dehydPct: 6, rehydHours: 12, maintFormula: 'allometric', serumK: 4.0, bagMode: 'standard_1000' });
      out = { blocked: r.blocked, isTwoPhase: r.isTwoPhase, phase1HourlyMl: r.phase1HourlyMl, phase2HourlyMl: r.phase2HourlyMl };
      break;
    }
    case 'TC-11': {
      const r1 = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO', activeRxItems: [{ skuId: 'melonex-susp', inn: 'MELOXICAM', drugClass: 'NSAID' }] });
      const r2 = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO', activeRxItems: [{ skuId: 'prednisolone-10', inn: 'PREDNISOLONE', drugClass: 'CORTICOSTEROID' }] });
      out = { r1Blocked: r1.blocked, r2Blocked: r2.blocked };
      break;
    }
    case 'TC-12': {
      const preg = VetDoseEngine.calculateDosage({ sku: skuMap['butalex-inj'], spCode: 'buffalo', speciesMetaMap: SPECIES_META, rawWeight: 500, bcs: 3, rawDoseRate: 2.5, freqVal: 'once', durationDays: 1, route: 'Deep IM (Neck)', repro: 'pregnant' });
      const ped = VetDoseEngine.calculateDosage({ sku: skuMap['ataxin-150'], spCode: 'cattle', speciesMetaMap: SPECIES_META, rawWeight: 100, bcs: 3, rawDoseRate: 7.5, freqVal: 'once', durationDays: 1, route: 'IM', ageStage: 'pediatric', allowUnverifiedStudyMode: true });
      const mdr1 = VetDoseEngine.calculateDosage({ sku: skuMap['neomec-10'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 0.2, freqVal: 'once', durationDays: 1, route: 'PO', breed: 'Collie (MDR1 Risk)', allowUnverifiedStudyMode: true });
      out = { pregBlocked: preg.blocked, pedBlocked: ped.blocked, mdr1Blocked: mdr1.blocked };
      break;
    }
    case 'TC-13': {
      const blocked = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO', renalStage: 'iris_3' });
      const scaled = VetDoseEngine.calculateDosage({ sku: skuMap['intacef-tazo-4500'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 10, freqVal: '12', durationDays: 5, route: 'IM', renalStage: 'iris_3', allowUnverifiedStudyMode: true });
      const normal = VetDoseEngine.calculateDosage({ sku: skuMap['intacef-tazo-4500'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 20, bcs: 5, rawDoseRate: 10, freqVal: '12', durationDays: 5, route: 'IM', renalStage: 'normal', allowUnverifiedStudyMode: true });
      const factor = scaled.renalDoseFactor ?? scaled.doseFactor ?? (scaled.effectiveDoseRate && scaled.originalDoseRate ? (scaled.effectiveDoseRate / scaled.originalDoseRate) : (normal.exactDoseVal ? (scaled.exactDoseVal / normal.exactDoseVal) : null));
      out = { blocked: blocked.blocked, scaledBlocked: scaled.blocked, factor: factor };
      break;
    }
    case 'TC-14': {
      const flock = VetDoseEngine.calculateFlockWaterOrFeedDose({ speciesCode: 'poultry', flockCount: 1000, avgBirdOrFishKg: 1.5, doseMgKgDay: 20, strengthMgPerG: 100, durationDays: 5, dailyWaterLPerBird: 0.33 });
      const conc = flock.waterConcMgPerL ?? flock.mgPerL ?? (flock.dailyActiveMg / (1000 * 0.33));
      const cattle = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'cattle');
      const buffalo = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'buffalo');
      out = { flockValid: flock.valid, totalBiomassKg: flock.totalBiomassKg, dailyActiveMg: flock.dailyActiveMg, dailyPowderG: flock.dailyPowderG, conc: conc, cattleValid: cattle.valid, buffaloValid: buffalo.valid, cattleKg: cattle.estimatedKg, buffaloKg: buffalo.estimatedKg };
      break;
    }
    case 'TC-15': {
      const r = VetDoseEngine.calculateCri({ bwKg: 15, rateVal: 2, rateUnit: 'mg/kg/day', stockConcMgMl: 5, bagVolMl: 500, bagRateMlHr: 10 });
      out = { blocked: r.blocked, rateMcgKgMin: r.rateMcgKgMin, exceeds24hHangLimit: r.exceeds24hHangLimit, effectiveHangHours: r.effectiveHangHours };
      break;
    }
    case 'TC-16': {
      const cattle = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'cattle');
      const buffalo = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'buffalo');
      const bans = ['ban-granim-p', 'ban-diclofenac', 'ban-colistin'].map(id => {
        const sku = skuMap[id];
        const r = VetDoseEngine.calculateDosage({ sku, spCode: 'cattle', speciesMetaMap: SPECIES_META, rawWeight: 400, bcs: 3, rawDoseRate: sku.dose_default_mgkg || 1, freqVal: '24', durationDays: 3, route: 'IM', allowUnverifiedStudyMode: true });
        return { id, exists: !!sku, blocked: r.blocked };
      });
      out = { cattleValid: cattle.valid, buffaloValid: buffalo.valid, cattleKg: cattle.estimatedKg, buffaloKg: buffalo.estimatedKg, bans };
      break;
    }
    default:
      console.error('Unknown TC: ' + id);
      process.exit(2);
  }
  process.stdout.write(JSON.stringify(out));
} catch (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
