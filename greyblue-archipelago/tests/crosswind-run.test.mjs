import assert from "node:assert/strict";
import { CrosswindRun } from "../src/flight/crosswind-run.js";

const base = { ready:true, paused:false, airborne:true, landing:false, stalled:false, grounded:false, recovering:false, crossing:false };
const tick = (run, x, direction="cross-left", extra={}) => run.update({ ...base, ...extra, currentDirection:direction, position:{x,z:0} });

{
  const run = new CrosswindRun({ requiredTravel:40, minStep:4, maxStep:50 });
  assert.equal(tick(run,0).phase,"catch");
  tick(run,10); tick(run,20); tick(run,30); tick(run,40);
  assert.equal(run.publicState().phase,"hold");
  const done=tick(run,45,"withwind");
  assert.deepEqual(done,{available:true,active:false,phase:"release",completed:true});
  assert.deepEqual(Object.keys(done),["available","active","phase","completed"]);
}
{
  const run=new CrosswindRun({requiredTravel:40,minStep:4,maxStep:50});
  tick(run,0); tick(run,1); tick(run,2); tick(run,3);
  assert.equal(tick(run,4,"withwind").completed,false);
}
{
  const run=new CrosswindRun({requiredTravel:40,minStep:4,maxStep:50});
  tick(run,0); assert.equal(tick(run,100).active,false);
}
{
  const run=new CrosswindRun();
  tick(run,0,"cross-left");
  const switched=tick(run,10,"cross-right");
  assert.equal(switched.phase,"catch"); assert.equal(switched.active,true);
}
{
  const run=new CrosswindRun();
  tick(run,0); assert.equal(tick(run,10,"cross-left",{paused:true}).active,false);
  assert.equal(run.update({...base,currentDirection:"cross-left",position:{x:NaN,z:0}}).active,false);
}
{
  const run=new CrosswindRun();
  const input={...base,currentDirection:"cross-left",position:{x:0,z:0}};
  const before=JSON.stringify(input); run.update(input); assert.equal(JSON.stringify(input),before);
}
console.log("crosswind-run regressions passed");
