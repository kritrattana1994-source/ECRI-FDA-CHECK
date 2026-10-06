import test from 'node:test';
import assert from 'node:assert';
import {
  parseAlertHeadline,
  classifyModelMatch,
  extractBaseAlertCode
} from '../src/matcher_core.js';

test('Comprehensive Offline Match Test for A46797 01', () => {
  const headline = 'Philips—EPIQ Elite Systems: May Display Visually Offset Measurements';
  const parsed = parseAlertHeadline(headline, 'ECRI');

  assert.strictEqual(parsed.brand, 'Philips');
  assert.strictEqual(parsed.subject, 'EPIQ Elite Systems');
  assert.strictEqual(parsed.problem, 'May Display Visually Offset Measurements');

  // List of actual devices found in hospital inventory:
  const hospitalDevices = [
    { hosp: 'ศูนย์หัวใจสิริกิติ์', code: 'QSHC01913', brand: 'PHILIPS', model: 'EPIQ ELITE' },
    { hosp: 'โรงพยาบาลกรุงเทพเชียงราย', code: 'BCR00900', brand: 'PHILIPS', model: 'EPIQ ELITE' },
    { hosp: 'โรงพยาบาลกรุงเทพเขาใหญ่', code: 'BHK00369', brand: 'Philips', model: 'Epiq CVx' },
    { hosp: 'ศูนย์หัวใจสิริกิติ์', code: 'QSHC01645', brand: 'PHILIPS', model: 'EPIQ CVX' },
    { hosp: 'โรงพยาบาลกรุงเทพขอนแก่น', code: 'BKN3029', brand: 'PHILIPS', model: 'EPIQ CVX' },
    { hosp: 'โรงพยาบาลกรุงเทพราชสีมา', code: 'BKH 02777', brand: 'PHILIPS', model: 'EPIQ 7C' },
    { hosp: 'โรงพยาบาลกรุงเทพราชสีมา', code: 'BKH 02968', brand: 'PHILIPS', model: 'EPIQ 5' },
    { hosp: 'โรงพยาบาลศรีนครินทร์', code: 'SFM03590', brand: 'PHILIPS', model: 'EPIQ CVX' },
    // Irrelevant Philips devices that should NOT match:
    { hosp: 'รพ.กรุงเทพ', code: 'BHK001', brand: 'PHILIPS', model: 'IntelliVue MX800' },
    { hosp: 'รพ.กรุงเทพ', code: 'BHK002', brand: 'PHILIPS', model: 'HeartStart XL' },
    { hosp: 'รพ.กรุงเทพ', code: 'BHK003', brand: 'PHILIPS', model: 'ClearVue 350' }
  ];

  const matchedStrong = [];
  const matchedFamily = [];
  const matchedNone = [];

  hospitalDevices.forEach(d => {
    const tier = classifyModelMatch(parsed.subject, parsed.problem, d.model);
    if (tier === 'STRONG') matchedStrong.push(d);
    else if (tier === 'FAMILY') matchedFamily.push(d);
    else matchedNone.push(d);
  });

  // Verify STRONG matches: exactly both EPIQ ELITE devices
  assert.strictEqual(matchedStrong.length, 2);
  assert.strictEqual(matchedStrong[0].code, 'QSHC01913'); // สิริกิติ์
  assert.strictEqual(matchedStrong[1].code, 'BCR00900');  // เชียงราย

  // Verify FAMILY matches: all EPIQ series devices (CVX, 7C, 5)
  assert.strictEqual(matchedFamily.length, 6);

  // Verify NONE: all other non-EPIQ devices
  assert.strictEqual(matchedNone.length, 3);

  // Verify Update Inheritance: A46797 01 inherits A46797
  const baseCode = extractBaseAlertCode('A46797 01');
  assert.strictEqual(baseCode, 'A46797');

  console.log('✅ Offline Match Test Passed completely!');
  console.log('STRONG Matches (Deterministic):', matchedStrong.map(m => `${m.hosp}: ${m.model} (${m.code})`));
  console.log('FAMILY Matches (Prioritized candidates):', matchedFamily.map(m => `${m.hosp}: ${m.model} (${m.code})`));
});
