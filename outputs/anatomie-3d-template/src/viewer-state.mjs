export const STAGES = Object.freeze([
  { label:'Corps entier', layers:['skin','skeleton'] },
  { label:'Structure osseuse', layers:['skeleton'] },
  { label:'Muscles et tendons', layers:['skeleton','muscles','tendons'] },
  { label:'Nerfs et circulation', layers:['skeleton','nerves','vessels'] }
]);

// Fit a bounding sphere using the smaller FOV: stable at every rotation/aspect.
export function fitDistance(radius, fovDegrees, aspect, margin=1.12) {
  const vertical = fovDegrees * Math.PI / 360;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(.05, aspect));
  return Math.max(.1,radius) * margin / Math.sin(Math.min(vertical,horizontal));
}
export function frameDelta(previous, now) {
  return previous === null ? 0 : Math.max(0,Math.min(.05,(now-previous)/1000));
}
export function advanceTour(elapsed, delta, speed, ready, duration=9) {
  const next = elapsed + (ready ? delta * speed : 0);
  return { elapsed:next >= duration ? 0 : next, advance:next >= duration };
}
export function isEffectivelyVisible(object) {
  for(let node=object;node;node=node.parent) if(!node.visible) return false;
  return true;
}
