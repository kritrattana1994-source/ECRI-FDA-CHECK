import test from 'node:test';
import assert from 'node:assert';
import {
  parseAlertHeadline,
  classifyModelMatch,
  extractModelTokens,
  extractBrandTokens,
  isBrandPlausibleCore,
  extractBaseAlertCode
} from '../src/matcher_core.js';

test('parseAlertHeadline - should parse standard ECRI headlines', () => {
  const h1 = 'Philips—EPIQ Elite Systems: May Display Visually Offset Measurements';
  const p1 = parseAlertHeadline(h1);
  assert.strictEqual(p1.brand, 'Philips');
  assert.strictEqual(p1.subject, 'EPIQ Elite Systems');
  assert.strictEqual(p1.problem, 'May Display Visually Offset Measurements');

  const h2 = 'Medtronic—Newport HT70 and HT70 Plus Ventilators: May Exhibit Failures [Update]';
  const p2 = parseAlertHeadline(h2);
  assert.strictEqual(p2.brand, 'Medtronic');
  assert.strictEqual(p2.subject, 'Newport HT70 and HT70 Plus Ventilators');
  assert.strictEqual(p2.problem, 'May Exhibit Failures [Update]');
});

test('classifyModelMatch - EPIQ Elite headline vs various models', () => {
  const subject = 'EPIQ Elite Systems';
  const problem = 'May Display Visually Offset Measurements';

  // 1. Exact match with hospital models
  assert.strictEqual(classifyModelMatch(subject, problem, 'EPIQ ELITE'), 'STRONG');
  assert.strictEqual(classifyModelMatch(subject, problem, 'EPIQ Elite'), 'STRONG');

  // 2. Family match (shares EPIQ, but differs in specific model)
  assert.strictEqual(classifyModelMatch(subject, problem, 'EPIQ CVX'), 'FAMILY');
  assert.strictEqual(classifyModelMatch(subject, problem, 'EPIQ 7C'), 'FAMILY');
  assert.strictEqual(classifyModelMatch(subject, problem, 'EPIQ 5'), 'FAMILY');

  // 3. No match (completely different Philips lines)
  assert.strictEqual(classifyModelMatch(subject, problem, 'IntelliVue MX800'), 'NONE');
  assert.strictEqual(classifyModelMatch(subject, problem, 'HeartStart XL'), 'NONE');
  assert.strictEqual(classifyModelMatch(subject, problem, 'ClearVue 350'), 'NONE');
  assert.strictEqual(classifyModelMatch(subject, problem, 'Affiniti 70'), 'NONE');
});

test('classifyModelMatch - other real medical equipment examples', () => {
  // Olympus SOLTIVE
  assert.strictEqual(classifyModelMatch('SOLTIVE SuperPulsed Laser Fibers', '', 'SOLTIVE SuperPulsed'), 'STRONG');
  assert.strictEqual(classifyModelMatch('SOLTIVE SuperPulsed Laser Fibers', '', 'SOLTIVE'), 'STRONG');
  assert.strictEqual(classifyModelMatch('SOLTIVE SuperPulsed Laser Fibers', '', 'CV-190'), 'NONE');

  // Getinge / Datascope CS100 and CS300
  assert.strictEqual(classifyModelMatch('CS100 and CS300 Intra-Aortic Balloon Pumps', '', 'CS100'), 'STRONG');
  assert.strictEqual(classifyModelMatch('CS100 and CS300 Intra-Aortic Balloon Pumps', '', 'CS300'), 'STRONG');
  assert.strictEqual(classifyModelMatch('CS100 and CS300 Intra-Aortic Balloon Pumps', '', 'Cardiosave'), 'NONE');
});

test('extractBaseAlertCode - should link update alerts to parent alerts', () => {
  assert.strictEqual(extractBaseAlertCode('A46797 01'), 'A46797');
  assert.strictEqual(extractBaseAlertCode('A46797 02'), 'A46797');
  assert.strictEqual(extractBaseAlertCode('A46797-01'), 'A46797');
  assert.strictEqual(extractBaseAlertCode('A46797'), null);
  assert.strictEqual(extractBaseAlertCode('Z-0003-2027'), null);
});

test('isBrandPlausibleCore - should handle brand matching and product brand names', () => {
  assert.strictEqual(isBrandPlausibleCore('Philips', 'Philips Alert', 'PHILIPS'), true);
  assert.strictEqual(isBrandPlausibleCore('Philips', 'Philips Alert', 'OLYMPUS'), false);
  // Product Brand Name fallback
  assert.strictEqual(isBrandPlausibleCore('Bedfont', 'NOxBOX Alert', 'BEDFONT SCIENTIFIC', ['NOxBOX']), true);
});
