import test from 'node:test';
import assert from 'node:assert';
import {
  parseAlertHeadline,
  classifyModelMatch,
  extractModelTokens,
  extractBrandTokens,
  isBrandPlausibleCore,
  extractBaseAlertCode,
  extractFdaProductSubject
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

test('False Positive Prevention - Nihon Kohden Z-0089-2027 should NOT match other brands', () => {
  const fdaAlert = {
    TRADE_NAME: 'Nihon Kohden CNS-6200 Series Central Nurse Station',
    FIRM_NAME: 'Nihon Kohden America LLC',
    PRODUCT_DESCRIPTION: 'Product Name: Nihon Kohden CNS-6200 Series Central Nurse Station,\r\nModel/Catalog Number: CN-6201\r\nSoftware Version: software versions: 01-03, 01-04, 01-05, 01-06, 02-10, 02-11, and 02-40\r\nProduct Description: The device is intended for use by medical professionals to provide cardiac and vital signs monitoring for multiple patients within a medical facility. The CNS-6200 Series Central Nurse Station will display and record physiological data from up to forty telemetry receiver/transmitters and generates an alarm when a measured parameter falls outside a pre-set limit or when life threatening arrhythmia is detected. Arrhythmia detection and alarm determination are functions of the telemetry receivers/transmitters or individual bedside monitor.\r\nComponent: No\r\n'
  };

  const subject = extractFdaProductSubject(fdaAlert.PRODUCT_DESCRIPTION);
  assert.strictEqual(subject, 'Nihon Kohden CNS-6200 Series Central Nurse Station');

  const alertTitle = `FDA Recall: ${fdaAlert.TRADE_NAME}`;

  // 1. ETHICON ENDO-SURGERY GEN 11 must be rejected by brand plausibility
  assert.strictEqual(
    isBrandPlausibleCore(fdaAlert.FIRM_NAME, alertTitle, 'ETHICON ENDO-SURGERY', ['GEN 11', 'GEN11']),
    false
  );

  // 2. DEFIBTECH LIFELINE must be rejected
  assert.strictEqual(
    isBrandPlausibleCore(fdaAlert.FIRM_NAME, alertTitle, 'DEFIBTECH', ['LIFELINE']),
    false
  );

  // 3. SIEMENS YSIO must be rejected
  assert.strictEqual(
    isBrandPlausibleCore(fdaAlert.FIRM_NAME, alertTitle, 'SIEMENS HEALTHCARE', ['YSIO']),
    false
  );

  // 4. Even if model classifier were mistakenly fed GEN 11, it must return NONE
  assert.strictEqual(
    classifyModelMatch(subject, fdaAlert.PRODUCT_DESCRIPTION, 'GEN 11'),
    'NONE'
  );

  // 5. A real Nihon Kohden CNS-6200 / CN-6201 MUST match STRONG
  assert.strictEqual(
    isBrandPlausibleCore(fdaAlert.FIRM_NAME, alertTitle, 'NIHON KOHDEN', []),
    true
  );
  assert.strictEqual(
    classifyModelMatch(subject, fdaAlert.PRODUCT_DESCRIPTION, 'CNS-6200'),
    'STRONG'
  );
});

