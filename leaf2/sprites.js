(() => {
'use strict';
const canvas=document.getElementById('lab'),ctx=canvas.getContext('2d',{alpha:false});
const DPR=Math.min(2,devicePixelRatio||1),TAU=Math.PI*2;
const C={r:'#ff0000',g:'#00ff00',p:'#ff00ff',b:'#00c8ff',y:'#ffff00',ice:'#c8f7ff',w:'#f2ffff',dim:'#50636b'};
const selected=JSON.parse(localStorage.getItem('leaf_sprite_lab_v1')||'{}');
let field=false,W=0,H=0,rowH=220,labelW=185,cellW=220,top=54,rows=[];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function rgba(hex,a){const h=hex.replace('#',''),r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return`rgba(${r},${g},${b},${a})`}
function glow(x,y,r,color,a,inner=0){if(a<=0)return;const g=ctx.createRadialGradient(x,y,inner,x,y,r);g.addColorStop(0,rgba(color,a));g.addColorStop(.35,rgba(color,a*.34));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
function dot(x,y,r,color,a=1){ctx.fillStyle=rgba(color,a);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}
function line(x1,y1,x2,y2,color,a=.5,w=1){ctx.strokeStyle=rgba(color,a);ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function poly(points,color,a=.6,fill=false,w=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=rgba(color,a);ctx.fill()}else{ctx.strokeStyle=rgba(color,a);ctx.lineWidth=w;ctx.stroke()}}
function diamond(x,y,r,color,a=.7,fill=false,rot=0){const pts=[];for(let i=0;i<4;i++){const q=rot+Math.PI/4+i*Math.PI/2;pts.push([x+Math.cos(q)*r,y+Math.sin(q)*r])}poly(pts,color,a,fill,1)}
function star(x,y,r,n,color,a=.8,rot=-Math.PI/2,inner=.34){const pts=[];for(let i=0;i<n*2;i++){const q=rot+i*Math.PI/n,d=i%2?r:r*inner;pts.push([x+Math.cos(q)*d,y+Math.sin(q)*d])}poly(pts,color,a,true)}
function arc(x,y,rx,ry,start,end,color,a=.4,w=1,rot=0){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.strokeStyle=rgba(color,a);ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,start,end);ctx.stroke();ctx.restore()}
function brokenRing(x,y,rx,ry,color,a,w,t,n=4,drift=0){for(let i=0;i<n;i++){const q=t*drift+i*TAU/n;arc(x,y,rx,ry,q,q+TAU/n*.58,color,a,w,t*.03)}}
function eye(x,y,rx,ry,color,t,pupil=true){ctx.save();ctx.translate(x,y);ctx.rotate(t*.04);ctx.beginPath();ctx.moveTo(-rx,0);ctx.bezierCurveTo(-rx*.44,-ry,rx*.44,-ry,rx,0);ctx.bezierCurveTo(rx*.44,ry,-rx*.44,ry,-rx,0);ctx.closePath();ctx.fillStyle='rgba(0,8,4,.94)';ctx.fill();ctx.strokeStyle=rgba(color,.82);ctx.lineWidth=1;ctx.stroke();if(pupil){dot(0,0,ry*.55,color,.9);dot(0,0,ry*.22,'#001207',1);dot(-ry*.12,-ry*.18,ry*.09,C.w,.8)}ctx.restore()}
function veil(x,y,w,h,color,a=.25){const g=ctx.createLinearGradient(x,y,x,y+h);g.addColorStop(0,rgba(color,a));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-w*.55,y+h*.35,x-w,y+h);ctx.lineTo(x+w,y+h);ctx.quadraticCurveTo(x+w*.55,y+h*.35,x,y);ctx.fill()}
function orbitDots(x,y,rx,ry,count,color,t,a=.65,r=1.4,speed=.2){for(let i=0;i<count;i++){const q=i*TAU/count+t*speed;dot(x+Math.cos(q)*rx,y+Math.sin(q)*ry,r,color,a)}}
function bgCell(x,y,w,h,t){ctx.fillStyle='#010304';ctx.fillRect(x,y,w,h);if(!field)return;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();for(let i=0;i<22;i++){const q=i*19.71+Math.floor(t*.02),px=x+((i*67+q*11)%w),py=y+((i*43+q*7)%h);dot(px,py,(i%9===0?1.2:.55),i%7===0?C.y:i%5===0?C.b:C.g,i%9===0?.55:.15)}for(let i=0;i<9;i++){const px=x+w*.55+Math.cos(i*2.3)*55,py=y+h*.52+Math.sin(i*1.8)*38;line(px,py,px+Math.cos(i)*15,py+Math.sin(i)*15,C.b,.12,.6)}ctx.restore()}
function cardFrame(x,y,w,h,entity,i){ctx.strokeStyle=selected[entity]===i?'rgba(240,255,255,.48)':'rgba(115,145,155,.16)';ctx.lineWidth=selected[entity]===i?1.2:.7;ctx.strokeRect(x+.5,y+.5,w-1,h-1);if(selected[entity]===i){line(x+8,y+8,x+22,y+8,C.w,.62,1);line(x+8,y+8,x+8,y+22,C.w,.62,1);line(x+w-8,y+h-8,x+w-22,y+h-8,C.w,.62,1);line(x+w-8,y+h-8,x+w-8,y+h-22,C.w,.62,1)}}
const designs={
HEART:[
(x,y,s,t)=>{glow(x,y,34*s,C.r,.16);brokenRing(x,y,23*s,18*s,C.r,.34,1,t,3,.38);brokenRing(x,y,15*s,24*s,'#ff5a28',.2,.75,-t,4,.22);star(x,y,10*s,8,C.r,.74,t*.12,.54);dot(x,y,3.3*s,C.w,.9)},
(x,y,s,t)=>{glow(x,y,32*s,C.r,.18);const p=[];for(let i=0;i<18;i++){const q=i*TAU/18,d=(i%2?11:18+Math.sin(t*2+i)*2)*s;p.push([x+Math.cos(q)*d,y+Math.sin(q)*d])}poly(p,'#d90016',.72,true);brokenRing(x,y,25*s,25*s,C.r,.18,.7,t,4,-.24);dot(x,y,4*s,'#fff0c6',.85)},
(x,y,s,t)=>{glow(x,y,30*s,C.r,.13);for(let i=0;i<4;i++){const q=i*Math.PI/2+t*.08;arc(x+Math.cos(q)*6*s,y+Math.sin(q)*6*s,13*s,7*s,-1.1,1.1,C.r,.36,1.15,q)}diamond(x,y,8*s,'#ff6143',.74,true,t*.08);dot(x,y,2.8*s,C.w,.9)},
(x,y,s,t)=>{dot(x,y,3.5*s,C.w,.95);glow(x,y,20*s,C.r,.22);for(let i=0;i<3;i++)arc(x,y,(10+i*7)*s,(10+i*7)*s,0,TAU,C.r,.18-i*.03,.55);line(x-34*s,y,x+34*s,y,C.r,.16,.6);line(x,y-34*s,x,y+34*s,C.r,.16,.6);orbitDots(x,y,29*s,29*s,4,C.r,t,.4,1,.25)}
],
LOVE:[
(x,y,s,t)=>{glow(x,y,38*s,C.g,.12);eye(x,y,20*s,9*s,C.g,t,false);brokenRing(x,y,28*s,21*s,C.g,.18,.7,t,3,.18);diamond(x,y,5*s,C.ice,.65,true,t*.1);dot(x,y,2*s,C.w,.9)},
(x,y,s,t)=>{glow(x,y,32*s,C.g,.12);brokenRing(x,y,20*s,20*s,C.g,.34,1,t,4,.18);line(x,y-30*s,x,y+28*s,C.g,.28,.8);arc(x,y,11*s,18*s,-1.2,1.2,C.ice,.5,1.1,t*.1);dot(x,y,4*s,C.w,.8);orbitDots(x,y,25*s,18*s,3,C.g,t,.5,1.2,.3)},
(x,y,s,t)=>{const a=-Math.PI/2+t*.07;glow(x,y,34*s,C.g,.12);for(let i=-2;i<=2;i++){const q=a+i*.12;ctx.fillStyle=rgba(i===0?C.ice:C.g,.07+(2-Math.abs(i))*.02);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(q-.05)*52*s,y+Math.sin(q-.05)*52*s);ctx.lineTo(x+Math.cos(q+.05)*52*s,y+Math.sin(q+.05)*52*s);ctx.fill()}diamond(x,y,8*s,C.g,.65,true,t*.08);dot(x,y,2.7*s,C.w,.9)},
(x,y,s,t)=>{glow(x,y,34*s,C.g,.14);eye(x,y,18*s,8*s,C.g,t,true);for(let i=0;i<5;i++){const q=-.7+i*.35;line(x+Math.cos(q)*17*s,y+Math.sin(q)*8*s,x+Math.cos(q)*27*s,y+Math.sin(q)*15*s,C.g,.18,.55)}brokenRing(x,y,29*s,29*s,C.g,.12,.6,t,4,-.16)}
],
POWER:[
(x,y,s,t)=>{glow(x,y,38*s,C.p,.1);for(let i=0;i<3;i++){const q=t*.22+i*TAU/3;arc(x,y,(11+i*5)*s,(18+i*4)*s,q,q+4.7,C.p,.3-i*.04,1.2,q*.1)}dot(x,y,3*s,'#330022',1);dot(x+2*s,y-2*s,1.1*s,C.p,.65)},
(x,y,s,t)=>{glow(x,y,35*s,C.p,.11);ctx.save();ctx.translate(x,y);ctx.rotate(t*.08);for(const side of[-1,1]){ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(side*24*s,-20*s,side*30*s,4*s);ctx.quadraticCurveTo(side*20*s,12*s,side*5*s,6*s);ctx.closePath();ctx.fillStyle=rgba(C.p,.18);ctx.fill();ctx.strokeStyle=rgba(C.p,.55);ctx.stroke()}ctx.restore();eye(x,y,7*s,4*s,C.p,t,true)},
(x,y,s,t)=>{glow(x,y,34*s,C.p,.12);for(let i=0;i<6;i++){const q=i*TAU/6+t*.09;arc(x+Math.cos(q)*9*s,y+Math.sin(q)*9*s,11*s,5*s,-1.1,1.1,C.p,.34,1,q)}dot(x,y,4*s,C.w,.65);orbitDots(x,y,30*s,23*s,5,C.p,t,.36,1,.24)},
(x,y,s,t)=>{glow(x,y,34*s,C.p,.09);for(let i=0;i<5;i++){const r=(8+i*5)*s;arc(x,y,r,r*.72,t*.17+i*.9,t*.17+i*.9+4.2,C.p,.26+i*.025,.8)}for(let i=0;i<5;i++){const q=t*.17+i*1.3;dot(x+Math.cos(q)*29*s,y+Math.sin(q)*20*s,1.1*s,C.p,.45)}}
],
TEMPLE:[
(x,y,s,t)=>{glow(x,y,31*s,C.b,.08);diamond(x,y,22*s,C.b,.48,false,t*.02);diamond(x,y,11*s,C.ice,.72,true,-t*.03);orbitDots(x,y,31*s,31*s,4,C.b,t,.45,1,.12);dot(x,y,2.4*s,C.w,.8)},
(x,y,s,t)=>{glow(x,y,32*s,C.b,.08);ctx.save();ctx.translate(x,y);ctx.rotate(t*.015);ctx.strokeStyle=rgba(C.ice,.58);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,15*s,27*s,0,0,TAU);ctx.stroke();ctx.strokeStyle=rgba(C.b,.27);for(let i=-2;i<=2;i++)line(x-10*s,y+i*7*s,x+10*s,y+i*5*s,C.b,.18,.5);ctx.restore();diamond(x,y,4*s,C.w,.8,true)},
(x,y,s,t)=>{glow(x,y,34*s,C.b,.06);const pts=[[0,-23],[-20,-8],[-12,18],[12,18],[20,-8]].map(p=>[x+p[0]*s,y+p[1]*s]);poly(pts,C.b,.42,false,1);for(let i=0;i<pts.length;i++){dot(pts[i][0],pts[i][1],1.5*s,C.ice,.72);line(pts[i][0],pts[i][1],x,y,C.b,.22,.6)}diamond(x,y,7*s,C.ice,.72,true,t*.04)},
(x,y,s,t)=>{glow(x,y,32*s,C.b,.07);poly([[x,y-30*s],[x-19*s,y+18*s],[x+19*s,y+18*s]],C.b,.4,false,1);line(x-26*s,y+22*s,x+26*s,y+22*s,C.b,.35,1);for(const q of[-1,0,1]){line(x+q*16*s,y+22*s,x+q*16*s,y+31*s,C.ice,.35,.8)}diamond(x,y+4*s,9*s,C.ice,.7,true,t*.03)}
],
STAR:[
(x,y,s,t)=>{glow(x,y,12*s,C.r,.17);star(x,y,4*s,4,C.r,.8,t*.2,.22)},
(x,y,s,t)=>{glow(x,y,21*s,C.y,.2);star(x,y,7*s,8,C.y,.82,t*.09,.32);dot(x,y,3*s,C.w,.85)},
(x,y,s,t)=>{glow(x,y,30*s,'#55aaff',.22);dot(x,y,8*s,'#55aaff',.7);dot(x,y,4*s,C.w,.9);brokenRing(x,y,14*s,14*s,C.b,.18,.7,t,3,.18)},
(x,y,s,t)=>{star(x,y,7*s,4,C.w,.9,t*.06,.18);brokenRing(x,y,11*s,11*s,C.ice,.32,.7,t,4,-.22);glow(x,y,18*s,C.ice,.12)}
],
ZETTAITSUNE:[
(x,y,s,t)=>{glow(x,y,38*s,C.g,.06);veil(x,y-18*s,23*s,54*s,C.ice,.15);arc(x,y-23*s,17*s,17*s,Math.PI,TAU,C.g,.55,1.2);dot(x,y-23*s,4*s,C.ice,.78);for(const q of[-1,1]){line(x+q*18*s,y-8*s,x+q*28*s,y+12*s,C.g,.36,.8);dot(x+q*28*s,y+13*s,2*s,C.g,.6)}brokenRing(x,y+15*s,23*s,8*s,C.b,.22,.7,t,3,.18)},
(x,y,s,t)=>{glow(x,y,36*s,C.ice,.07);veil(x,y-15*s,19*s,50*s,C.g,.12);brokenRing(x,y-18*s,19*s,11*s,C.ice,.5,1,t,3,.12);line(x,y-35*s,x,y+35*s,C.b,.28,.9);diamond(x,y-18*s,5*s,C.g,.8,true,t*.06);orbitDots(x,y-14*s,27*s,20*s,4,C.ice,t,.5,1.2,.16)},
(x,y,s,t)=>{glow(x,y,38*s,C.ice,.06);veil(x,y-17*s,25*s,55*s,C.ice,.12);star(x,y-27*s,11*s,8,C.ice,.42,t*.04,.2);dot(x,y-27*s,3*s,C.g,.85);for(let i=0;i<3;i++)arc(x,y+10*s,(15+i*7)*s,(5+i*2)*s,0,TAU,i===2?C.ice:C.g,.18+i*.04,.7,t*.02)},
(x,y,s,t)=>{glow(x,y,36*s,C.g,.06);veil(x,y-17*s,20*s,52*s,C.b,.14);eye(x,y-22*s,8*s,4*s,C.ice,t,true);arc(x,y-22*s,23*s,23*s,Math.PI+.2,TAU-.2,C.g,.45,1);diamond(x,y+26*s,4*s,C.b,.65,true,t*.04);orbitDots(x,y-20*s,27*s,12*s,3,C.g,t,.5,1,.2)}
],
AGGRESSION:[
(x,y,s,t)=>{glow(x,y,38*s,C.p,.06);for(let i=0;i<3;i++){const col=[C.r,C.g,C.p][i],q=t*.11+i*TAU/3;poly([[x+Math.cos(q)*7*s,y+Math.sin(q)*7*s],[x+Math.cos(q-.13)*36*s,y+Math.sin(q-.13)*36*s],[x+Math.cos(q+.13)*36*s,y+Math.sin(q+.13)*36*s]],col,.5,true)}eye(x,y,8*s,4*s,C.p,t,true)},
(x,y,s,t)=>{glow(x,y,38*s,C.r,.07);line(x-34*s,y+20*s,x+28*s,y-26*s,C.r,.55,2.2);line(x-26*s,y-28*s,x+35*s,y+16*s,C.p,.5,1.6);line(x-9*s,y+34*s,x+12*s,y-35*s,C.g,.45,1.3);brokenRing(x,y,19*s,19*s,C.p,.28,.8,t,4,.18);dot(x,y,3*s,C.w,.8)},
(x,y,s,t)=>{glow(x,y,36*s,C.p,.06);poly([[x-25*s,y+20*s],[x+31*s,y],[x-25*s,y-20*s]],C.p,.4,true);line(x-20*s,y,x+32*s,y,C.r,.7,2);line(x-13*s,y+13*s,x+20*s,y,C.g,.55,1);brokenRing(x-6*s,y,13*s,13*s,C.r,.24,.8,t,3,-.2)},
(x,y,s,t)=>{glow(x,y,36*s,C.p,.05);for(let i=0;i<3;i++){const q=t*.2+i*TAU/3,col=[C.r,C.g,C.p][i];dot(x+Math.cos(q)*25*s,y+Math.sin(q)*19*s,4*s,col,.72);line(x,y,x+Math.cos(q)*25*s,y+Math.sin(q)*19*s,col,.28,.8)}star(x,y,8*s,3,C.w,.65,t*.1,.3)}
],
RETROGRADE_HUNGER:[
(x,y,s,t)=>{glow(x,y,44*s,C.p,.08);brokenRing(x,y,31*s,31*s,C.ice,.28,.9,t,5,-.14);brokenRing(x,y,21*s,21*s,C.p,.42,1.2,t,3,.22);dot(x,y,10*s,'#000',1);star(x,y,5*s,4,C.r,.9,t*.15,.2)},
(x,y,s,t)=>{glow(x,y,42*s,C.p,.07);veil(x,y-18*s,23*s,52*s,C.p,.12);star(x,y-28*s,10*s,9,C.ice,.36,t*.04,.18);diamond(x,y,11*s,C.r,.65,true,t*.03);dot(x,y,4*s,'#140009',1);orbitDots(x,y,33*s,24*s,5,C.ice,t,.55,1.4,.15)},
(x,y,s,t)=>{glow(x,y,43*s,C.p,.08);for(let i=0;i<4;i++){const r=(10+i*7)*s;arc(x,y,r,r*.72,t*.2+i*.8,t*.2+i*.8+4.4,i%2?C.ice:C.p,.24+i*.035,1)}star(x,y,8*s,5,C.r,.72,-t*.08,.24);dot(x,y,3*s,'#000',1)},
(x,y,s,t)=>{glow(x,y,44*s,C.ice,.06);veil(x,y-17*s,20*s,50*s,C.ice,.09);arc(x,y-22*s,26*s,26*s,Math.PI+.2,TAU-.2,C.p,.48,1.2);dot(x,y-22*s,7*s,'#000',1);star(x,y-22*s,4*s,4,C.r,.86,t*.12,.2);for(let i=0;i<3;i++){const q=t*.16+i*TAU/3;diamond(x+Math.cos(q)*31*s,y+Math.sin(q)*23*s,4*s,C.ice,.58,true,q)}}
],
SCAVENGER:[
(x,y,s,t)=>{glow(x,y,35*s,C.g,.05);veil(x,y-18*s,22*s,52*s,C.g,.12);arc(x,y+20*s,27*s,13*s,0,Math.PI,C.p,.55,1.1);orbitDots(x,y+19*s,24*s,10*s,7,C.p,t,.65,1.5,.18);dot(x,y-22*s,4*s,C.g,.78)},
(x,y,s,t)=>{glow(x,y,34*s,C.g,.05);veil(x,y-17*s,18*s,49*s,C.g,.1);for(let i=0;i<3;i++)arc(x,y+10*s,(16+i*7)*s,(7+i*4)*s,0,Math.PI,C.p,.22+i*.08,.8,t*.02);for(let i=0;i<6;i++){const q=i*Math.PI/5;dot(x-25*s+q*16*s,y+24*s+Math.sin(q)*4*s,1.4*s,C.p,.62)}},
(x,y,s,t)=>{glow(x,y,34*s,C.g,.05);arc(x,y-22*s,14*s,14*s,Math.PI,TAU,C.g,.46,1);veil(x,y-18*s,25*s,52*s,C.g,.1);ctx.strokeStyle=rgba(C.p,.42);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-25*s,y+28*s);ctx.quadraticCurveTo(x,y+42*s,x+25*s,y+28*s);ctx.stroke();for(let i=0;i<7;i++)dot(x-22*s+i*7.3*s,y+28*s+Math.sin(i)*4*s,1.3*s,C.p,.62)},
(x,y,s,t)=>{glow(x,y,34*s,C.g,.05);veil(x,y-17*s,19*s,50*s,C.g,.1);line(x-20*s,y+8*s,x+22*s,y+25*s,C.p,.24,.8);for(let i=0;i<5;i++){const q=t*.12+i*TAU/5;dot(x+Math.cos(q)*27*s,y+12*s+Math.sin(q)*15*s,1.8*s,C.p,.6)}diamond(x,y-22*s,5*s,C.g,.75,true,t*.04)}
],
MIND:[
(x,y,s,t)=>{glow(x,y,34*s,C.y,.05);dot(x,y-26*s,5*s,C.y,.72);for(let i=0;i<6;i++){const yy=y-10*s+i*8*s;line(x-(7+i*3)*s,yy,x+(7+i*3)*s,yy,C.y,.42,.9)}line(x-7*s,y-10*s,x-23*s,y+35*s,C.y,.35,.8);line(x+7*s,y-10*s,x+23*s,y+35*s,C.y,.35,.8);brokenRing(x,y-26*s,14*s,14*s,C.y,.24,.7,t,4,.13)},
(x,y,s,t)=>{glow(x,y,35*s,C.y,.05);dot(x,y-26*s,4*s,C.w,.8);for(let i=0;i<4;i++){const r=(12+i*7)*s;arc(x,y+12*s,r,r*.34,0,TAU,C.y,.17+i*.06,.8,t*.02)}for(let i=0;i<5;i++){const yy=y-8*s+i*9*s;line(x-4*s,yy,x+4*s,yy,C.y,.55,.8)}},
(x,y,s,t)=>{glow(x,y,34*s,C.y,.05);brokenRing(x,y-24*s,15*s,15*s,C.y,.38,.9,t,5,.12);dot(x,y-24*s,4*s,C.w,.8);veil(x,y-16*s,18*s,49*s,C.y,.08);orbitDots(x,y+8*s,28*s,18*s,5,C.y,t,.52,1.5,.14);for(let i=0;i<4;i++)line(x,y-8*s+i*10*s,x,y-2*s+i*10*s,C.y,.45,1)},
(x,y,s,t)=>{glow(x,y,34*s,C.y,.05);dot(x,y-26*s,5*s,C.y,.72);line(x-25*s,y-10*s,x+25*s,y-10*s,C.y,.42,.9);for(const q of[-1,1]){line(x+q*25*s,y-10*s,x+q*25*s,y+7*s,C.y,.3,.7);dot(x+q*25*s,y+10*s,2*s,C.y,.65)}for(let i=0;i<6;i++){const yy=y-3*s+i*7*s;line(x-(6+i*2.6)*s,yy,x+(6+i*2.6)*s,yy,C.y,.35,.75)}}
]
};
const order=['HEART','LOVE','POWER','TEMPLE','STAR','ZETTAITSUNE','AGGRESSION','RETROGRADE_HUNGER','SCAVENGER','MIND'];
const pretty={RETROGRADE_HUNGER:'RETROGRADE HUNGER',SCAVENGER:"SCAVENGER'S HEM"};
const color={HEART:C.r,LOVE:C.g,POWER:C.p,TEMPLE:C.b,STAR:C.y,ZETTAITSUNE:C.ice,AGGRESSION:C.p,RETROGRADE_HUNGER:C.p,SCAVENGER:C.g,MIND:C.y};
function layout(){W=innerWidth;labelW=clamp(W*.15,110,190);cellW=clamp((W-labelW-32)/4,145,245);rowH=clamp(cellW*.82,145,220);H=top+order.length*rowH+36;canvas.style.width=W+'px';canvas.style.height=H+'px';canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);rows=order.map((name,r)=>({name,y:top+r*rowH}))}
function draw(now){const t=now/1000;ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.font='10px "Courier New",monospace';ctx.textBaseline='middle';ctx.fillStyle='rgba(150,175,182,.48)';ctx.fillText('actual canvas renderers · same primitives intended for the game',16,22);for(const row of rows){const name=row.name,y=row.y,col=color[name];ctx.fillStyle=rgba(col,.72);ctx.font='12px "Courier New",monospace';ctx.fillText(pretty[name]||name,16,y+rowH*.48);ctx.font='9px "Courier New",monospace';ctx.fillStyle='rgba(110,130,138,.45)';ctx.fillText('A   B   C   D',16,y+rowH*.48+18);for(let i=0;i<4;i++){const x=labelW+i*cellW+8,w=cellW-10,h=rowH-10;bgCell(x,y+4,w,h,t);cardFrame(x,y+4,w,h,name,i);ctx.fillStyle=rgba(col,.6);ctx.font='10px "Courier New",monospace';ctx.fillText(String.fromCharCode(65+i),x+10,y+17);ctx.save();ctx.beginPath();ctx.rect(x,y+4,w,h);ctx.clip();const s=clamp(Math.min(w,h)/150,.8,1.32),cx=x+w*.5,cy=y+4+h*.52;designs[name][i](cx,cy,s,t+i*.9);ctx.restore()}}requestAnimationFrame(draw)}
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*H/r.height;if(x<labelW)return;const row=Math.floor((y-top)/rowH),i=Math.floor((x-labelW-8)/cellW);if(row<0||row>=order.length||i<0||i>3)return;selected[order[row]]=i;localStorage.setItem('leaf_sprite_lab_v1',JSON.stringify(selected))});
addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();field=!field}});addEventListener('resize',layout);layout();requestAnimationFrame(draw);
})();
