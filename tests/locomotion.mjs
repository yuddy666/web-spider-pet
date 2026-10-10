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
for (const dt of [1 / 60, 1 / 30, 0.04]) {
  const position = { x: 100, y: 120 };
  const motion = createLocomotion(position);
  // Long travel followed by reversals and tight turns catches support deadlocks.
  for (const target of [{ x: 850, y: 430 }, { x: 150, y: 430 }, { x: 200, y: 90 }, { x: 205, y: 110 }, { x: 205, y: 112 }, { x: 800, y: 100 }]) {
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
console.log(`IK checks passed: ${frames} frames, ${plantedFrames} anchored foot frames, ${liftFrames} moving foot frames.`);
