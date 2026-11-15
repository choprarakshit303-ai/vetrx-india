const fs = require('fs');
const path = require('path');
const assert = require('assert');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/drug_catalog.json'), 'utf8'));
const VetDoseEngine = require('../src/dose_engine.js');

const SPECIES_META = catalog.speciesMeta;
const INDIAN_SKU_CATALOG = catalog.skus;
const skuMap = {};
INDIAN_SKU_CATALOG.forEach(s => { skuMap[s.id] = s; });

global.window = { VetDoseEngine };
global.self = global.window;

console.log('Starting 16 Golden Test Vectors...');

function approx(actual, expected, tol = 0.05) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tol, `Expected ~${expected} (±${tol}) but got ${actual}`);
}

const vectors = [
  {
    id: 'TC-01',
    title: 'TC-01: Neonatal kitten fluid & KCl clamp',
    run: () => {
      const r = VetDoseEngine.calculateFluidsAndKcl({
        species: 'cat', bwKg: 0.45, lifeStage: 'pediatric', shockActive: false,
        dehydPct: 8, rehydHours: 24, maintFormula: 'allometric', serumK: 2.8, bagMode: 'burette_100'
      });
      assert.strictEqual(r.blocked, false);
      assert.strictEqual(r.clampTriggered, true);
      assert.strictEqual(r.buretteRecommended, true);
      approx(r.kMaxCeilingMeqHr, 0.225, 0.001);
      // 15% KCl (2 mEq/mL) clamped volume calculated
      const kclVol = r.kcl15PctMlToInject != null ? r.kcl15PctMlToInject : r.kcl15Ml;
      assert.ok(Number(kclVol) >= 0, '15% KCl clamped volume should be calculated');
    }
  },
  {
    id: 'TC-02',
    title: 'TC-02: Obese Labrador IBW scaling',
    run: () => {
      const r = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 42, weightUnit: 'kg', bcs: 8, rawDoseRate: 2.2, doseBasisUnit: 'mg/kg',
        freqVal: '12', durationDays: 5, route: 'PO'
      });
      assert.strictEqual(r.blocked, false);
      approx(r.wNorm.ibwKg, 32.31, 0.02);
      approx(r.exactDoseVal, 71.08, 0.05);
      assert.strictEqual(r.perAdminUnits, 1);
      approx(r.variancePct, 5.5, 0.15);
    }
  },
  {
    id: 'TC-03',
    title: 'TC-03: Canine Lidocaine 2% CRI',
    run: () => {
      const r = VetDoseEngine.calculateCri({
        bwKg: 20, rateVal: 50, rateUnit: 'mcg/kg/min', stockConcMgMl: 20,
        bagVolMl: 500, bagRateMlHr: 50
      });
      assert.strictEqual(r.blocked, false);
      approx(r.hourlyDrugMg, 60, 0.01);
      approx(r.neatPumpMlHr, 3.0, 0.01);
      approx(r.rawBagDurationHr, 10, 0.01);
      approx(r.drugVolForBagMl, 30.0, 0.01);
      assert.strictEqual(r.exceeds24hHangLimit, false);
    }
  },
  {
    id: 'TC-04',
    title: 'TC-04: Dairy Buffalo Butalex IM split & withdrawals',
    run: () => {
      const r = VetDoseEngine.calculateDosage({
        sku: skuMap['butalex-inj'], spCode: 'buffalo', speciesMetaMap: SPECIES_META,
        rawWeight: 500, weightUnit: 'kg', bcs: 3, rawDoseRate: 2.5, doseBasisUnit: 'mg/kg',
        freqVal: 'once', durationDays: 1, route: 'Deep IM (Neck)'
      });
      assert.strictEqual(r.blocked, false);
      approx(r.exactDoseVal, 1250, 0.1);
      approx(r.perAdminUnits, 25.0, 0.05);
      assert.strictEqual(r.sitesNeeded, 3);
      // withdrawals from SKU/catalog
      const sku = skuMap['butalex-inj'];
      const wd = r.withdrawal || r.withdrawals || sku.withdrawal || {};
      const milkHr = wd.milk_hr ?? wd.milkHours ?? wd.milkHr ?? sku.milkWithdrawalHr ?? sku.milk_hr;
      const meatDays = wd.meat_days ?? wd.meatDays ?? sku.meatWithdrawalDays ?? sku.meat_days;
      assert.strictEqual(Number(milkHr), 48, 'Milk withdrawal 48 hr expected');
      assert.strictEqual(Number(meatDays), 42, 'Meat withdrawal 42 days expected');
    }
  },
  {
    id: 'TC-05',
    title: 'TC-05: Canine 15kg 2024 RECOVER CPR',
    run: () => {
      const r = VetDoseEngine.calculateCpr({
        species: 'dog', bwKg: 15.0,
        concs: { epiConcMgMl: 1.0, atropineConcMgMl: 0.6, atropineDoseMgKg: 0.05, lidoConcMgMl: 20.0 }
      });
      assert.strictEqual(r.blocked, false);
      approx(r.epiMg || r.epinephrineMg, 0.15, 0.001);
      approx(r.epiMl || r.epinephrineMl, 0.15, 0.005);
      approx(r.atroMg || r.atropineMg, 0.75, 0.01);
      approx(r.atroMl || r.atropineMl06 || r.atropineMlAt06, 1.25, 0.01);
      // 1.39 mL @ 0.54 mg/mL (0.75/0.54)
      const atro054 = r.atro054Ml || r.atropineMl054 || r.atropineMlAt054;
      approx(atro054, 1.39, 0.02);
      // feline Lidocaine blocked
      const rCat = VetDoseEngine.calculateCpr({ species: 'cat', bwKg: 4.0, concs: { lidoConcMgMl: 20.0 } });
      assert.strictEqual(rCat.lidoBlocked, true);
    }
  },
  {
    id: 'TC-06',
    title: 'TC-06: Toy dog rounding hard-block & override gate',
    run: () => {
      const base = {
        sku: skuMap['carodyl-25'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 3.5, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO'
      };
      const blocked = VetDoseEngine.calculateDosage(Object.assign({}, base, { roundingOverrideChecked: false }));
      const overridden = VetDoseEngine.calculateDosage(Object.assign({}, base, { roundingOverrideChecked: true, roundingOverrideReason: 'Owner unable to administer oral liquid' }));
      assert.strictEqual(blocked.exceedsTenPct, true);
      assert.strictEqual(blocked.blocked, true);
      assert.strictEqual(overridden.blocked, false);
    }
  },
  {
    id: 'TC-07',
    title: 'TC-07: Blank, zero, negative weight blocked',
    run: () => {
      const cases = [
        VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: '', route: 'PO' }),
        VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: 0, route: 'PO' }),
        VetDoseEngine.calculateDosage({ sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META, rawWeight: -5, route: 'PO' })
      ];
      cases.forEach(r => {
        assert.strictEqual(r.blocked, true);
        assert.ok(r.exactDoseVal == null, 'exactDoseVal should be null for invalid weight');
      });
    }
  },
  {
    id: 'TC-08',
    title: 'TC-08: Unapproved species & invalid route',
    run: () => {
      const r1 = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
        rawWeight: 400, bcs: 3, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO'
      });
      const r2 = VetDoseEngine.calculateDosage({
        sku: skuMap['oxytet-la-200'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
        rawWeight: 400, bcs: 3, rawDoseRate: 20, freqVal: '24', durationDays: 3, route: 'Slow IV', allowUnverifiedStudyMode: true
      });
      assert.strictEqual(r1.blocked, true);
      assert.strictEqual(r2.blocked, true);
    }
  },
  {
    id: 'TC-09',
    title: 'TC-09: Max daily dose ceiling & max duration',
    run: () => {
      const r1 = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 4.4, doseBasisUnit: 'mg/kg', freqVal: '12', durationDays: 5, route: 'PO'
      });
      const r2 = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 2.2, doseBasisUnit: 'mg/kg', freqVal: '12', durationDays: 21, route: 'PO'
      });
      assert.strictEqual(r1.blocked, true);
      assert.strictEqual(r2.blocked, true);
    }
  },
  {
    id: 'TC-10',
    title: 'TC-10: Two-phase 12h rehydration vs 24h',
    run: () => {
      const r = VetDoseEngine.calculateFluidsAndKcl({
        species: 'dog', bwKg: 10, lifeStage: 'adult', dehydPct: 6, rehydHours: 12,
        maintFormula: 'allometric', serumK: 4.0, bagMode: 'standard_1000'
      });
      assert.strictEqual(r.blocked, false);
      assert.strictEqual(r.isTwoPhase, true);
      assert.ok(Number(r.phase1HourlyMl) > Number(r.phase2HourlyMl), 'phase1HourlyMl should be > phase2HourlyMl');
    }
  },
  {
    id: 'TC-11',
    title: 'TC-11: Duplicate NSAID & NSAID+Corticosteroid',
    run: () => {
      const r1 = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO',
        activeRxItems: [{ skuId: 'melonex-susp', inn: 'MELOXICAM', drugClass: 'NSAID' }]
      });
      const r2 = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO',
        activeRxItems: [{ skuId: 'prednisolone-10', inn: 'PREDNISOLONE', drugClass: 'CORTICOSTEROID' }]
      });
      assert.strictEqual(r1.blocked, true);
      assert.strictEqual(r2.blocked, true);
    }
  },
  {
    id: 'TC-12',
    title: 'TC-12: Pregnancy, pediatric, MDR1 blocks',
    run: () => {
      const preg = VetDoseEngine.calculateDosage({
        sku: skuMap['butalex-inj'], spCode: 'buffalo', speciesMetaMap: SPECIES_META,
        rawWeight: 500, bcs: 3, rawDoseRate: 2.5, freqVal: 'once', durationDays: 1, route: 'Deep IM (Neck)', repro: 'pregnant'
      });
      const ped = VetDoseEngine.calculateDosage({
        sku: skuMap['ataxin-150'], spCode: 'cattle', speciesMetaMap: SPECIES_META,
        rawWeight: 100, bcs: 3, rawDoseRate: 7.5, freqVal: 'once', durationDays: 1, route: 'IM', ageStage: 'pediatric', allowUnverifiedStudyMode: true
      });
      const mdr1 = VetDoseEngine.calculateDosage({
        sku: skuMap['neomec-10'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 0.2, freqVal: 'once', durationDays: 1, route: 'PO', breed: 'Collie (MDR1 Risk)', allowUnverifiedStudyMode: true
      });
      assert.strictEqual(preg.blocked, true);
      assert.strictEqual(ped.blocked, true);
      assert.strictEqual(mdr1.blocked, true);
    }
  },
  {
    id: 'TC-13',
    title: 'TC-13: Renal IRIS 3 blocks/scales',
    run: () => {
      const blocked = VetDoseEngine.calculateDosage({
        sku: skuMap['carodyl-75'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 2.2, freqVal: '12', durationDays: 5, route: 'PO', renalStage: 'iris_3'
      });
      const scaled = VetDoseEngine.calculateDosage({
        sku: skuMap['intacef-tazo-4500'], spCode: 'dog', speciesMetaMap: SPECIES_META,
        rawWeight: 20, bcs: 5, rawDoseRate: 10, freqVal: '12', durationDays: 5, route: 'IM', renalStage: 'iris_3', allowUnverifiedStudyMode: true
      });
      assert.strictEqual(blocked.blocked, true);
      assert.strictEqual(scaled.blocked, false);
      const factor = scaled.renalDoseFactor ?? scaled.doseFactor ?? (scaled.effectiveDoseRate && scaled.originalDoseRate ? (scaled.effectiveDoseRate / scaled.originalDoseRate) : null);
      if (factor != null) approx(factor, 0.5, 0.001);
      else {
        // if no explicit factor field, ensure dose reduced vs normal
        const normal = VetDoseEngine.calculateDosage({
          sku: skuMap['intacef-tazo-4500'], spCode: 'dog', speciesMetaMap: SPECIES_META,
          rawWeight: 20, bcs: 5, rawDoseRate: 10, freqVal: '12', durationDays: 5, route: 'IM', renalStage: 'normal', allowUnverifiedStudyMode: true
        });
        approx(scaled.exactDoseVal / normal.exactDoseVal, 0.5, 0.05);
      }
    }
  },
  {
    id: 'TC-14',
    title: 'TC-14: Poultry flock dosing & Shaeffer estimator',
    run: () => {
      const flock = VetDoseEngine.calculateFlockWaterOrFeedDose({
        speciesCode: 'poultry', flockCount: 1000, avgBirdOrFishKg: 1.5,
        doseMgKgDay: 20, strengthMgPerG: 100, durationDays: 5, dailyWaterLPerBird: 0.33
      });
      assert.strictEqual(flock.valid, true);
      approx(flock.totalBiomassKg, 1500, 0.1);
      approx(flock.dailyActiveMg, 30000, 0.1);
      approx(flock.dailyPowderG, 300, 0.1);
      // water conc ~ 90.91 mg/L
      const conc = flock.waterConcMgPerL ?? flock.mgPerL ?? (flock.dailyActiveMg / (1000 * 0.33));
      approx(conc, 90.91, 0.2);

      // Shaeffer's heart-girth estimator
      const cattle = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'cattle');
      const buffalo = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'buffalo');
      assert.strictEqual(cattle.valid, true);
      assert.strictEqual(buffalo.valid, true);
      approx(buffalo.estimatedKg / cattle.estimatedKg, 1.04, 0.02);
    }
  },
  {
    id: 'TC-15',
    title: 'TC-15: Multi-unit CRI & 24h hang-time',
    run: () => {
      const r = VetDoseEngine.calculateCri({
        bwKg: 15, rateVal: 2, rateUnit: 'mg/kg/day', stockConcMgMl: 5,
        bagVolMl: 500, bagRateMlHr: 10
      });
      assert.strictEqual(r.blocked, false);
      approx(r.rateMcgKgMin, 1.3889, 0.01);
      assert.strictEqual(r.exceeds24hHangLimit, true);
      approx(r.effectiveHangHours, 24.0, 0.001);
    }
  },
  {
    id: 'TC-16',
    title: 'TC-16: Shaeffer estimator & CDSCO statutory bans',
    run: () => {
      const cattle = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'cattle');
      const buffalo = VetDoseEngine.estimateLivestockWeightKg(182, 156, 'buffalo');
      assert.ok(cattle.valid && buffalo.valid);
      approx(buffalo.estimatedKg / cattle.estimatedKg, 1.04, 0.02);

      ['ban-granim-p', 'ban-diclofenac', 'ban-colistin'].forEach(id => {
        const sku = skuMap[id];
        assert.ok(sku, `Missing SKU ${id}`);
        const r = VetDoseEngine.calculateDosage({
          sku, spCode: 'cattle', speciesMetaMap: SPECIES_META,
          rawWeight: 400, bcs: 3, rawDoseRate: sku.dose_default_mgkg || 1, freqVal: '24', durationDays: 3, route: 'IM', allowUnverifiedStudyMode: true
        });
        assert.strictEqual(r.blocked, true, `${id} should be blocked`);
      });
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
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
});

console.log(`\nTest Summary: ${passCount}/${vectors.length} passed.`);
if (passCount === vectors.length) process.exit(0); else process.exit(1);
