import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/content/locomotion.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createLocomotion } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let frames = 0;
let plantedFrames = 0;
let liftFrames = 0;
let seed = 27;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const routes = [{ x: 850, y: 430 }, { x: 150, y: 430 }, { x: 200, y: 90 }, { x: 205, y: 110 }, { x: 205, y: 112 }, { x: 800, y: 100 },
  ...Array.from({ length: 24 }, () => ({ x: 90 + random() * 1000, y: 90 + random() * 550 }))];
for (const dt of [1 / 60, 1 / 30, 0.04]) {
  const position = { x: 100, y: 120 };
  const motion = createLocomotion(position);
  // Long travel followed by reversals and tight turns catches support deadlocks.
  for (const target of routes) {
    let arrived = false;
    for (let frame = 0; frame < 18000 && !arrived; frame++) {
      const before = motion.legs.map(leg => ({ foot: { ...leg.foot }, progress: leg.progress }));
      const heading = motion.heading;
      arrived = motion.advance(target, dt);
      frames++;
      assert.ok(Math.abs(motion.heading - heading) <= 1.8 * dt + 1e-8, 'heading must turn gradually');
      assert.ok(motion.legs.filter(leg => leg.progress < 1).length <= 4, 'at least four legs support the body');
      for (let index = 0; index < 8; index++) {
        const leg = motion.legs[index];
        assert.ok(Math.abs(distance(leg.hip, leg.knee) - leg.upper) < 0.001, 'upper bone length');
        assert.ok(Math.abs(distance(leg.knee, leg.foot) - leg.lower) < 0.001, 'lower bone length');
        assert.ok(distance(leg.hip, leg.foot) <= leg.maximum + 0.001, `maximum reach: frame ${frame}, pair ${leg.pair}, progress ${leg.progress}, reach ${distance(leg.hip, leg.foot)}`);
        if (before[index].progress === 1) {
          assert.deepEqual(leg.foot, before[index].foot, 'planted foot cannot slide, including the lift trigger frame');
          plantedFrames++;
        } else if (distance(leg.foot, before[index].foot) > 0) liftFrames++;
      }
    }
    assert.ok(arrived, `must arrive without support deadlock: ${JSON.stringify(target)}`);
    motion.freeze();
    const frozen = JSON.stringify({ center: motion.center, heading: motion.heading, legs: motion.legs });
    motion.freeze();
    assert.equal(JSON.stringify({ center: motion.center, heading: motion.heading, legs: motion.legs }), frozen, 'stop freezes the full pose');
    assert.ok(distance(position, target) <= 0.8, 'arrival tolerance');
  }
}
assert.ok(liftFrames > 100, 'feet actually step');
// A camera shift must preserve each document-space anchor and airborne plan,
// without inventing travel. Then real forward crawling stretches/steps the legs.
let scrollSteps = 0;
for (const dt of [1 / 60, 1 / 30, 0.04]) {
  const position = { x: 400, y: 120 };
  const motion = createLocomotion(position);
  let scrollY = 0;
  for (let frame = 0; frame < 1800; frame++) {
    const delta = 90 * Math.max(0, Math.min(1, (position.y - 65) / 65)) * dt;
    const before = motion.legs.map(leg => ({ foot: { ...leg.foot }, from: { ...leg.from }, to: { ...leg.to }, progress: leg.progress }));
    const body = { ...motion.center };
    const heading = motion.heading;
    motion.followSurface({ x: 0, y: delta });
    scrollY += delta;
    assert.ok(Math.abs(motion.center.y - (body.y - delta)) < 1e-8, 'body follows the same document surface');
    assert.equal(motion.heading, heading, 'scroll cannot rotate the body');
    motion.legs.forEach((leg, index) => {
      assert.equal(leg.progress, before[index].progress, 'camera motion cannot advance a step');
      for (const key of ['foot', 'from', 'to']) {
        assert.ok(Math.abs(leg[key].y - (before[index][key].y - delta)) < 1e-8, 'footholds and swing plans share scroll coordinates');
      }
    });
    motion.advance({ x: 400, y: 494 }, dt, 150);
    assert.ok(distance(body, motion.center) < 8, 'slow scroll and crawling remain continuous');
    assert.ok(position.y > 40 && position.y < 650, 'crawler remains visible without body clamps');
    assert.ok(motion.legs.filter(leg => leg.progress < 1).length <= 4, 'scrolling retains four support feet');
    motion.legs.forEach((leg, index) => {
      if (before[index].progress === 1) {
        assert.ok(Math.abs(leg.foot.y - (before[index].foot.y - delta)) < 1e-8, 'support foot remains fixed to document pixels');
      }
      if (before[index].progress === 1 && leg.progress === 0) scrollSteps++;
      assert.ok(Math.abs(distance(leg.hip, leg.knee) - leg.upper) < 0.001, 'scroll upper bone');
      assert.ok(Math.abs(distance(leg.knee, leg.foot) - leg.lower) < 0.001, 'scroll lower bone');
    });
  }
  assert.ok(scrollY > 2000, 'long scrolling makes progress');
  const beforeSwitch = { ...motion.center };
  const previousHeading = motion.heading;
  motion.advance({ x: 700, y: 300 }, dt);
  assert.ok(distance(beforeSwitch, motion.center) < 8, 'new DOM target preserves the current pose');
  assert.ok(Math.abs(motion.heading - previousHeading) <= 1.8 * dt + 1e-8, 'target handoff keeps turning inertia');
  const reverse = motion.legs.map(leg => ({ ...leg.foot }));
  motion.followSurface({ x: -3, y: -7 });
  motion.legs.forEach((leg, index) => {
    assert.equal(leg.foot.x, reverse[index].x + 3, 'manual horizontal scroll shares coordinates');
    assert.equal(leg.foot.y, reverse[index].y + 7, 'manual upward scroll shares coordinates');
  });
}
assert.ok(scrollSteps > 100, 'feet keep stepping on a long scrolling surface');
console.log(`IK checks passed: ${frames} frames, ${plantedFrames} anchored foot frames, ${liftFrames} moving foot frames.`);
console.log(`Scroll attachment checks passed: ${scrollSteps} foot lifts with document-space anchors.`);
