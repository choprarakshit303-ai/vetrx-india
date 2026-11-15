import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def run_vector(tc_id):
    p = subprocess.run(
        ['node', str(ROOT / 'tests' / 'run_vector.js'), tc_id],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if p.returncode != 0:
        raise AssertionError(f"Vector {tc_id} failed to run: rc={p.returncode}\nstdout={p.stdout}\nstderr={p.stderr}")
    try:
        return json.loads(p.stdout.strip())
    except Exception as e:
        raise AssertionError(f"Vector {tc_id} returned non-JSON: {p.stdout!r} (stderr={p.stderr!r})") from e

class GoldenTestVectors(unittest.TestCase):
    def test_tc01_neonatal_kitten_fluid_kcl_clamp(self):
        r = run_vector('TC-01')
        self.assertFalse(r['blocked'])
        self.assertTrue(r['clampTriggered'])
        self.assertTrue(r['buretteRecommended'])
        self.assertAlmostEqual(float(r['kMaxCeilingMeqHr']), 0.225, places=3)
        self.assertGreaterEqual(float(r['kclVol']), 0.0)

    def test_tc02_obese_labrador_ibw_scaling(self):
        r = run_vector('TC-02')
        self.assertFalse(r['blocked'])
        self.assertAlmostEqual(float(r['ibwKg']), 32.31, delta=0.02)
        self.assertAlmostEqual(float(r['exactDoseVal']), 71.08, delta=0.05)
        self.assertEqual(int(r['perAdminUnits']), 1)
        self.assertAlmostEqual(float(r['variancePct']), 5.5, delta=0.15)

    def test_tc03_canine_lidocaine_cri(self):
        r = run_vector('TC-03')
        self.assertFalse(r['blocked'])
        self.assertAlmostEqual(float(r['hourlyDrugMg']), 60.0, delta=0.01)
        self.assertAlmostEqual(float(r['neatPumpMlHr']), 3.0, delta=0.01)
        self.assertAlmostEqual(float(r['rawBagDurationHr']), 10.0, delta=0.01)
        self.assertAlmostEqual(float(r['drugVolForBagMl']), 30.0, delta=0.01)
        self.assertFalse(r['exceeds24hHangLimit'])

    def test_tc04_dairy_buffalo_butalex_im_split_withdrawals(self):
        r = run_vector('TC-04')
        self.assertFalse(r['blocked'])
        self.assertAlmostEqual(float(r['exactDoseVal']), 1250.0, delta=0.1)
        self.assertAlmostEqual(float(r['perAdminUnits']), 25.0, delta=0.05)
        self.assertEqual(int(r['sitesNeeded']), 3)
        self.assertEqual(int(r['milkHr']), 48)
        self.assertEqual(int(r['meatDays']), 42)

    def test_tc05_canine_recover_cpr(self):
        r = run_vector('TC-05')
        self.assertFalse(r['blocked'])
        self.assertAlmostEqual(float(r['epiMg']), 0.15, delta=0.001)
        self.assertAlmostEqual(float(r['epiMl']), 0.15, delta=0.005)
        self.assertAlmostEqual(float(r['atroMg']), 0.75, delta=0.01)
        self.assertAlmostEqual(float(r['atroMl']), 1.25, delta=0.01)
        self.assertAlmostEqual(float(r['atro054']), 1.39, delta=0.02)
        self.assertTrue(r['catLidoBlocked'])

    def test_tc06_toy_dog_rounding_hard_block_override(self):
        r = run_vector('TC-06')
        self.assertTrue(r['blockedExceedsTenPct'])
        self.assertTrue(r['blockedBlocked'])
        self.assertFalse(r['overriddenBlocked'])

    def test_tc07_invalid_weights_blocked(self):
        rs = run_vector('TC-07')
        self.assertEqual(len(rs), 3)
        for r in rs:
            self.assertTrue(r['blocked'])
            self.assertTrue(r['exactDoseValNull'])

    def test_tc08_unapproved_species_invalid_route(self):
        r = run_vector('TC-08')
        self.assertTrue(r['r1Blocked'])
        self.assertTrue(r['r2Blocked'])

    def test_tc09_max_daily_dose_ceiling_and_max_duration(self):
        r = run_vector('TC-09')
        self.assertTrue(r['r1Blocked'])
        self.assertTrue(r['r2Blocked'])

    def test_tc10_two_phase_rehydration(self):
        r = run_vector('TC-10')
        self.assertFalse(r['blocked'])
        self.assertTrue(r['isTwoPhase'])
        self.assertGreater(float(r['phase1HourlyMl']), float(r['phase2HourlyMl']))

    def test_tc11_duplicate_nsaid_and_nsaid_corticosteroid(self):
        r = run_vector('TC-11')
        self.assertTrue(r['r1Blocked'])
        self.assertTrue(r['r2Blocked'])

    def test_tc12_pregnancy_pediatric_mdr1_blocks(self):
        r = run_vector('TC-12')
        self.assertTrue(r['pregBlocked'])
        self.assertTrue(r['pedBlocked'])
        self.assertTrue(r['mdr1Blocked'])

    def test_tc13_renal_iris3_blocks_scales(self):
        r = run_vector('TC-13')
        self.assertTrue(r['blocked'])
        self.assertFalse(r['scaledBlocked'])
        self.assertAlmostEqual(float(r['factor']), 0.5, delta=0.05)

    def test_tc14_poultry_flock_dosing_shaeffer(self):
        r = run_vector('TC-14')
        self.assertTrue(r['flockValid'])
        self.assertAlmostEqual(float(r['totalBiomassKg']), 1500.0, delta=0.1)
        self.assertAlmostEqual(float(r['dailyActiveMg']), 30000.0, delta=0.1)
        self.assertAlmostEqual(float(r['dailyPowderG']), 300.0, delta=0.1)
        self.assertAlmostEqual(float(r['conc']), 90.91, delta=0.2)
        self.assertTrue(r['cattleValid'])
        self.assertTrue(r['buffaloValid'])
        self.assertAlmostEqual(float(r['buffaloKg']) / float(r['cattleKg']), 1.04, delta=0.02)

    def test_tc15_multi_unit_cri_24h_hang_time(self):
        r = run_vector('TC-15')
        self.assertFalse(r['blocked'])
        self.assertAlmostEqual(float(r['rateMcgKgMin']), 1.3889, delta=0.01)
        self.assertTrue(r['exceeds24hHangLimit'])
        self.assertAlmostEqual(float(r['effectiveHangHours']), 24.0, delta=0.001)

    def test_tc16_shaeffer_and_cdso_statutory_bans(self):
        r = run_vector('TC-16')
        self.assertTrue(r['cattleValid'])
        self.assertTrue(r['buffaloValid'])
        self.assertAlmostEqual(float(r['buffaloKg']) / float(r['cattleKg']), 1.04, delta=0.02)
        self.assertEqual(len(r['bans']), 3)
        for b in r['bans']:
            self.assertTrue(b['exists'], f"Missing SKU {b['id']}")
            self.assertTrue(b['blocked'], f"{b['id']} should be blocked")

if __name__ == '__main__':
    unittest.main(verbosity=2)
