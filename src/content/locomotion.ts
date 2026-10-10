import type { Point } from './links';

export const LEG_LENGTHS = [
  { upper: 35, lower: 43 }, { upper: 40, lower: 46 },
  { upper: 40, lower: 46 }, { upper: 35, lower: 43 },
];
const lateral = [40, 52, 52, 40];
const longitudinal = [-42, -16, 19, 43];
const strideTravel = 22;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Intersection of two circles. Endpoints stay at their real positions; callers
// constrain the body's movement so no planted foot has to slide to satisfy IK.
export function solveKnee(hip: Point, foot: Point, upper: number, lower: number, bend: number): Point {
  const d = distance(hip, foot);
  const safe = clamp(d, Math.abs(upper - lower) + 0.001, upper + lower - 0.001);
  const ux = d > 0.001 ? (foot.x - hip.x) / d : 1;
  const uy = d > 0.001 ? (foot.y - hip.y) / d : 0;
  const along = (upper * upper - lower * lower + safe * safe) / (2 * safe);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return { x: hip.x + ux * along - uy * height * bend, y: hip.y + uy * along + ux * height * bend };
}

export interface LegPose {
  side: number;
  pair: number;
  group: number;
  hip: Point;
  knee: Point;
  foot: Point;
  upper: number;
  lower: number;
  maximum: number;
  comfortable: number;
  progress: number;
  from: Point;
  to: Point;
}

export function createLocomotion(position: Point) {
  let heading = 0;
  let turnVelocity = 0;
  let speed = 0;
  let travel = 0;
  let activeGroup = 0;
  let center = { ...position };
  let offset = { x: 0, y: 0 };
  const rotate = (local: Point, angle = heading): Point => ({
    x: local.x * Math.cos(angle) - local.y * Math.sin(angle),
    y: local.x * Math.sin(angle) + local.y * Math.cos(angle),
  });
  const world = (local: Point, origin = center, angle = heading): Point => {
    const r = rotate(local, angle);
    return { x: origin.x + r.x, y: origin.y + r.y };
  };
  const hipAt = (leg: Pick<LegPose, 'side' | 'pair'>, origin = center, angle = heading) =>
    world({ x: leg.side * 6, y: -12 + leg.pair * 8 }, origin, angle);
  const legs: LegPose[] = [-1, 1].flatMap(side => LEG_LENGTHS.map((lengths, pair) => {
    const foot = world({ x: side * lateral[pair], y: longitudinal[pair] });
    const hip = hipAt({ side, pair });
    const maximum = lengths.upper + lengths.lower - 0.5;
    return { side, pair, group: (pair + (side < 0 ? 1 : 0)) % 2, hip,
      knee: solveKnee(hip, foot, lengths.upper, lengths.lower, side * (pair < 2 ? 1 : -1)),
      foot, ...lengths, maximum, comfortable: maximum * 0.80,
      progress: 1, from: { ...foot }, to: { ...foot } };
  }));

  function home(leg: LegPose, turn: number): Point {
    // A turning body's outer legs reach a little further, its inner legs closer.
    const extra = clamp(turn * leg.side * 4, -5, 5);
    const planted = world({ x: leg.side * (lateral[leg.pair] + extra), y: longitudinal[leg.pair] });
    const forward = rotate({ x: 0, y: -16 });
    return { x: planted.x + forward.x, y: planted.y + forward.y };
  }

  function poseLegs() {
    for (const leg of legs) {
      leg.hip = hipAt(leg);
      leg.knee = solveKnee(leg.hip, leg.foot, leg.upper, leg.lower, leg.side * (leg.pair < 2 ? 1 : -1));
    }
  }

  return {
    legs,
    get center() { return center; },
    get heading() { return heading; },
    get speed() { return speed; },
    freeze() { speed = 0; turnVelocity = 0; },
    advance(destination: Point, dt: number) {
      const remaining = distance(position, destination);
      if (remaining <= 0.8) return true;
      const desired = Math.atan2(destination.y - position.y, destination.x - position.x) + Math.PI / 2;
      const error = angleDifference(desired, heading);
      const wantedTurn = clamp(error * 4, -1.8, 1.8);
      turnVelocity += clamp(wantedTurn - turnVelocity, -6 * dt, 6 * dt);
      const rotation = clamp(turnVelocity * dt, -Math.abs(error), Math.abs(error));
      const swinging = legs.filter(leg => leg.progress < 1);
      const swingPhase = swinging.length ? swinging.reduce((sum, leg) => sum + leg.progress, 0) / swinging.length : 1;
      // Weight transfer slows the body while feet lift, then restores propulsion.
      const pace = 0.78 + 0.22 * Math.cos(swingPhase * Math.PI * 2);
      const alignment = Math.pow(Math.max(0, Math.cos(error)), 2);
      const wantedSpeed = Math.min(108 * pace * alignment, Math.sqrt(2 * 125 * remaining));
      speed += clamp(wantedSpeed - speed, -220 * dt, 160 * dt);
      const step = Math.min(speed * dt, remaining);
      const nextHeading = heading + rotation;
      const course = nextHeading - Math.PI / 2 + Math.sin(travel / 35) * 0.025;
      const directWeight = clamp(1 - remaining / 45, 0, 1);
      const vx = Math.cos(course) * (1 - directWeight) + (destination.x - position.x) / remaining * directWeight;
      const vy = Math.sin(course) * (1 - directWeight) + (destination.y - position.y) / remaining * directWeight;
      const movement = Math.hypot(step * vx, step * vy) + Math.abs(rotation) * 26;
      const nextTravel = travel + movement;
      const localOffset = { x: Math.sin(nextTravel / strideTravel * Math.PI) * 1.1, y: Math.sin(nextTravel / strideTravel * Math.PI * 2) * 0.8 };
      const nextOffset = rotate(localOffset, nextHeading);
      const delta = { x: step * vx + nextOffset.x - offset.x, y: step * vy + nextOffset.y - offset.y };

      // Keep all feet reachable, including swinging feet. A safety constraint
      // reduces body travel instead of stretching bones or dragging support feet.
      let fraction = 1;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = { x: center.x + delta.x * fraction, y: center.y + delta.y * fraction };
        if (legs.every(leg => {
          const reach = distance(hipAt(leg, candidate, heading + rotation * fraction), leg.foot);
          return reach < leg.maximum && reach > Math.abs(leg.upper - leg.lower) + 1;
        })) break;
        fraction *= 0.5;
      }
      position.x += step * vx * fraction;
      position.y += step * vy * fraction;
      heading += rotation * fraction;
      offset = { x: offset.x + (nextOffset.x - offset.x) * fraction, y: offset.y + (nextOffset.y - offset.y) * fraction };
      center = { x: position.x + offset.x, y: position.y + offset.y };
      const actualTravel = movement * fraction;
      travel += actualTravel;

      for (const leg of swinging) {
        leg.progress = Math.min(1, leg.progress + actualTravel / strideTravel);
        const t = leg.progress * leg.progress * (3 - 2 * leg.progress);
        const lift = Math.sin(leg.progress * Math.PI) * 5;
        leg.foot = { x: leg.from.x + (leg.to.x - leg.from.x) * t,
          y: leg.from.y + (leg.to.y - leg.from.y) * t - lift };
        // A lifted foot may adjust its airborne path; a planted one never does.
        const hip = hipAt(leg);
        const reach = distance(hip, leg.foot);
        const safeReach = clamp(reach, Math.abs(leg.upper - leg.lower) + 1, leg.maximum - 0.2);
        if (reach !== safeReach) {
          leg.foot = { x: hip.x + (leg.foot.x - hip.x) / reach * safeReach,
            y: hip.y + (leg.foot.y - hip.y) / reach * safeReach };
        }
      }
      // Never lift the other group until every foot in this group has landed.
      if (!legs.some(leg => leg.progress < 1) && actualTravel > 0) {
        const needsStep = (leg: LegPose) => distance(hipAt(leg), leg.foot) > leg.comfortable ||
          distance(world({ x: leg.side * lateral[leg.pair], y: longitudinal[leg.pair] }), leg.foot) > 20;
        const preferred = legs.filter(leg => leg.group === activeGroup && needsStep(leg));
        const waiting = preferred.length ? preferred : legs.filter(leg => leg.group !== activeGroup && needsStep(leg));
        if (waiting.length) {
          const group = waiting[0].group;
          for (const leg of legs.filter(leg => leg.group === group)) {
            leg.from = { ...leg.foot };
            leg.to = home(leg, turnVelocity);
            leg.progress = 0;
          }
          activeGroup = 1 - group;
        }
      }
      poseLegs();
      return distance(position, destination) <= 0.8;
    },
  };
}
