/* ==========================================================================
   LEAF² ECOLOGY
   RETROGRADE HUNGER — HEART · POWER · ICE
   SCAVENGER'S HEM — LOVE · POWER

   This is the isolated Leaf² edition of the two compounds. It preserves the
   original conditions and decomposition law, but makes the conditions readable,
   exposes live state to the Leaf² sidebar, and lets exceptional stellar classes
   contribute directly to pressure.
   ========================================================================== */
(function(){
'use strict';

const eater={on:false,x:0,y:0,vx:0,vy:0,age:0,life:0,cool:0,turn:0,eaten:0,dying:0,trail:[],targetClass:''};
const scav={on:false,x:0,y:0,vx:0,vy:0,age:0,life:0,cool:0,dying:0,gathered:0,garment:[],target:null,trail:[]};
const num=(n,d=0)=>Number.isFinite(n)?n:d;
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const span=(a,b)=>rand(a,b);
const worldDt=()=>{try{return globalThis.LEAF_PACE?LEAF_PACE.step():Math.max(.1,num(pace,1))}catch(_){return 1}};

function lawful(o){
  try{return globalThis.LEAF_LAW&&LEAF_LAW.isEnabled()?LEAF_LAW.lawfulnessAt(o.x,o.y)||0:0}catch(_){return 0}
}
function move(o,t,acc,max){
  const total=worldDt(),steps=Math.max(1,Math.ceil(total/4)),h=total/steps;
  for(let z=0;z<steps;z++){
    if(t){const dx=t.x-o.x,dy=t.y-o.y,d=Math.hypot(dx,dy)||1;o.vx+=dx/d*acc*h;o.vy+=dy/d*acc*h}
    const law=lawful(o),speed=Math.hypot(o.vx,o.vy);
    if(law>.18&&speed>.001){
      const n=law>.68?12:8,u=TAU/n,a=Math.atan2(o.vy,o.vx),q=Math.round(a/u)*u;
      const k=1-Math.pow(1-(.025+law*.07),h);
      o.vx+=(Math.cos(q)*speed-o.vx)*k;o.vy+=(Math.sin(q)*speed-o.vy)*k;
    }
    o.vx*=Math.pow(.972,h);o.vy*=Math.pow(.972,h);
    const s=Math.hypot(o.vx,o.vy);if(s>max){o.vx*=max/s;o.vy*=max/s}
    o.x=cap(o.x+o.vx*h,-90,W+90);o.y=cap(o.y+o.vy*h,-90,H+90);
  }
}
function trail(o,n){o.trail.push({x:o.x,y:o.y});if(o.trail.length>n)o.trail.shift()}

function starWeight(s){
  const cls=s&&s._l2type;
  const classWeight=cls==='blue'?2.1:cls==='white'?1.35:cls==='remnant'?1.15:1;
  return Math.max(.2,num(s&&s.sz,.7))*Math.max(.4,num(s&&s.mass,1))*classWeight;
}
function giants(){
  try{return stars.filter(s=>num(s.sz)>=1.55||s._l2type==='blue').sort((a,b)=>starWeight(b)-starWeight(a))}catch(_){return[]}
}
function pressure(){let q=0;for(const s of giants())q+=Math.max(0,starWeight(s)-1.1);return q}

function spawnEater(s){
  eater.on=true;eater.age=0;eater.life=span(15000,26000);eater.dying=0;eater.turn=0;eater.eaten=0;eater.trail=[];
  eater.targetClass=s&&s._l2type||'giant';
  const left=s.x>W/2;eater.x=left?-58:W+58;eater.y=cap(s.y+rand(-120,120),40,H-40);eater.vx=left?.18:-.18;eater.vy=0;
  try{if(globalThis.LEAF_CHRONICLE)LEAF_CHRONICLE.record('ecology','retrograde hunger enters','#ff00ff',{importance:3,plate:true})}catch(_){}
}
function eaterTarget(){
  const g=giants();if(g.length)return g[0];
  let b=null,v=-1;try{for(const s of stars){const q=starWeight(s);if(q>v){v=q;b=s}}}catch(_){}
  return b;
}
function iceAt(x,y,n){
  try{
    const t=pTemple();let made=0;
    for(let k=0;k<n*6&&made<n;k++){
      const a=rand(0,TAU),r=rand(10,48),nx=x-t[0]+Math.cos(a)*r,ny=y-t[1]+Math.sin(a)*r;
      if(seatFree(nx,ny,105)){addLawPoint(nx,ny,'ice');emitGlints(x,y,t[0],t[1],2);made++}
    }
    return made;
  }catch(_){return 0}
}
function eat(s){
  const i=stars.indexOf(s);if(i<0)return;
  const mass=Math.max(.5,num(s.mass,1)),size=Math.max(.4,num(s.sz,1)),x=s.x,y=s.y;
  stars.splice(i,1);
  eater.turn+=mass*(.78+size*.34);eater.eaten++;eater.targetClass=s._l2type||'star';
  try{
    addElementImpact('star',x,y,Math.min(1.9,.65+size*.4));
    addElementImpact('power',eater.x,eater.y,Math.min(1.5,.5+mass*.2));
    if(globalThis.LEAF_GENEALOGY&&eater.eaten===1)LEAF_GENEALOGY.remember('retrograde-hunger',{label:'a great star is eaten',color:'#ff00ff',parent:'stars-kindled'});
    if(globalThis.LEAF_CHRONICLE)LEAF_CHRONICLE.record('ecology','a '+eater.targetClass+' star is eaten','#ff00ff',{importance:eater.eaten===1?3:2,plate:eater.eaten===1});
  }catch(_){}
}
function updateEater(){
  const d=worldDt();if(eater.cool>0)eater.cool=Math.max(0,eater.cool-d);
  if(!eater.on){
    const g=giants();
    if(eater.cool<=0&&g.length>=2&&pressure()>1.85&&temple.iceCount>=6&&every(1800,317)&&Math.random()<.74)spawnEater(g[0]);
    return;
  }
  eater.age+=d;
  if(eater.dying){
    eater.dying-=d;
    if(eater.dying<=0){
      try{decompose(eater.x,eater.y,['red','pink','blue'],1.35)}catch(_){}
      eater.on=false;eater.cool=span(26000,45000);eater.turn=0;eater.trail=[];
      try{if(globalThis.LEAF_CHRONICLE)LEAF_CHRONICLE.record('ecology','retrograde hunger passes','#ff00ff',{importance:2})}catch(_){}
    }
    return;
  }
  const s=eaterTarget();
  if(s){move(eater,s,.019,1.12);if(Math.hypot(s.x-eater.x,s.y-eater.y)<20+num(s.sz,1)*5.2)eat(s)}
  else{const t=pTemple();move(eater,{x:t[0],y:t[1]},.006,.65)}
  trail(eater,42);
  while(eater.turn>=2.05){const n=iceAt(eater.x,eater.y,5);eater.turn-=n?2.05:.3;if(!n)break}
  if(eater.age>eater.life||(eater.eaten&&pressure()<.55&&eater.turn<.8))eater.dying=span(520,760);
}
function drawEater(){
  if(!eater.on)return;
  const a=eater.dying?cap(eater.dying/650,0,1):Math.min(1,eater.age/180);
  X.save();X.globalCompositeOperation='lighter';X.lineCap='round';
  for(let i=1;i<eater.trail.length;i++){
    const p=eater.trail[i-1],q=eater.trail[i],f=i/eater.trail.length;
    X.strokeStyle=`rgba(255,25,230,${(.025+f*.2)*a})`;X.lineWidth=.45+f*1.2;
    X.beginPath();X.moveTo(p.x,p.y);X.lineTo(q.x,q.y);X.stroke();
  }
  for(let k=0;k<4;k++){
    const r=20+k*11+Math.sin(tick*.035+k*2)*3+eater.turn*.45;
    X.strokeStyle=`rgba(255,0,255,${(.17+k*.045)*a})`;X.lineWidth=.8+k*.12;
    X.beginPath();X.arc(eater.x,eater.y,r,tick*(.021+k*.002)+k,tick*(.021+k*.002)+k+4.65);X.stroke();
  }
  for(let k=0;k<3;k++){
    const r=47+k*12+Math.sin(tick*.019+k*2)*4;
    X.strokeStyle=`rgba(145,245,255,${(.11+k*.035)*a})`;
    X.beginPath();X.arc(eater.x,eater.y,r,-tick*.009+k,-tick*.009+k+5.05);X.stroke();
  }
  const g=X.createRadialGradient(eater.x,eater.y,0,eater.x,eater.y,46);
  g.addColorStop(0,`rgba(255,55,30,${.92*a})`);g.addColorStop(.28,`rgba(255,0,165,${.42*a})`);g.addColorStop(.62,`rgba(30,80,255,${.15*a})`);g.addColorStop(1,'rgba(0,200,255,0)');
  X.fillStyle=g;X.beginPath();X.arc(eater.x,eater.y,46,0,TAU);X.fill();
  X.fillStyle=`rgba(0,0,0,${.82*a})`;X.beginPath();X.arc(eater.x,eater.y,8+eater.turn*.18,0,TAU);X.fill();
  X.restore();
}

function residue(){
  try{return magentas.length+heart.sparks.reduce((n,s)=>n+(!s.cap&&num(s.age)>num(s.life,1)*.58?.6:0),0)}catch(_){return 0}
}
function spawnScav(){
  scav.on=true;scav.age=0;scav.life=span(18000,30000);scav.dying=0;scav.gathered=0;scav.garment=[];scav.target=null;scav.trail=[];
  scav.x=num(love.x,W/2);scav.y=num(love.y,H/2);scav.vx=rand(-.2,.2);scav.vy=rand(-.2,.2);
  try{if(globalThis.LEAF_CHRONICLE)LEAF_CHRONICLE.record('ecology',"scavenger's hem enters",'#00ff00',{importance:3,plate:true})}catch(_){}
}
function valid(t){if(!t)return false;try{return(t.kind==='pink'?magentas:heart.sparks)[t.index]===t.object}catch(_){return false}}
function chooseResidue(){
  let b=null,v=Infinity;
  try{
    for(let i=0;i<magentas.length;i++){const o=magentas[i],q=Math.hypot(o.x-scav.x,o.y-scav.y)*.58+num(o.age)*.04;if(q<v){v=q;b={kind:'pink',index:i,object:o}}}
    for(let i=0;i<heart.sparks.length;i++){const o=heart.sparks[i];if(o.cap||num(o.age)<num(o.life,1)*.58)continue;const q=Math.hypot(o.x-scav.x,o.y-scav.y)+72;if(q<v){v=q;b={kind:'red',index:i,object:o}}}
  }catch(_){}
  return b;
}
function compost(item){
  try{
    const a=rand(0,TAU),l=rand(6,18);
    PX.save();PX.lineCap='round';PX.strokeStyle=item.kind==='red'?'rgba(65,255,110,.105)':'rgba(255,0,255,.095)';PX.lineWidth=rand(.55,1.35);
    PX.beginPath();PX.moveTo(scav.x,scav.y);PX.quadraticCurveTo(scav.x+Math.cos(a+.7)*l*.55,scav.y+Math.sin(a+.7)*l*.55,scav.x+Math.cos(a)*l,scav.y+Math.sin(a)*l);PX.stroke();PX.restore();
  }catch(_){}
}
function gather(t){
  if(!valid(t))return;
  const list=t.kind==='pink'?magentas:heart.sparks,o=t.object;list.splice(t.index,1);
  scav.garment.push({kind:t.kind,phase:rand(0,TAU),radius:rand(18,38),speed:rand(.0035,.012)*(Math.random()<.5?-1:1),tier:Math.floor(scav.gathered/9)});scav.gathered++;
  if(scav.garment.length>30)compost(scav.garment.shift());
  try{addElementImpact(t.kind==='red'?'heart':'power',o.x,o.y,.26);if(globalThis.LEAF_GENEALOGY&&scav.gathered===1)LEAF_GENEALOGY.remember('scavengers-hem',{label:'residue enters a hem',color:'#00ff00',parent:'love-wears-law'})}catch(_){}
}
function updateScav(){
  const d=worldDt();if(scav.cool>0)scav.cool=Math.max(0,scav.cool-d);
  if(!scav.on){if(scav.cool<=0&&residue()>20&&every(1600,419)&&Math.random()<.76)spawnScav();return}
  scav.age+=d;
  if(scav.dying){
    scav.dying-=d;
    if(scav.dying<=0){
      for(const i of scav.garment)compost(i);try{decompose(scav.x,scav.y,['green','pink'],1.1)}catch(_){}
      scav.on=false;scav.cool=span(18000,34000);scav.garment=[];scav.target=null;scav.trail=[];
      try{if(globalThis.LEAF_CHRONICLE)LEAF_CHRONICLE.record('ecology',"scavenger's hem passes",'#00ff00',{importance:2})}catch(_){}
    }
    return;
  }
  if(!valid(scav.target)||every(72,901))scav.target=chooseResidue();
  const t=scav.target;
  if(t){move(scav,t.object,.014,.82);if(Math.hypot(t.object.x-scav.x,t.object.y-scav.y)<13){gather(t);scav.target=null}}
  else{const a=tick*.003+Math.sin(tick*.0007);move(scav,{x:num(love.x,W/2)+Math.cos(a)*118,y:num(love.y,H/2)+Math.sin(a*1.3)*86},.0042,.48)}
  trail(scav,34);
  if(scav.age>scav.life||(scav.gathered>10&&residue()<7&&scav.age>scav.life*.35))scav.dying=span(420,620);
}
function drawScav(){
  if(!scav.on)return;
  const a=scav.dying?cap(scav.dying/540,0,1):Math.min(1,scav.age/150);
  X.save();X.globalCompositeOperation='lighter';X.lineCap='round';
  for(let i=1;i<scav.trail.length;i++){
    const p=scav.trail[i-1],q=scav.trail[i],f=i/scav.trail.length;
    X.strokeStyle=`rgba(60,255,110,${(.018+f*.12)*a})`;X.lineWidth=.55+f*.35;X.beginPath();X.moveTo(p.x,p.y);X.lineTo(q.x,q.y);X.stroke();
  }
  if(valid(scav.target)){X.strokeStyle=`rgba(100,255,145,${.17*a})`;X.setLineDash([2,8]);X.beginPath();X.moveTo(scav.x,scav.y);X.lineTo(scav.target.object.x,scav.target.object.y);X.stroke();X.setLineDash([])}
  for(let i=0;i<scav.garment.length;i++){
    const o=scav.garment[i],p=o.phase+tick*o.speed,r=o.radius+o.tier*5,x=scav.x+Math.cos(p)*r,y=scav.y+11+o.tier*6+Math.sin(p)*r*.42;
    X.fillStyle=o.kind==='red'?`rgba(255,55,35,${.62*a})`:`rgba(255,0,255,${.62*a})`;X.beginPath();X.arc(x,y,1.6+(i%5===0?.9:0),0,TAU);X.fill();
    if(i>0&&i%7===0){X.strokeStyle=`rgba(70,255,120,${.10*a})`;X.beginPath();X.moveTo(scav.x,y-3);X.lineTo(x,y);X.stroke()}
  }
  const g=X.createRadialGradient(scav.x,scav.y,0,scav.x,scav.y,38);g.addColorStop(0,`rgba(80,255,125,${.82*a})`);g.addColorStop(.42,`rgba(0,255,70,${.21*a})`);g.addColorStop(1,'rgba(0,255,0,0)');
  X.fillStyle=g;X.beginPath();X.arc(scav.x,scav.y,38,0,TAU);X.fill();X.strokeStyle=`rgba(255,0,255,${.54*a})`;X.lineWidth=1.1;X.beginPath();X.arc(scav.x,scav.y,11,-.92,.92);X.stroke();X.restore();
}

function clear(){
  Object.assign(eater,{on:false,x:0,y:0,vx:0,vy:0,age:0,life:0,cool:0,turn:0,eaten:0,dying:0,trail:[],targetClass:''});
  Object.assign(scav,{on:false,x:0,y:0,vx:0,vy:0,age:0,life:0,cool:0,dying:0,gathered:0,garment:[],target:null,trail:[]});
}
function copyInto(t,s){if(!s)return;for(const k of Object.keys(t))if(k!=='target'&&s[k]!==undefined)t[k]=s[k];t.target=null;if(!Array.isArray(t.trail))t.trail=[];if(t.garment&&!Array.isArray(t.garment))t.garment=[]}
const oldFrame=frame;frame=function(){oldFrame();updateEater();updateScav();drawEater();drawScav()};
const oldSnapshot=snapshot;snapshot=function(){const d=JSON.parse(oldSnapshot());d.newGoddesses={eater:JSON.parse(JSON.stringify(eater)),scavenger:{...JSON.parse(JSON.stringify(scav)),target:null}};return JSON.stringify(d)};
const oldRestore=restore;restore=function(json){let s=null;try{s=JSON.parse(json).newGoddesses}catch(_){}const ok=oldRestore(json);if(!ok)return false;clear();if(s){copyInto(eater,s.eater);copyInto(scav,s.scavenger)}return true};
const oldReset=resetWorld;resetWorld=function(){const r=oldReset();clear();return r};

try{
  const boot=JSON.parse(localStorage.getItem(typeof SAVE_KEY==='string'?SAVE_KEY:'leaf_save_v1')||'null');
  if(boot&&boot.newGoddesses){clear();copyInto(eater,boot.newGoddesses.eater);copyInto(scav,boot.newGoddesses.scavenger)}
}catch(_){}

globalThis.LEAF_NEW_GODDESSES={
  hungerName:'Retrograde Hunger',scavengerName:"Scavenger's Hem",pressure,
  eater:()=>({on:eater.on,x:eater.x,y:eater.y,eaten:eater.eaten,turn:eater.turn,age:eater.age,life:eater.life,cool:eater.cool,targetClass:eater.targetClass}),
  scavenger:()=>({on:scav.on,x:scav.x,y:scav.y,gathered:scav.gathered,garment:scav.garment.length,age:scav.age,life:scav.life,cool:scav.cool})
};
})();
