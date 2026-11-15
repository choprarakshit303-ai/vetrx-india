const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Load Data & Engine
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/drug_catalog.json'), 'utf8'));
const VetDoseEngine = require('../src/dose_engine.js');

const SPECIES_META = catalog.speciesMeta;
const INDIAN_SKU_CATALOG = catalog.skus;
const skuMap = {};
INDIAN_SKU_CATALOG.forEach(s => { skuMap[s.id] = s; });

// Mock global window/self if needed (though dose_engine is UMD)
global.window = { VetDoseEngine };
global.self = global.window;

console.log("Starting 16 Golden Test Vectors...");

const vectors = [
    {
      id: 'TC-01',
      title: 'TC-01: Neonatal Kitten Fluid & KCl Conflict',
      run: () => {
        const r = VetDoseEngine.calculateFluidsAndKcl({
          species: 'cat', bwKg: 0.45, lifeStage: 'pediatric', shockActive: false,
          dehydPct: 8, rehydHours: 24, maintFormula: 'allometric', serumK: 2.8, bagMode: 'burette_100'
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.deficitMl - 36.0) < 0.05);
        assert.ok(Math.abs(r.maint24hMl - 109.9) < 0.15);
        assert.strictEqual(r.clampTriggered, true);
        assert.ok(Math.abs(r.maxSafeBagMeqL - 37.0) < 0.15);
      }
    },
    {
      id: 'TC-02',
      title: 'TC-02: Obese Labrador IBW vs. TBW Scaling',
      run: () => {
        const r = VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 42.0, weightUnit: 'kg', bcs: 8, rawDoseRate: 2.2, doseBasisUnit: 'mg/kg',
          freqVal: '12', durationDays: 5, route: 'PO'
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.wNorm.ibwKg - 32.31) < 0.02);
        assert.ok(Math.abs(r.exactDoseVal - 71.08) < 0.05);
        assert.strictEqual(r.perAdminUnits, 1);
        assert.ok(Math.abs(r.variancePct - 5.5) < 0.15);
      }
    },
    {
      id: 'TC-03',
      title: 'TC-03: Canine Lidocaine CRI Pump vs. Bag',
      run: () => {
        const r = VetDoseEngine.calculateCri({
          bwKg: 20.0, rateVal: 50, rateUnit: 'mcg/kg/min', stockConcMgMl: 20.0,
          bagVolMl: 500, bagRateMlHr: 50.0, maxSafeMcgKgMin: 80
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.hourlyDrugMg - 60.0) < 0.01);
        assert.ok(Math.abs(r.neatPumpMlHr - 3.0) < 0.01);
        assert.ok(Math.abs(r.drugVolForBagMl - 30.0) < 0.01);
      }
    },
    {
      id: 'TC-04',
      title: 'TC-04: Buffalo Theileriosis IM Site Splitting',
      run: () => {
        const r = VetDoseEngine.calculateDosage({
          sku: skuMap['butalex-inj'], spCode: 'buffalo', speciesMetaMap: SPECIES_META,
          rawWeight: 500, weightUnit: 'kg', bcs: 3, rawDoseRate: 2.5, doseBasisUnit: 'mg/kg',
          freqVal: 'once', durationDays: 1, route: 'Deep IM (Neck)'
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.exactDoseVal - 1250) < 0.1);
        assert.ok(Math.abs(r.perAdminUnits - 25.0) < 0.05);
        assert.strictEqual(r.sitesNeeded, 3);
      }
    },
    {
      id: 'TC-05',
      title: 'TC-05: 2024 RECOVER CPR & Multi-Vial Check',
      run: () => {
        const r = VetDoseEngine.calculateCpr({
          species: 'dog', bwKg: 15.0,
          concs: { epiConcMgMl: 1.0, atropineConcMgMl: 0.6, atropineDoseMgKg: 0.05, lidoConcMgMl: 20.0 }
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.epiMl - 0.15) < 0.005);
        assert.ok(Math.abs(r.atroMl - 1.25) < 0.005);
        assert.ok(Math.abs(r.atro054Ml - 1.39) < 0.01);
        assert.ok(Math.abs(r.lidoMl - 1.50) < 0.005);
      }
    },
    {
      id: 'TC-06',
      title: 'TC-06: Toy Dog Rounding Hard-Block & Override Gate',
      run: () => {
        const blockedRes = VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 3.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO',
          roundingOverrideChecked: false
        });
        const overrideRes = VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 3.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO',
          roundingOverrideChecked: true, roundingOverrideReason: 'Owner unable to administer oral liquid'
        });
        assert.strictEqual(blockedRes.blocked, true);
        assert.strictEqual(overrideRes.blocked, false);
      }
    },
    {
      id: 'TC-07',
      title: 'TC-07: Blank, Zero & Negative Weight Hard-Block',
      run: () => {
        const dBlank = VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', rawWeight: '' });
        const fZero = VetDoseEngine.calculateFluidsAndKcl({ species: 'dog', bwKg: 0, serumK: 4.0 });
        const criNeg = VetDoseEngine.calculateCri({ bwKg: -5, rateVal: 50, stockConcMgMl: 20, bagRateMlHr: 50 });
        const cprBlank = VetDoseEngine.calculateCpr({ species: 'dog', bwKg: '   ' });
        assert.strictEqual(dBlank.blocked, true);
        assert.strictEqual(fZero.blocked, true);
        assert.strictEqual(criNeg.blocked, true);
        assert.strictEqual(cprBlank.blocked, true);
      }
    },
    {
      id: 'TC-08',
      title: 'TC-08: Unapproved Species & Invalid Route Hard-Blocks',
      run: () => {
        const cCattle = VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-75'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 400, bcs: 3, rawDoseRate: 2.2, route: 'PO'
        });
        const oxyIv = VetDoseEngine.calculateDosage({
          sku: skuMap['oxytet-la-200'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 400, bcs: 3, rawDoseRate: 20.0, route: 'Slow IV', allowUnverifiedStudyMode: true
        });
        assert.strictEqual(cCattle.blocked, true);
        assert.strictEqual(oxyIv.blocked, true);
        assert.ok(oxyIv.hardBlocks.some(b => b.includes('INVALID ADMINISTRATION ROUTE')));
      }
    },
    {
      id: 'TC-09',
      title: 'TC-09: Max Daily Dose Ceiling Block',
      run: () => {
        const r = VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 34.0, bcs: 5, rawDoseRate: 4.4, freqVal: '12', durationDays: 5, route: 'PO'
        });
        assert.strictEqual(r.blocked, true);
        assert.ok(r.hardBlocks.some(b => b.includes('MAX DAILY DOSE CEILING EXCEEDED BLOCK')));
      }
    },
    {
      id: 'TC-10',
      title: 'TC-10: Two-Phase 12h Rehydration vs 24h Maintenance',
      run: () => {
        const r = VetDoseEngine.calculateFluidsAndKcl({
          species: 'dog', bwKg: 10.0, lifeStage: 'adult', dehydPct: 6, rehydHours: 12,
          maintFormula: 'allometric', serumK: 4.0, bagMode: 'standard_1000'
        });
        assert.strictEqual(r.isTwoPhase, true);
        assert.ok(Math.abs(r.total24hVolumeMl - 1342.3) < 0.5);
        assert.ok(Math.abs(r.phase1HourlyMl - 80.93) < 0.1);
        assert.ok(Math.abs(r.phase2HourlyMl - 30.93) < 0.1);
      }
    },
    {
      id: 'TC-11',
      title: 'TC-11: Duplicate NSAID Class Block',
      run: () => {
        const r = VetDoseEngine.calculateDosage({
          sku: skuMap['melonex-susp'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 15.0, bcs: 5, rawDoseRate: 0.1, freqVal: '24', durationDays: 3, route: 'PO',
          allowUnverifiedStudyMode: true,
          activeRxItems: [{ skuId: 'carodyl-75', inn: 'CARPROFEN', brand: 'Carodyl 75 mg', drugClass: 'NSAID' }]
        });
        assert.strictEqual(r.blocked, true);
        assert.ok(r.hardBlocks.some(b => b.includes('DUPLICATE THERAPEUTIC CLASS BLOCK')));
      }
    },
    {
      id: 'TC-12',
      title: 'TC-12: Pregnancy Teratogenicity & MDR1 Neurotoxicity',
      run: () => {
        const preg = VetDoseEngine.calculateDosage({
          sku: skuMap['prednisolone-10'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 20.0, bcs: 5, repro: 'pregnant', rawDoseRate: 0.5, freqVal: '24', durationDays: 5, route: 'PO',
          allowUnverifiedStudyMode: true
        });
        const mdr1 = VetDoseEngine.calculateDosage({
          sku: skuMap['neomec-10'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 25.0, bcs: 5, breed: 'Collie (MDR1 Risk)', rawDoseRate: 0.2, freqVal: 'once', durationDays: 1, route: 'PO',
          allowUnverifiedStudyMode: true
        });
        assert.strictEqual(preg.blocked, true);
        assert.strictEqual(mdr1.blocked, true);
      }
    },
    {
      id: 'TC-13',
      title: 'TC-13: Bactivon Tazo Active Cefquinome & IM Site Split',
      run: () => {
        const r = VetDoseEngine.calculateDosage({
          sku: skuMap['bactivon-tazo'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 444.4, bcs: 3, rawDoseRate: 1.0, freqVal: '24', durationDays: 3, route: 'IM',
          amrCsStatus: 'cs_confirmed', allowUnverifiedStudyMode: true
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.perAdminUnits - 20.0) < 0.05);
        assert.strictEqual(r.sitesNeeded, 2);
      }
    },
    {
      id: 'TC-14',
      title: 'TC-14: Heart-Girth Livestock Estimator & Poultry Flock',
      run: () => {
        const hg = VetDoseEngine.estimateLivestockWeightKg(180, 155, 'cattle');
        const fl = VetDoseEngine.calculateFlockWaterOrFeedDose({
          speciesCode: 'poultry', flockCount: 1000, avgBirdOrFishKg: 1.5,
          doseMgKgDay: 20.0, strengthMgPerG: 100, durationDays: 5
        });
        assert.strictEqual(hg.valid, true);
        assert.strictEqual(hg.estimatedKg, 463.4);
        assert.strictEqual(fl.valid, true);
        assert.strictEqual(fl.dailyPowderG, 300);
        assert.strictEqual(fl.totalCoursePowderG, 1500);
      }
    },
    {
      id: 'TC-15',
      title: 'TC-15: CRI Multi-Unit Conversion & 24h Hang-Time',
      run: () => {
        const r = VetDoseEngine.calculateCri({
          bwKg: 10.0, rateVal: 2.0, rateUnit: 'mg/kg/day', stockConcMgMl: 5.0,
          bagVolMl: 1000, bagRateMlHr: 20.0
        });
        assert.strictEqual(r.blocked, false);
        assert.ok(Math.abs(r.hourlyDrugMg - 0.8333) < 0.01);
        assert.strictEqual(r.exceeds24hHangLimit, true);
        assert.strictEqual(r.effectiveHangHours, 24.0);
      }
    },
    {
      id: 'TC-16',
      title: 'TC-16: Extreme Puppy Rounding Unconditional Hard-Block',
      run: () => {
        const r = VetDoseEngine.calculateDosage({
          sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 0.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 3, route: 'PO',
          roundingOverrideChecked: true, roundingOverrideReason: 'Attempted unsafe override'
        });
        assert.strictEqual(r.blocked, true);
        assert.ok(r.hardBlocks.some(b => b.includes('EXTREME TABLET ROUNDING BLOCK')));
      }
    }
];

let passCount = 0;
vectors.forEach(v => {
  try {
    v.run();
    console.log(`[PASS] ${v.id}: ${v.title}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${v.id}: ${v.title}`);
    console.error(err.message);
    process.exit(1);
  }
});

console.log(`\nTest Summary: ${passCount}/${vectors.length} passed.`);
if (passCount === vectors.length) {
  process.exit(0);
} else {
  process.exit(1);
}
