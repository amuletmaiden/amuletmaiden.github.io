(() => {
"use strict";
const $=id=>document.getElementById(id);
const canvas=$("world"),ctx=canvas.getContext("2d",{alpha:false});

const axioms={
 distinction:{text:"The ground cuts itself into <em>this</em> and <em>not-this</em>. Identity is the first violence.",record:"The ground acquired an inside and an outside."},
 relation:{text:"No isolated term comes first. Two poles arise together because each is intelligible only through the other.",record:"A relation appeared before anything capable of owning it."},
 plenitude:{text:"Every coherent difference is admitted. Actuality is whatever survives incompatibility.",record:"Possibility exceeded actuality."},
 recurrence:{text:"The first fact is a return. Repetition precedes the straight line later called time.",record:"The beginning occurred again."},
 brute:{text:"A determinate difference simply obtains. Explanation starts one floor above the foundation.",record:"Something was the case without permission."}
};
const phases=[
 ["Uncommitted ground","No sequence, object, interval, or location has yet been licensed."],
 ["Distinction","Identity now exists by contrast. Nothing material has appeared."],
 ["Relation","Differences constrain one another. Adjacency means dependence, not distance."],
 ["Constraint","Repeated relations have hardened into rules governing later events."],
 ["Derived space","Stable relational distance now behaves like a geometry."],
 ["Persistence","Closed organizations repair or repeat themselves. Objecthood has begun."],
 ["Reflection","A persistent organization encodes conditions beyond its own boundary."],
 ["Cosmos","The experiment contains law, history, objects, geometry, and partial self-knowledge."]
];
const specs=[
 ["pressure","Differentiation",62],["consistency","Consistency",78],["symmetry","Symmetry",53],
 ["memory","Memory",71],["recursion","Recursion",58],["selection","Selection",46]
];
$("dials").innerHTML=specs.map(([id,label,value])=>`
<div class="dial"><div class="dial-head"><label for="${id}">${label}</label><output id="${id}N">${value}</output></div>
<input id="${id}" type="range" min="0" max="100" value="${value}"></div>`).join("");
$("emergence").innerHTML=["time","space","law","matter","mind"].map(name=>`
<div class="em-row"><span>${name}</span><div class="track"><i id="bar${cap(name)}"></i></div><div class="pct" id="pct${cap(name)}">0</div></div>`).join("");

const controls=specs.map(x=>x[0]);
controls.forEach(id=>$(id).addEventListener("input",()=>$(id+"N").textContent=$(id).value));
$("origin").addEventListener("change",setAxiom);
function cap(s){return s[0].toUpperCase()+s.slice(1)}
function setAxiom(){$("axiomText").innerHTML=axioms[$("origin").value].text}
setAxiom();

let W=0,H=0,dpr=1;
function resize(){
 const r=canvas.getBoundingClientRect();
 W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(2,devicePixelRatio||1);
 canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener("resize",resize);resize();

let nodes=[],edges=[],forms=[],observers=[],records=[];
let contradictions=0,tick=0,phase=0,started=false,running=false,last=performance.now(),bank=0;
let emergence={time:0,space:0,law:0,matter:0,mind:0};

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const randomOf=a=>a[Math.floor(Math.random()*a.length)];
const params=()=>Object.fromEntries(controls.map(id=>[id,Number($(id).value)/100]));

function node(x,y,polarity=1){
 const n={x,y,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,polarity,age:0,stability:.12+Math.random()*.26,memory:0,model:0};
 nodes.push(n);return n;
}
function edge(a,b,strength=.2,type="relation"){
 if(!a||!b||a===b)return null;
 const old=edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
 if(old){old.strength=clamp(old.strength+.065);old.repetitions++;return old}
 const e={a,b,strength,type,age:0,repetitions:0,law:false};edges.push(e);return e;
}
function neighbors(n){return edges.filter(e=>e.a===n||e.b===n).map(e=>e.a===n?e.b:e.a)}
function record(text,tag="event"){
 records.unshift({tick,text,tag});records=records.slice(0,11);
 $("log").innerHTML=records.map(r=>`<div class="entry"><span class="tag">${r.tag}</span><time>${String(r.tick).padStart(4,"0")}</time><br>${r.text}</div>`).join("");
}

function begin(){
 if(started){running=true;buttonRunning();return}
 started=true;running=true;
 const cx=W/2,cy=H/2,mode=$("origin").value;
 if(mode==="distinction"){
  const a=node(cx-31,cy,1),b=node(cx+31,cy,-1);edge(a,b,.74,"opposition");
 }else if(mode==="relation"){
  const a=node(cx-39,cy,-1),b=node(cx+39,cy,1);a.stability=b.stability=.5;edge(a,b,.88,"necessary");
 }else if(mode==="plenitude"){
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2;node(cx+Math.cos(a)*64,cy+Math.sin(a)*64,i%2?1:-1)}
  nodes.forEach((n,i)=>edge(n,nodes[(i+1)%nodes.length],.17,"possible"));
 }else if(mode==="recurrence"){
  const ring=[];for(let i=0;i<6;i++){const a=i/6*Math.PI*2-Math.PI/2;ring.push(node(cx+Math.cos(a)*49,cy+Math.sin(a)*49,i%2?1:-1))}
  ring.forEach((n,i)=>edge(n,ring[(i+1)%ring.length],.66,"recurrence"));
 }else{
  const n=node(cx+(Math.random()-.5)*90,cy+(Math.random()-.5)*90,Math.random()<.5?1:-1);n.stability=.72;
 }
 record(axioms[mode].record,"origin");buttonRunning();updateUI();
}
function buttonRunning(){
 $("begin").classList.add("running");$("begin").textContent="Reality proceeds";$("pause").textContent="Suspend";
}
function reset(){
 nodes=[];edges=[];forms=[];observers=[];records=[];contradictions=0;tick=0;phase=0;started=false;running=false;
 emergence={time:0,space:0,law:0,matter:0,mind:0};
 $("begin").classList.remove("running");$("begin").textContent="Commit reality";$("pause").textContent="Suspend";$("log").innerHTML="";updateUI();
}
function mutate(){
 controls.forEach(id=>{const v=16+Math.floor(Math.random()*78);$(id).value=v;$(id+"N").textContent=v});
 $("origin").value=randomOf(Object.keys(axioms));setAxiom();reset();
}

function act(){
 if(!started)begin();
 tick++;const p=params();
 nodes.forEach(n=>{n.age++;n.memory*=.995;n.model*=.997});edges.forEach(e=>e.age++);

 if(nodes.length<190&&Math.random()<.07+p.pressure*.29){
  const parent=randomOf(nodes),a=Math.random()*Math.PI*2,r=22+Math.random()*34;
  const child=node(parent.x+Math.cos(a)*r,parent.y+Math.sin(a)*r,-parent.polarity);
  child.stability=parent.stability*.48+.08;edge(parent,child,.16+p.symmetry*.2,"difference");
 }
 if(nodes.length>2&&Math.random()<p.symmetry*.23){
  const a=randomOf(nodes),possible=nodes.filter(n=>n!==a&&n.polarity!==a.polarity);
  if(possible.length)edge(a,randomOf(possible),.14+p.symmetry*.24,"symmetry");
 }
 if(nodes.length>4&&Math.random()<p.recursion*.3){
  const a=randomOf(nodes),first=neighbors(a);
  if(first.length){const second=neighbors(randomOf(first)).filter(n=>n!==a);if(second.length)edge(a,randomOf(second),.11+p.recursion*.2,"recursive")}
 }
 if(edges.length&&Math.random()<(1-p.consistency)*.32){
  contradictions++;const e=randomOf(edges);e.strength*=.54;e.type="conflict";
 }
 edges.forEach(e=>{
  const accord=e.a.polarity!==e.b.polarity?.011:-.004;
  e.strength=clamp(e.strength+p.memory*(accord+e.strength*.007)-(1-p.memory)*.003);
  e.a.memory+=e.strength*.0024;e.b.memory+=e.strength*.0024;
  if(!e.law&&e.age>30&&e.strength>.57){
   e.law=true;if(edges.filter(x=>x.law).length===1)record("A repeated relation began constraining relations not yet made.","law");
  }
 });
 if(nodes.length>9&&Math.random()<p.selection*.17){
  const weak=nodes.filter(n=>n.age>24&&n.stability+n.memory<.25);
  if(weak.length){const doomed=randomOf(weak);edges=edges.filter(e=>e.a!==doomed&&e.b!==doomed);nodes=nodes.filter(n=>n!==doomed)}
 }
 nodes.forEach(n=>{
  const support=edges.filter(e=>e.a===n||e.b===n).reduce((s,e)=>s+e.strength,0);
  n.stability=clamp(n.stability*.993+support*.00155+p.memory*.0014);
 });
 if(tick%17===0&&edges.some(e=>e.law))detectForms();
 if(forms.length&&p.recursion>.37&&tick%24===0)detectObservers(p);
 move();derive();choosePhase();updateUI();
}
function detectForms(){
 const strong=nodes.filter(n=>n.stability>.47&&n.age>34);
 for(const n of strong){
  const near=edges.filter(e=>e.law&&(e.a===n||e.b===n)).map(e=>e.a===n?e.b:e.a);
  for(const a of near){
   const next=edges.filter(e=>e.law&&(e.a===a||e.b===a)).map(e=>e.a===a?e.b:e.a);
   const b=next.find(x=>x!==n&&edges.some(e=>e.law&&((e.a===x&&e.b===n)||(e.b===x&&e.a===n))));
   if(!b)continue;
   const f=[n,a,b];if(forms.some(old=>f.every(x=>old.includes(x))))continue;
   forms.push(f);f.forEach(x=>x.stability=clamp(x.stability+.11));
   if(forms.length===1)record("A closed organization survived replacement of its local states.","form");
  }
 }
 forms=forms.slice(0,28);
}
function detectObservers(p){
 for(const f of forms){
  if(observers.includes(f))continue;
  const internal=edges.filter(e=>f.includes(e.a)&&f.includes(e.b)).length;
  const external=edges.filter(e=>f.includes(e.a)!==f.includes(e.b)).length;
  if(internal*p.recursion*p.memory+external*p.consistency>7.2&&Math.random()<.22){
   observers.push(f);f.forEach(n=>n.model=.8);record("A persistent loop began carrying an abbreviated model of what lay beyond it.","mind");break;
  }
 }
}
function move(){
 const cx=W/2,cy=H/2;
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy+1;
  if(d2>16000)continue;const d=Math.sqrt(d2),f=25/d2;
  a.vx-=dx/d*f;a.vy-=dy/d*f;b.vx+=dx/d*f;b.vy+=dy/d*f;
 }
 edges.forEach(e=>{
  const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,d=Math.sqrt(dx*dx+dy*dy)||1,rest=25+(1-e.strength)*57,f=(d-rest)*(.00085+.0023*e.strength);
  e.a.vx+=dx/d*f;e.a.vy+=dy/d*f;e.b.vx-=dx/d*f;e.b.vy-=dy/d*f;
 });
 nodes.forEach(n=>{
  n.vx+=(cx-n.x)*.000045;n.vy+=(cy-n.y)*.000045;n.vx*=.942;n.vy*=.942;n.x+=n.vx;n.y+=n.vy;
  const m=28;if(n.x<m){n.x=m;n.vx=Math.abs(n.vx)}if(n.x>W-m){n.x=W-m;n.vx=-Math.abs(n.vx)}
  if(n.y<m){n.y=m;n.vy=Math.abs(n.vy)}if(n.y>H-m){n.y=H-m;n.vy=-Math.abs(n.vy)}
 });
}
function derive(){
 const laws=edges.filter(e=>e.law).length;
 emergence.time=clamp(tick/72)*100;emergence.law=clamp(laws/14)*100;
 emergence.space=clamp(edges.length/52+emergence.law/220)*100;
 emergence.matter=clamp(forms.length/11)*100;emergence.mind=clamp(observers.length/3)*100;
}
function choosePhase(){
 let next=started?1:0;
 if(edges.length>3)next=2;if(edges.some(e=>e.law))next=3;if(emergence.space>42)next=4;
 if(forms.length)next=5;if(observers.length)next=6;
 if(emergence.mind>65&&emergence.matter>65&&emergence.law>65)next=7;
 if(next!==phase){phase=next;if(phase>1)record(phases[phase][1],phases[phase][0])}
}
function interpretation(){
 if(!started)return"Calling the ground a thing would already be an illicit commitment.";
 if(phase===1)return"Identity has appeared as exclusion. This is not matter; it is merely the right to say that one state is not another.";
 if(phase===2)return"Terms acquire meaning from dependency. The display resembles space, but no spatial fact has yet been earned.";
 if(phase===3)return"The past has begun governing the future. Law is a relation made difficult to violate.";
 if(phase===4)return"Near and far have emerged from repeatable chains. Geometry is downstream from relation.";
 if(phase===5)return"The first object is not a substance. It is an organization that outlives changes in its local contents.";
 if(phase===6)return"A maintained organization now contains a selective echo of its exterior. An inside has become epistemic.";
 return"This cosmos is built from differences that remember, constrain, close, persist, and finally describe.";
}
function updateUI(){
 $("phase").textContent=phases[phase][0];$("phaseNote").textContent=phases[phase][1];$("ordinal").textContent=phase;
 $("stateWord").textContent=started?(running?"proceeding":"suspended"):"uncommitted";
 $("clock").textContent=started?String(tick).padStart(5,"0"):"—";
 $("geometryWord").textContent=emergence.space>42?"derived":"withheld";
 $("captionState").textContent=started?`${nodes.length} distinctions / ${edges.filter(e=>e.law).length} constraints`:"No commitments recorded.";
 $("nNodes").textContent=nodes.length;$("nEdges").textContent=edges.length;$("nLaws").textContent=edges.filter(e=>e.law).length;
 $("nForms").textContent=forms.length;$("nObservers").textContent=observers.length;$("nContradictions").textContent=contradictions;
 $("interpretation").textContent=interpretation();
 Object.entries(emergence).forEach(([name,value])=>{$("bar"+cap(name)).style.width=value+"%";$("pct"+cap(name)).textContent=Math.round(value)});
}
function centroid(a){return a.reduce((o,n)=>({x:o.x+n.x/a.length,y:o.y+n.y/a.length}),{x:0,y:0})}

function ground(t){
 ctx.fillStyle="#050708";ctx.fillRect(0,0,W,H);
 const cx=W/2,cy=H/2,pulse=50+Math.sin(t*.0017)*4;
 ctx.save();ctx.translate(cx,cy);
 for(let ring=0;ring<4;ring++){
  ctx.strokeStyle=[ "rgba(0,200,255,.35)","rgba(255,59,212,.22)","rgba(255,48,48,.17)","rgba(255,255,255,.09)" ][ring];
  ctx.lineWidth=ring===0?1.2:.7;ctx.setLineDash(ring%2?[2,7]:[]);
  ctx.beginPath();ctx.arc(0,0,pulse+ring*19,0,Math.PI*2);ctx.stroke();
 }
 ctx.setLineDash([]);
 ctx.rotate(t*.00013);ctx.strokeStyle="rgba(82,255,134,.22)";
 for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*24,Math.sin(a)*24);ctx.lineTo(Math.cos(a)*112,Math.sin(a)*112);ctx.stroke()}
 ctx.rotate(-t*.00031);ctx.strokeStyle="rgba(255,48,48,.32)";
 ctx.beginPath();for(let i=0;i<3;i++){const a=i*Math.PI*2/3-Math.PI/2,x=Math.cos(a)*36,y=Math.sin(a)*36;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.stroke();
 ctx.restore();
 ctx.fillStyle="rgba(255,255,255,.48)";ctx.font="9px ui-monospace,monospace";ctx.textAlign="center";ctx.fillText("NO INTERNAL DIFFERENCE",cx,cy+145);
}
function draw(t){
 if(!started){ground(t);return}
 ctx.fillStyle="#050708";ctx.fillRect(0,0,W,H);
 if(emergence.space>8){
  const a=emergence.space/100*.085;ctx.strokeStyle=`rgba(0,200,255,${a})`;ctx.lineWidth=1;ctx.setLineDash([1,9]);
  const gap=45;for(let x=(W/2)%gap;x<W;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=(H/2)%gap;y<H;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.setLineDash([]);
 }
 forms.forEach((f,i)=>{
  const c=centroid(f),r=21+Math.sin(t*.002+i)*2;
  ctx.strokeStyle="rgba(82,255,134,.35)";ctx.lineWidth=.8;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 });
 edges.forEach(e=>{
  ctx.strokeStyle=e.type==="conflict"?`rgba(255,59,212,${.2+e.strength*.55})`:e.law?`rgba(255,48,48,${.23+e.strength*.65})`:`rgba(0,200,255,${.1+e.strength*.55})`;
  ctx.lineWidth=e.law?1.5:.8;if(e.type==="conflict")ctx.setLineDash([4,4]);
  const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,len=Math.sqrt(dx*dx+dy*dy)||1,mx=(e.a.x+e.b.x)/2,my=(e.a.y+e.b.y)/2,bend=e.a.polarity===e.b.polarity?11:-6;
  ctx.beginPath();ctx.moveTo(e.a.x,e.a.y);ctx.quadraticCurveTo(mx-dy/len*bend,my+dx/len*bend,e.b.x,e.b.y);ctx.stroke();ctx.setLineDash([]);
 });
 nodes.forEach(n=>{
  const observed=observers.some(f=>f.includes(n)),persistent=n.stability>.56,r=2.2+n.stability*3.5+(observed?1:0);
  if(observed){ctx.strokeStyle="rgba(255,255,255,.68)";ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(n.x,n.y,r+8,r+4,t*.0008,0,Math.PI*2);ctx.stroke()}
  ctx.fillStyle=observed?"#f5f7f8":persistent?"#52ff86":"#00c8ff";ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#050708";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(n.x-r*.45,n.y);ctx.lineTo(n.x+r*.45,n.y);
  if(n.polarity>0){ctx.moveTo(n.x,n.y-r*.45);ctx.lineTo(n.x,n.y+r*.45)}ctx.stroke();
 });
}
function frame(now){
 const dt=Math.min(45,now-last);last=now;bank+=dt;
 if(running&&bank>=76){const count=Math.min(3,Math.floor(bank/76));for(let i=0;i<count;i++)act();bank%=76}
 draw(now);requestAnimationFrame(frame);
}

$("begin").addEventListener("click",begin);
$("pause").addEventListener("click",()=>{if(!started)return;running=!running;$("pause").textContent=running?"Suspend":"Resume";updateUI()});
$("step").addEventListener("click",()=>{running=false;$("pause").textContent="Resume";act()});
$("mutate").addEventListener("click",mutate);
$("reset").addEventListener("click",reset);
reset();requestAnimationFrame(frame);
})();