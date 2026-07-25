/* ==========================================================================
   LEAF² — SECOND ECOLOGY

   Isolated experiment over the real Leaf engine:
   - spectral stellar classes, local stellar gravity, protostars, mergers,
     binaries, clusters, remnants and nebulae;
   - law districts as higher-order architecture;
   - ribboned, chargeable sight which may thaw, sear and transmute;
   - yellow mind-skirts grown from the Legislative Ladder;
   - gyre silk rendered through a measured half-resolution persistence layer.

   Main Leaf is not loaded with this file. Leaf² uses a separate storage namespace.
   ========================================================================== */
(function(){
'use strict';
if(globalThis.LEAF2)return;

const C={
  red:'#ff0000',green:'#00ff00',pink:'#ff00ff',blue:'#00c8ff',yellow:'#ffff00',
  ice:'#c8f7ff',white:'#efffff',amber:'#ffd26a',blueStar:'#75baff',redStar:'#ff6958',remnant:'#b9d8ff'
};
const settings={trails:true,burningSight:true,starGravity:true,lawArchitecture:true,mindSkirts:true};
const stats={
  frameMs:0,starUpdateMs:0,starDrawMs:0,gyreUpdateMs:0,trailBuildMs:0,trailCompositeMs:0,templeMs:0,
  sightCharge:0,stars:0,clusters:0,binaries:0,nebulae:0,lawDistricts:0,minds:0,starClasses:{}
};
const smooth=(old,value,k=.12)=>old+(value-old)*k;
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const worldDt=()=>{try{return globalThis.LEAF_PACE?LEAF_PACE.step():Math.max(.1,pace)}catch(_){return 1}};
const worldNow=()=>{try{return globalThis.LEAF_PACE?LEAF_PACE.worldClock():tick}catch(_){return tick||0}};
const rgba=(hex,a)=>{const h=hex.replace('#',''),r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return `rgba(${r},${g},${b},${a})`};
function hash(n){n=(n|0)+0x6D2B79F5;n=Math.imul(n^(n>>>15),1|n);n^=n+Math.imul(n^(n>>>7),61|n);return((n^(n>>>14))>>>0)/4294967296}
function starHash(s){return hash(((s.x*97)|0)^((s.y*193)|0)^((s.ph*100000)|0)^((s.mass*4096)|0))}
function glow(ctx,x,y,r,color,a,inner){if(!(r>0&&a>0))return;const g=ctx.createRadialGradient(x,y,inner||0,x,y,r);g.addColorStop(0,rgba(color,a));g.addColorStop(.38,rgba(color,a*.34));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
function ring(ctx,x,y,rx,ry,color,a,width,phase,segments){ctx.save();ctx.translate(x,y);ctx.rotate((phase||0)*.14);ctx.strokeStyle=rgba(color,a);ctx.lineWidth=width;ctx.lineCap='round';const n=segments||3;for(let i=0;i<n;i++){const q=(phase||0)+i*TAU/n;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,q,q+TAU/n*.63);ctx.stroke()}ctx.restore()}
function rolling(name,value,k=.12){stats[name]=smooth(stats[name]||0,value,k)}

let starSerial=1;
let starGrid=new Map(),clusters=[],binaries=[],nebulae=[],lawDistricts=[],lastStructureTick=-1,lastLawTick=-1;
const STAR_CELL=92;

function classFor(s){
  if(s._l2remnant)return'remnant';
  const m=Number.isFinite(s.mass)?s.mass:.5+(s.sz||1)*.9,sz=s.sz||1;
  if(sz>=2.05||m>=2.45)return'blue';
  if(sz>=1.35||m>=1.75)return'white';
  if(sz>=.78||m>=1.15)return'gold';
  return'red';
}
function ensureStar(s,newborn){
  if(!s||typeof s!=='object')return s;
  if(!s._l2id)s._l2id=starSerial++;
  if(!s._l2type)s._l2type=classFor(s);
  if(!Number.isFinite(s._l2age))s._l2age=newborn?0:starHash(s)*90000;
  if(!Number.isFinite(s._l2born))s._l2born=worldNow()-s._l2age;
  if(newborn&&!Number.isFinite(s._l2proto))s._l2proto=240+starHash(s)*520;
  if(!Number.isFinite(s._l2life)){
    const h=starHash(s);s._l2life=s._l2type==='blue'?110000+h*130000:s._l2type==='white'?520000+h*360000:1e12;
  }
  s._l2lum=s._l2type==='blue'?2.2:s._l2type==='white'?1.45:s._l2type==='gold'?1:s._l2type==='remnant'?.55:.42;
  return s;
}
for(const s of stars||[]){ensureStar(s,false);starSerial=Math.max(starSerial,(s._l2id||0)+1)}

const ancestralMakeStar=makeStar;
makeStar=function(x,y,vx,vy){return ensureStar(ancestralMakeStar(x,y,vx,vy),true)};

function gridKey(x,y){return((x/STAR_CELL)|0)+','+((y/STAR_CELL)|0)}
function buildStarGrid(){
  const map=new Map();
  for(const s of stars){
    ensureStar(s,false);const key=gridKey(s.x,s.y);let b=map.get(key);
    if(!b){b={list:[],mass:0,mx:0,my:0,count:0};map.set(key,b)}
    const m=Math.max(.2,s.mass||1);b.list.push(s);b.mass+=m;b.mx+=s.x*m;b.my+=s.y*m;b.count++;
  }
  for(const b of map.values())if(b.mass){b.mx/=b.mass;b.my/=b.mass}
  starGrid=map;return map;
}
function neighbourBuckets(x,y){const cx=(x/STAR_CELL)|0,cy=(y/STAR_CELL)|0,out=[];for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){const b=starGrid.get(gx+','+gy);if(b)out.push(b)}return out}
function pressureAt(x,y,ignore){let q=0;for(const b of neighbourBuckets(x,y))for(const s of b.list){if(s===ignore)continue;const d2=(s.x-x)**2+(s.y-y)**2;if(d2>90*90)continue;q+=(s.mass||1)*(1-Math.sqrt(d2)/90)}return q}
function nearestStar(s,limit){let best=null,bd=limit*limit;for(const b of neighbourBuckets(s.x,s.y))for(const q of b.list){if(q===s||q._l2proto>0)continue;const d=(q.x-s.x)**2+(q.y-s.y)**2;if(d<bd){bd=d;best=q}}return best}
function mergeInto(a,b){
  if(!a||!b||a===b)return false;const ia=stars.indexOf(a),ib=stars.indexOf(b);if(ia<0||ib<0)return false;
  const ma=Math.max(.2,a.mass||1),mb=Math.max(.2,b.mass||1),m=ma+mb;
  b.vx=((b.vx||0)*mb+(a.vx||0)*ma)/m;b.vy=((b.vy||0)*mb+(a.vy||0)*ma)/m;b.x=(b.x*mb+a.x*ma)/m;b.y=(b.y*mb+a.y*ma)/m;
  b.mass=Math.min(5.5,m);b.sz=Math.min(3.8,Math.sqrt((b.sz||1)**2+(a.sz||1)**2*.72));b._l2type=classFor(b);b._l2lum=null;ensureStar(b,false);
  stars.splice(ia,1);nebulae.push({x:b.x,y:b.y,r:10,age:0,life:900+hash(a._l2id^b._l2id)*1100,color:b._l2type==='blue'?C.blueStar:C.amber,spin:hash(a._l2id)*TAU});return true;
}
function supernova(s){
  const i=stars.indexOf(s);if(i<0)return;const x=s.x,y=s.y,m=s.mass||1;stars.splice(i,1);
  const rem=ensureStar(ancestralMakeStar(x,y,(s.vx||0)*.45,(s.vy||0)*.45),false);rem._l2remnant=true;rem._l2type='remnant';rem.mass=Math.max(.9,m*.62);rem.sz=cap((s.sz||1)*.42,.48,1.05);rem._l2age=0;rem._l2proto=0;ensureStar(rem,false);stars.push(rem);
  nebulae.push({x,y,r:16,age:0,life:5200+starHash(s)*4200,color:C.blueStar,spin:starHash(s)*TAU});
  for(const b of neighbourBuckets(x,y))for(const q of b.list){if(q===s)continue;const dx=q.x-x,dy=q.y-y,d=Math.hypot(dx,dy)||1;if(d>180)continue;const kick=(1-d/180)*.18;q.vx+=(dx/d)*kick;q.vy+=(dy/d)*kick}
  try{addElementImpact('star',x,y,1.8);if(globalThis.LEAF_CHRONICLE)LEAF_CHRONICLE.record('stellar','a blue giant leaves a remnant',C.blueStar,{importance:3,plate:true})}catch(_){}
}
function processStellarLife(){
  buildStarGrid();
  for(let i=stars.length-1;i>=0;i--){
    const s=stars[i];ensureStar(s,false);
    if(s._l2proto>0){s._l2proto-=worldDt();if(s._l2proto<=0){const p=pressureAt(s.x,s.y,s);if(p>5.4){const n=nearestStar(s,76);if(n)mergeInto(s,n);else s._l2proto=0}else s._l2proto=0}}
    if(s._l2type==='blue'&&s._l2age>s._l2life)supernova(s);
  }
}
function buildStructures(){
  const now=tick|0;if(now===lastStructureTick||now%75!==0)return;lastStructureTick=now;buildStarGrid();
  const next=[];
  for(const [key,b] of starGrid){
    if(b.count<4)continue;let spread=0,blue=0,gold=0;
    for(const s of b.list){spread+=Math.hypot(s.x-b.mx,s.y-b.my);if(s._l2type==='blue'||s._l2type==='white')blue++;if(s._l2type==='gold')gold++}
    next.push({key,x:b.mx,y:b.my,count:b.count,mass:b.mass,r:cap(18+spread/b.count*.7,22,76),color:blue>b.count*.35?C.blueStar:gold>b.count*.35?C.amber:C.ice});
  }
  next.sort((a,b)=>b.mass-a.mass);clusters=next.slice(0,160);
  const pairs=[],claimed=new Set();
  for(const b of starGrid.values()){
    if(b.list.length<2)continue;
    for(const s of b.list){
      if(claimed.has(s)||s._l2proto>0)continue;let best=null,bd=34*34;
      for(const q of b.list){if(q===s||claimed.has(q)||q._l2proto>0)continue;const d=(q.x-s.x)**2+(q.y-s.y)**2;if(d<bd){bd=d;best=q}}
      if(best){claimed.add(s);claimed.add(best);pairs.push({a:s,b:best})}if(pairs.length>=120)break;
    }
    if(pairs.length>=120)break;
  }
  binaries=pairs;
}
updateStars=function(hx,hy,tx,ty){
  const t0=performance.now(),dt=Math.max(.1,typeof mo==='function'?mo():worldDt()),map=buildStarGrid();
  const wells=[[hx,hy,26],[love.x,love.y,20],[tx,ty,24]];for(const G of gyres)wells.push([G.x,G.y,30*G.scale*Math.min(1.5,G.energy||1)]);
  for(const st of stars){
    ensureStar(st,false);st._l2age+=dt;let ax=0,ay=0;
    for(const w of wells){const dx=w[0]-st.x,dy=w[1]-st.y,d2=dx*dx+dy*dy;if(d2>1.2e6||d2<4)continue;const d=Math.sqrt(d2),f=w[2]*.010/Math.max(d2,900);ax+=dx/d*f*(st.mass||1);ay+=dy/d*f*(st.mass||1)}
    if(settings.starGravity){
      const cx=(st.x/STAR_CELL)|0,cy=(st.y/STAR_CELL)|0;
      for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){
        const b=map.get(gx+','+gy);if(!b||b.count===1&&b.list[0]===st)continue;const dx=b.mx-st.x,dy=b.my-st.y,d2=Math.max(700,dx*dx+dy*dy),d=Math.sqrt(d2);
        const other=Math.max(0,b.mass-(gx===cx&&gy===cy?st.mass||1:0));if(other<=0)continue;const f=.016*other/d2;ax+=dx/d*f;ay+=dy/d*f;
      }
    }
    st.vx=(st.vx||0)+ax*dt;st.vy=(st.vy||0)+ay*dt;const drag=Math.pow(st._l2type==='remnant'?.9998:.99955,dt);st.vx*=drag;st.vy*=drag;
    const limit=st._l2type==='blue'?1.05:st._l2type==='remnant'?.72:1.35,sp=Math.hypot(st.vx,st.vy);if(sp>limit){st.vx*=limit/sp;st.vy*=limit/sp}
    st.x+=st.vx*dt;st.y+=st.vy*dt;if(st.x<-8)st.x+=W+16;else if(st.x>W+8)st.x-=W+16;if(st.y<-8)st.y+=H+16;else if(st.y>H+8)st.y-=H+16;
  }
  if((tick|0)%18===0)processStellarLife();buildStructures();rolling('starUpdateMs',performance.now()-t0);
};

function starColor(s){return s._l2type==='blue'?C.blueStar:s._l2type==='white'?C.white:s._l2type==='gold'?C.amber:s._l2type==='remnant'?C.remnant:C.redStar}
function drawNebulae(){X.save();X.globalCompositeOperation='screen';for(const n of nebulae){const q=n.age/n.life,a=Math.max(0,(1-q)*.12),r=n.r*(1+q*4.2);glow(X,n.x,n.y,r,n.color,a,Math.max(1,r*.08));X.strokeStyle=rgba(n.color,a*.75);X.lineWidth=.6;X.beginPath();X.ellipse(n.x,n.y,r,r*(.48+.1*Math.sin(n.spin+q*8)),n.spin+q*.6,0,TAU);X.stroke()}X.restore()}
function drawClusters(){X.save();X.globalCompositeOperation='screen';for(const c of clusters){const a=cap(.018+Math.log2(c.count+1)*.006,.018,.055);X.strokeStyle=rgba(c.color,a);X.lineWidth=.65;X.beginPath();X.ellipse(c.x,c.y,c.r,c.r*.62,hash(c.count)*TAU,0,TAU);X.stroke();if(c.count>12)glow(X,c.x,c.y,c.r*1.2,c.color,a*.8,c.r*.18)}X.restore()}
function drawBinaries(){X.save();X.globalCompositeOperation='screen';X.lineWidth=.45;for(const p of binaries){const mx=(p.a.x+p.b.x)/2,my=(p.a.y+p.b.y)/2,d=Math.hypot(p.a.x-p.b.x,p.a.y-p.b.y);X.strokeStyle='rgba(225,245,255,.10)';X.beginPath();X.arc(mx,my,d*.56,Math.atan2(p.a.y-my,p.a.x-mx),Math.atan2(p.b.y-my,p.b.x-mx));X.stroke()}X.restore()}
drawStars=function(){
  const t0=performance.now();try{const [h1,h2]=pHeart(),[t1,t2]=pTemple(),[p1,p2]=pPower();drawStarstruck(h1,h2,t1,t2,p1,p2)}catch(_){}
  drawNebulae();drawClusters();drawBinaries();const counts={red:0,gold:0,white:0,blue:0,remnant:0,proto:0};X.save();X.globalCompositeOperation='lighter';
  for(const st of stars){
    ensureStar(st,false);const type=st._l2proto>0?'proto':st._l2type;counts[type]=(counts[type]||0)+1;const b=starGrid.get(gridKey(st.x,st.y)),density=b?b.count:1,densityFade=cap(1/Math.sqrt(1+density*.08),.25,1);
    const tw=.58+.42*Math.sin(tick*(st.sp||.03)+(st.ph||0)),col=starColor(st);
    if(type==='proto'){const r=5+(st.sz||1)*3;glow(X,st.x,st.y,r,col,.065*densityFade,0);X.fillStyle=rgba(col,.35*densityFade);X.beginPath();X.arc(st.x,st.y,.7+(st.sz||1)*.35,0,TAU);X.fill();continue}
    const size=(st.sz||1)*(.78+.22*tw)+.18;
    if(type==='remnant'){X.strokeStyle=rgba(col,.68*densityFade);X.lineWidth=.65;X.beginPath();X.arc(st.x,st.y,size*1.25,0,TAU);X.stroke();X.fillStyle=rgba(C.white,.72*densityFade);X.beginPath();X.arc(st.x,st.y,size*.42,0,TAU);X.fill();continue}
    X.fillStyle=rgba(col,(.58+.30*tw)*densityFade);X.beginPath();X.arc(st.x,st.y,size,0,TAU);X.fill();if((st.sz||1)>.92&&tw>.52){const hr=(st.sz||1)*(type==='blue'?4.2:3.1)+1.5;glow(X,st.x,st.y,hr,col,(type==='blue'?.20:.12)*tw*densityFade,.2)}
  }
  X.restore();stats.starClasses=counts;stats.stars=stars.length;stats.clusters=clusters.length;stats.binaries=binaries.length;stats.nebulae=nebulae.length;rolling('starDrawMs',performance.now()-t0);
};
function updateNebulae(){const d=worldDt();for(let i=nebulae.length-1;i>=0;i--){nebulae[i].age+=d;if(nebulae[i].age>nebulae[i].life)nebulae.splice(i,1)}}

function buildLawDistricts(){
  const now=tick|0;if(now===lastLawTick||now%90!==0)return;lastLawTick=now;const CELL=82,map=new Map();
  for(const p of temple.pts||[]){if(!p||p.hermetic||p.rot>0||p.set<.72)continue;const key=((p.x/CELL)|0)+','+((p.y/CELL)|0);let b=map.get(key);if(!b){b={x:0,y:0,n:0,ice:0,key};map.set(key,b)}b.x+=p.x;b.y+=p.y;b.n++;if(p.kind==='ice')b.ice++}
  const out=[];for(const b of map.values())if(b.n>=5){b.x/=b.n;b.y/=b.n;b.r=cap(24+b.n*2.2,30,75);b.iceFrac=b.ice/b.n;out.push(b)}out.sort((a,b)=>b.n-a.n);lawDistricts=out.slice(0,100);
}
function drawDistricts(tx,ty){
  if(!settings.lawArchitecture)return;buildLawDistricts();X.save();X.translate(tx,ty);X.globalCompositeOperation='screen';
  for(const d of lawDistricts){const col=d.iceFrac>.55?C.ice:C.blue,a=cap(.018+d.n*.0012,.022,.065),g=X.createRadialGradient(d.x,d.y,d.r*.12,d.x,d.y,d.r);g.addColorStop(0,rgba(col,a*.38));g.addColorStop(.72,rgba(col,a*.12));g.addColorStop(1,rgba(col,0));X.fillStyle=g;X.beginPath();X.ellipse(d.x,d.y,d.r,d.r*.66,hash(d.n)*TAU,0,TAU);X.fill();X.strokeStyle=rgba(col,a*1.35);X.lineWidth=.6;X.beginPath();X.ellipse(d.x,d.y,d.r,d.r*.66,hash(d.n)*TAU,0,TAU);X.stroke()}
  X.strokeStyle='rgba(90,180,255,.022)';X.lineWidth=.55;for(let i=0;i<lawDistricts.length;i++)for(let j=i+1;j<lawDistricts.length;j++){const a=lawDistricts[i],b=lawDistricts[j],d2=(a.x-b.x)**2+(a.y-b.y)**2;if(d2>150*150)continue;X.beginPath();X.moveTo(a.x,a.y);X.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-8,b.x,b.y);X.stroke()}
  X.restore();stats.lawDistricts=lawDistricts.length;
}
function drawMindSkirts(tx,ty){
  if(!settings.mindSkirts)return;let minds=0;X.save();X.globalCompositeOperation='lighter';X.lineCap='round';
  for(const e of embers||[]){
    if(!e||e.kind!=='goddess'||!e._leafMind||e._leafMind.stage<1)continue;minds++;
    const m=e._leafMind,stage=m.stage||0,s=e.scale||1,x=tx+e.x,y=ty+e.y-12*s,memories=Array.isArray(m.memories)?m.memories.length:0,count=cap(4+stage*3+memories,5,20),pts=[];
    for(let i=0;i<count;i++){const tier=i<7?0:i<14?1:2,slot=tier===0?i:tier===1?i-7:i-14,n=tier===0?7:tier===1?7:6,a=slot*TAU/n+tick*(tier===1?-.0022:.0028)+(e.ph||0),rx=(17+tier*10)*s,ry=(6+tier*4)*s;pts.push({x:x+Math.cos(a)*rx,y:y+13*s+tier*5*s+Math.sin(a)*ry,tier,a})}
    for(let tier=0;tier<3;tier++){const row=pts.filter(p=>p.tier===tier);if(row.length<2)continue;X.strokeStyle=rgba(tier===2?C.blue:C.yellow,.10+stage*.025);X.lineWidth=.55+.08*tier;X.beginPath();X.moveTo(row[0].x,row[0].y);for(let i=1;i<row.length;i++)X.lineTo(row[i].x,row[i].y);if(row.length>4)X.closePath();X.stroke()}
    for(const p of pts){const col=p.tier===2&&stage>=4?C.blue:C.yellow;X.fillStyle=rgba(col,.48+stage*.08);X.beginPath();X.arc(p.x,p.y,(.85+p.tier*.18)*s,0,TAU);X.fill()}
    glow(X,x,y,18*s,C.yellow,.08+stage*.025,2);
    if(stage>=3&&m.anticipated){X.strokeStyle=rgba(C.yellow,.12+stage*.02);X.setLineDash([2,7]);X.beginPath();X.moveTo(x,y);X.lineTo(m.anticipated.x,m.anticipated.y);X.stroke();X.setLineDash([])}
    if(stage>=4)ring(X,x,y,34*s,18*s,C.blue,.11,.65,tick*.003+(e.ph||0),5);
  }
  X.restore();stats.minds=minds;
}
const baseDrawTemple=drawTemple;
drawTemple=function(tx,ty){const t0=performance.now();drawDistricts(tx,ty);baseDrawTemple(tx,ty);drawMindSkirts(tx,ty);rolling('templeMs',performance.now()-t0)};

let sightCharge=.12;
function sightGeometry(px,py,spread){if(love.stun>0)return false;const a=Math.atan2(py-love.y,px-love.x),base=love.gazeA||0;let d=a-base;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;const s=spread==null?(.145-sightCharge*.035):spread;return Math.abs(d)<s}
inGaze=function(px,py,spread){return sightGeometry(px,py,spread)};
function updateSight(){
  const d=worldDt(),stride=Math.max(1,Math.floor(stars.length/180));let intake=0;
  for(let i=(tick|0)%stride;i<stars.length;i+=stride){const s=stars[i];if(!sightGeometry(s.x,s.y,.18))continue;const dist=Math.hypot(s.x-love.x,s.y-love.y);intake+=(s._l2lum||.5)/(1+dist/260)}
  intake=cap(intake*.018,0,1);if(refractRays&&refractRays.length)intake+=.08;sightCharge=cap(sightCharge+(intake-sightCharge)*cap(.025*d,.025,.24)-.0007*d,0,1);love._l2charge=sightCharge;stats.sightCharge=sightCharge;
  if(!settings.burningSight||sightCharge<.58||love.stun>0)return;
  if((tick|0)%13===0){
    let best=null,bd=Infinity;const [tx,ty]=pTemple();
    for(const p of temple.pts){if(p.kind!=='ice'||p.rot>0)continue;const x=tx+p.x,y=ty+p.y;if(!sightGeometry(x,y,.10))continue;const dist=Math.hypot(x-love.x,y-love.y);if(dist<bd){bd=dist;best=p}}
    if(best){best.kind='law';emitGlints(tx+best.x,ty+best.y,tx,ty,4);sightCharge=Math.max(0,sightCharge-.055)}
  }
  for(const G of gyres){
    if(!sightGeometry(G.x,G.y,.11))continue;G.energy=Math.max(.25,(G.energy||1)-.0018*d*sightCharge);G._l2seared=sightCharge;
    if(G.orbiters)for(let i=0;i<G.orbiters.length;i+=3){const o=G.orbiters[i];o.blessed=Math.max(o.blessed||0,sightCharge);if(o.trail&&o.trail.length>18&&Math.random()<.025*sightCharge)o.trail.splice(0,Math.min(4,o.trail.length-3))}
  }
  if((tick|0)%19===0){for(let i=magentas.length-1;i>=0;i--){const m=magentas[i];if(!sightGeometry(m.x,m.y,.10))continue;golds.push({x:m.x,y:m.y,age:0,life:rand(120,200),vy:-rand(.35,.8),vx:rand(-.25,.25),from:'burning-sight'});magentas.splice(i,1);sightCharge=Math.max(0,sightCharge-.035);break}}
}
function ribbon(ctx,x,y,a,len,width,color,alpha,bend){const nx=-Math.sin(a),ny=Math.cos(a),ex=x+Math.cos(a)*len,ey=y+Math.sin(a)*len,cx=x+Math.cos(a)*len*.48+nx*bend,cy=y+Math.sin(a)*len*.48+ny*bend,g=ctx.createLinearGradient(x,y,ex,ey);g.addColorStop(0,rgba(color,alpha));g.addColorStop(.38,rgba(color,alpha*.52));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x+nx*width,y+ny*width);ctx.quadraticCurveTo(cx+nx*width*.5,cy+ny*width*.5,ex,ey);ctx.quadraticCurveTo(cx-nx*width*.5,cy-ny*width*.5,x-nx*width,y-ny*width);ctx.closePath();ctx.fill()}
drawRefraction=function(){
  if(!refractRays||!refractRays.length)return;const len=Math.max(W,H)*.42;X.save();X.globalCompositeOperation='screen';
  for(let i=0;i<refractRays.length;i++){const r=refractRays[i],bend=Math.sin(tick*.009+i*2)*24;ribbon(X,tPos.x,tPos.y,r.a,len,5+i*1.4,C.ice,.075+sightCharge*.055,bend);X.strokeStyle=rgba(C.white,.10+sightCharge*.08);X.lineWidth=.45;X.beginPath();X.moveTo(tPos.x,tPos.y);X.quadraticCurveTo(tPos.x+Math.cos(r.a)*len*.5-Math.sin(r.a)*bend,tPos.y+Math.sin(r.a)*len*.5+Math.cos(r.a)*bend,tPos.x+Math.cos(r.a)*len,tPos.y+Math.sin(r.a)*len);X.stroke()}
  X.restore();
};
drawLove=function(){
  if(love.stun>0){try{LEAF_RENDER_REWORK.originals.drawLove()}catch(_){}return}
  const lx=love.x,ly=love.y,a=love.gazeA||0,att=Math.min(attSmooth,12),len=Math.max(W,H)*(.58+sightCharge*.17);drawLoveSkirt(lx,ly,.74,love.skirt,.58+.42*Math.sin(tick*.04));
  X.save();X.globalCompositeOperation='screen';const rays=5+(sightCharge>.72?2:0),baseWidth=5+sightCharge*10;
  for(let i=0;i<rays;i++){const q=i-(rays-1)/2,ang=a+q*(.026+.012*(1-sightCharge))+Math.sin(tick*.006+i*1.7)*.006;ribbon(X,lx,ly,ang,len*(.90+.08*Math.cos(i)),baseWidth*(1-Math.abs(q)/(rays+1)*.42),i%3===1?C.ice:C.green,.045+sightCharge*.055,Math.sin(tick*.004+i)*22)}
  glow(X,lx,ly,52+att*2+sightCharge*18,C.green,.17+sightCharge*.11,3);X.save();X.translate(lx,ly);X.rotate(a);const rx=15+att*.28+sightCharge*2,ry=8.5+att*.1;
  X.fillStyle='rgba(0,16,7,.94)';X.beginPath();X.moveTo(-rx,0);X.bezierCurveTo(-rx*.42,-ry,rx*.42,-ry,rx,0);X.bezierCurveTo(rx*.42,ry,-rx*.42,ry,-rx,0);X.closePath();X.fill();X.strokeStyle=rgba(C.green,.74+sightCharge*.2);X.lineWidth=1.05+sightCharge*.35;X.stroke();
  const iris=X.createRadialGradient(1,0,0,1,0,7.5);iris.addColorStop(0,'rgba(245,255,248,.98)');iris.addColorStop(.28,rgba(C.yellow,.82*sightCharge));iris.addColorStop(.45,'rgba(40,255,110,.96)');iris.addColorStop(1,'rgba(0,82,24,.96)');X.fillStyle=iris;X.beginPath();X.arc(1,0,6.3+sightCharge*.9,0,TAU);X.fill();X.fillStyle='rgba(0,4,1,.99)';X.beginPath();X.ellipse(2,0,1.15+sightCharge*.35,5.2,0,0,TAU);X.fill();X.fillStyle='rgba(240,255,244,.84)';X.beginPath();X.arc(-.4,-2.2,1.25,0,TAU);X.fill();X.restore();
  if(sightCharge>.62)ring(X,lx,ly,22+sightCharge*12,13+sightCharge*5,C.yellow,.10+sightCharge*.12,.7,tick*.008,4);if(love.shock>.02)glow(X,lx-Math.cos(a)*14*love.shock,ly-Math.sin(a)*14*love.shock,30+love.shock*34,C.green,.22*love.shock);X.restore();
};

const baseUpdateGyres=updateGyres;
updateGyres=function(px,py){const t=performance.now(),r=baseUpdateGyres(px,py);rolling('gyreUpdateMs',performance.now()-t);return r};
const trailCanvas=document.createElement('canvas'),trailX=trailCanvas.getContext('2d');let trailW=0,trailH=0,lastTrailTick=-1;
function sizeTrailLayer(){const w=Math.max(1,Math.ceil(W*.5)),h=Math.max(1,Math.ceil(H*.5));if(w===trailW&&h===trailH)return;trailW=w;trailH=h;trailCanvas.width=w;trailCanvas.height=h;trailX.setTransform(.5,0,0,.5,0,0)}
function buildGyreSilk(){
  if(!settings.trails)return;const now=tick|0;if(now===lastTrailTick||now%2)return;lastTrailTick=now;const t0=performance.now();sizeTrailLayer();
  trailX.save();trailX.setTransform(1,0,0,1,0,0);trailX.globalCompositeOperation='destination-out';trailX.fillStyle='rgba(0,0,0,.075)';trailX.fillRect(0,0,trailW,trailH);trailX.restore();
  trailX.save();trailX.setTransform(.5,0,0,.5,0,0);trailX.globalCompositeOperation='lighter';trailX.lineCap='round';trailX.lineJoin='round';
  for(const G of gyres){const count=G.orbiters.length,skip=count>34?3:count>22?2:1,pf=Math.min(1,G.petrify||0);for(let oi=0;oi<count;oi+=skip){const o=G.orbiters[oi],h=o.trail||[],n=h.length;if(n<3)continue;trailX.beginPath();for(let i=0;i<n;i++){const q=h[i],x=G.x+q.x,y=G.y+q.y;if(i===0)trailX.moveTo(x,y);else trailX.lineTo(x,y)}const end=h[n-1],depth=end.depth||0,fade=.10+.30*Math.min(1,n/28),width=(.65+depth*1.8)*G.scale,lit=(o.blessed||0)>.38;trailX.strokeStyle=pf?rgba(C.ice,fade*.55):lit?rgba('#aaffc8',fade):rgba(C.pink,fade*.62);trailX.lineWidth=width;trailX.stroke()}}
  trailX.restore();rolling('trailBuildMs',performance.now()-t0);
}
drawGyreTrails=function(){buildGyreSilk()};
drawGyres=function(){
  buildGyreSilk();
  if(settings.trails){const t0=performance.now();X.save();X.globalCompositeOperation='lighter';X.globalAlpha=.72;X.drawImage(trailCanvas,0,0,trailW,trailH,0,0,W,H);X.restore();rolling('trailCompositeMs',performance.now()-t0)}else{rolling('trailBuildMs',0,.2);rolling('trailCompositeMs',0,.2)}
  X.save();X.globalCompositeOperation='lighter';
  for(const G of gyres){
    const fade=G.root?1:Math.min(1,(G.life-G.age)/300,G.age/60),energy=Math.min(1.8,G.energy),r=(16+energy*5+(G.shock||0)*13)*G.scale,t=tick*.012+(G.age||0)*.002,sear=G._l2seared||0;
    if(G.lawGrip>.12){const q=lore.lattice*1.6;for(let rr=q;rr<=122*G.scale;rr+=q)ring(X,G.x,G.y,rr,rr,C.blue,.025+.05*G.lawGrip,.45,t*.2,6)}
    glow(X,G.x,G.y,r*3.6,sear>.25?C.green:C.pink,.11*fade+.08*(G.shock||0),2);for(let i=0;i<4;i++){const rr=r*(.82+i*.58),ry=rr*(.58+.10*Math.sin(t+i));ring(X,G.x,G.y,rr,ry,i===3&&sear>.4?C.green:C.pink,(.14+i*.032)*fade,Math.max(.55,(1.35-i*.17)*G.scale),(i%2?-1:1)*t*(.75+i*.11)+i,3+i%2)}
    X.fillStyle='rgba(8,0,14,.97)';X.beginPath();X.arc(G.x,G.y,r*.39,0,TAU);X.fill();X.fillStyle=rgba(sear>.5?C.yellow:'#ff9bf5',.44*fade);X.beginPath();X.arc(G.x,G.y,r*.12,0,TAU);X.fill();
    for(const q of G.out){const a=(1-q.age/q.life)*fade;glow(X,q.x,q.y,5,C.pink,.10*a);X.save();X.translate(q.x,q.y);X.rotate(Math.PI/4);X.strokeStyle=rgba(C.pink,.48*a);X.strokeRect(-1.8,-1.8,3.6,3.6);X.restore()}G._l2seared*=.965;
  }
  X.restore();
};

function updateSidebar(){
  let box=document.getElementById('leaf2-beings');if(!box){box=document.createElement('div');box.id='leaf2-beings';box.style.cssText='position:fixed;right:16px;top:150px;z-index:8;text-align:right;font:10px/1.75 "Courier New",monospace;pointer-events:none;letter-spacing:.2px';document.body.appendChild(box)}
  const lines=[];let e={},s={};try{e=LEAF_NEW_GODDESSES.eater()||{};s=LEAF_NEW_GODDESSES.scavenger()||{}}catch(_){}
  if(e.on)lines.push('<div><span style="color:#f00">retro</span><span style="color:#f0f">grade</span> <span style="color:#c8f7ff">hunger</span></div>');
  if(s.on)lines.push('<div><span style="color:#0f0">scavenger</span><span style="color:#f0f">\'s hem</span></div>');
  if(stats.minds)lines.push('<div style="color:#ffff00">mind '+stats.minds+'</div>');box.innerHTML=lines.join('');stats.hunger=!!e.on;stats.scavenger=!!s.on;
}
let lastPost=0;
function postStats(){const now=performance.now();if(now-lastPost<520)return;lastPost=now;try{parent.postMessage({type:'leaf2-stats',stats:JSON.parse(JSON.stringify(stats))},'*')}catch(_){} }
const baseFrame=frame;
frame=function(){const t0=performance.now();baseFrame();updateNebulae();updateSight();updateSidebar();stats.stars=stars.length;rolling('frameMs',performance.now()-t0);postStats()};

const baseSnapshot=snapshot;
snapshot=function(){const d=JSON.parse(baseSnapshot());d.leaf2={version:1,nebulae,settings:{trails:settings.trails,burningSight:settings.burningSight},sightCharge};return JSON.stringify(d)};
const baseRestore=restore;
restore=function(json){let s=null;try{s=JSON.parse(json).leaf2||null}catch(_){}const ok=baseRestore(json);if(!ok)return false;nebulae=s&&Array.isArray(s.nebulae)?s.nebulae:[];sightCharge=s&&Number.isFinite(s.sightCharge)?s.sightCharge:.12;if(s&&s.settings){if(typeof s.settings.trails==='boolean')settings.trails=s.settings.trails;if(typeof s.settings.burningSight==='boolean')settings.burningSight=s.settings.burningSight}for(const st of stars){ensureStar(st,false);starSerial=Math.max(starSerial,(st._l2id||0)+1)}buildStarGrid();buildStructures();return true};
const baseReset=resetWorld;
resetWorld=function(){const r=baseReset();clusters=[];binaries=[];nebulae=[];lawDistricts=[];sightCharge=.12;return r};

try{
  const boot=JSON.parse(localStorage.getItem(typeof SAVE_KEY==='string'?SAVE_KEY:'leaf_save_v1')||'null');
  const saved=boot&&boot.leaf2;
  if(saved){
    if(Array.isArray(saved.nebulae))nebulae=saved.nebulae;
    if(Number.isFinite(saved.sightCharge))sightCharge=saved.sightCharge;
    if(saved.settings){
      if(typeof saved.settings.trails==='boolean')settings.trails=saved.settings.trails;
      if(typeof saved.settings.burningSight==='boolean')settings.burningSight=saved.settings.burningSight;
    }
  }
}catch(_){}

globalThis.LEAF2={
  officialName:'Second Ecology',settings,stats,
  setTrails(value){settings.trails=!!value;if(!settings.trails){trailX.setTransform(1,0,0,1,0,0);trailX.clearRect(0,0,trailCanvas.width,trailCanvas.height)}return settings.trails},
  setBurningSight(value){settings.burningSight=!!value;return settings.burningSight},
  state(){return{settings:{...settings},stats:JSON.parse(JSON.stringify(stats)),sightCharge,clusters:clusters.length,binaries:binaries.length,nebulae:nebulae.length,lawDistricts:lawDistricts.length}}
};
})();
