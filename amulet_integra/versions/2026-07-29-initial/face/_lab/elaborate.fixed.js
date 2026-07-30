// elaborate.fixed.js — tab-aware init; faster DLA; higher-contrast Lenia; Metaballs unchanged.

// ---------- helpers ----------
const started = { ray:false, dla:false, metaballs:false, lenia:false };
function onTabShown(id, fn){ setTimeout(()=>{ if(!started[id]){ started[id]=true; fn(); } }, 0); }
function dpr(){ return Math.min(2, window.devicePixelRatio||1); }
function fitCanvas(c, targetH=460){
  const rect = c.getBoundingClientRect();
  const cssW = rect.width || c.parentElement.clientWidth || 1100;
  const cssH = rect.height || targetH;
  const scale = dpr();
  c.width = Math.max(1, Math.floor(cssW*scale));
  c.height = Math.max(1, Math.floor(cssH*scale));
  return { W:c.width, H:c.height, scale };
}

// wire tabs to lazy-start
document.querySelectorAll(".tabs button").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const id = btn.dataset.tab;
    if (id==="ray") onTabShown("ray", startRay);
    if (id==="dla") onTabShown("dla", startDLA);
    if (id==="metaballs") onTabShown("metaballs", startMetaballs);
    if (id==="lenia") onTabShown("lenia", startLenia);
  });
});
if (document.getElementById("ray").classList.contains("active")) onTabShown("ray", startRay);

// ======================= 1) Raymarch (uses inline shaders) =======================
function startRay(){
  const canvas = document.getElementById("glcanvas");
  const gl = canvas.getContext("webgl"); if(!gl) return;

  function resize(){ fitCanvas(canvas); gl.viewport(0,0,canvas.width,canvas.height); }
  window.addEventListener("resize", resize); resize();

  function compile(type, src){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, document.getElementById("vs").textContent);
  const fs = compile(gl.FRAGMENT_SHADER, document.getElementById("fs").textContent);
  const prog = gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
  gl.useProgram(prog);

  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");

  function frame(t){
    resize();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t*0.001);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ======================= 2) DLA — much faster growth =======================
function startDLA(){
  const c = document.getElementById("dlac");
  fitCanvas(c);
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;

  const img = ctx.createImageData(W,H);
  const data = new Uint8Array(W*H);
  const idx = (x,y)=> x + y*W;

  const cx = (W/2)|0, cy = (H/2)|0;
  function put(x,y,t){
    const i=(x+y*W)*4;
    // higher contrast palette
    img.data[i]   = Math.floor(235 - 120*t);
    img.data[i+1] = Math.floor(150 + 80*(1-t));
    img.data[i+2] = Math.floor(255*(1-t*0.7));
    img.data[i+3] = 255;
  }

  // seed a small cross for quicker adhesion
  for(let k=-2;k<=2;k++){ data[idx(cx+k,cy)]=1; put(cx+k,cy,0); data[idx(cx,cy+k)]=1; put(cx,cy+k,0); }

  const walkers = [];
  function spawnWalker(){
    const a = Math.random()*Math.PI*2;
    const R = Math.min(W,H)*0.48;
    let x = Math.floor(cx + Math.cos(a)*R);
    let y = Math.floor(cy + Math.sin(a)*R);
    x = (x%W+W)%W; y = (y%H+H)%H;
    walkers.push({ x, y, life: 600 });
  }
  // many more walkers
  for(let i=0;i<2500;i++) spawnWalker();

  function occupiedNear(x,y){
    // 8-neighborhood
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx && !dy) continue;
      const xx=(x+dx+W)%W, yy=(y+dy+H)%H;
      if (data[idx(xx,yy)]) return true;
    }
    return false;
  }

  function step(){
    // far more micro-steps per frame
    for(let iter=0; iter<25000; iter++){
      const w = walkers[(Math.random()*walkers.length)|0];
      if (!w) break;
      const dir = Math.random()*Math.PI*2;
      w.x = (w.x + (Math.random()<0.5? (Math.random()<0.5?-1:1): Math.round(Math.cos(dir))) + W) % W;
      w.y = (w.y + (Math.random()<0.5? (Math.random()<0.5?-1:1): Math.round(Math.sin(dir))) + H) % H;
      if (--w.life<=0){ walkers.splice(walkers.indexOf(w),1); spawnWalker(); continue; }
      if (occupiedNear(w.x,w.y)){
        data[idx(w.x,w.y)] = 1;
        put(w.x,w.y, Math.hypot(w.x-cx, w.y-cy)/(Math.min(W,H)*0.6));
        walkers.splice(walkers.indexOf(w),1);
        spawnWalker();
      }
    }
    ctx.putImageData(img,0,0);
    requestAnimationFrame(step);
  }
  step();
}

// ======================= 3) Metaballs — unchanged =======================
function startMetaballs(){
  const c = document.getElementById("meta");
  fitCanvas(c);
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  const gridX=140, gridY=90, iso=1.0;
  const field = new Float32Array(gridX*gridY);
  const balls = Array.from({length:8}, ()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()*2-1)*60,vy:(Math.random()*2-1)*60,r:60+Math.random()*40}));

  function stamp(){
    field.fill(0);
    for(const b of balls){
      for(let gy=0;gy<gridY;gy++){
        for(let gx=0;gx<gridX;gx++){
          const x=gx/(gridX-1)*W, y=gy/(gridY-1)*H;
          const dx=x-b.x, dy=y-b.y;
          field[gx+gy*gridX] += (b.r*b.r)/(dx*dx+dy*dy+1);
        }
      }
    }
  }
  const edges=[[],[[0,3],[0,1]],[[1,2],[0,1]],[[0,3],[1,2]],[[2,3],[1,2]],[[0,3],[2,3],[0,1],[1,2]],[[0,1],[2,3]],[[0,3],[2,3]],[[2,3],[0,3]],[[2,3],[0,1]],[[1,2],[0,3]],[[1,2],[0,1]],[[0,3],[1,2]],[[1,2],[0,1]],[[0,3],[0,1]],[]];
  function lerpEdge(x0,y0,x1,y1,v0,v1){ const t=(iso-v0)/((v1-v0)||1e-6); return [x0+t*(x1-x0), y0+t*(y1-y0)]; }
  function draw(){
    ctx.clearRect(0,0,W,H); ctx.lineWidth=1.6; ctx.strokeStyle='rgba(126,224,255,0.9)';
    for(let gy=0;gy<gridY-1;gy++){
      for(let gx=0;gx<gridX-1;gx++){
        const i=gx+gy*gridX, v0=field[i], v1=field[i+1], v2=field[i+1+gridX], v3=field[i+gridX];
        const state=(v0>iso?1:0)|(v1>iso?2:0)|(v2>iso?4:0)|(v3>iso?8:0);
        const e=edges[state]; if(!e.length) continue;
        const x=gx/(gridX-1)*W, y=gy/(gridY-1)*H, x1=(gx+1)/(gridX-1)*W, y1=(gy+1)/(gridY-1)*H;
        for(let k=0;k<e.length;k+=2){
          const a=e[k], b=e[k+1]; const pts=[[x,y],[x1,y],[x1,y1],[x,y1]]; const vals=[v0,v1,v2,v3];
          const pa=a[0]===0? lerpEdge(pts[0][0],pts[0][1],pts[1][0],pts[1][1],vals[0],vals[1]) :
                    a[0]===1? lerpEdge(pts[1][0],pts[1][1],pts[2][0],pts[2][1],vals[1],vals[2]) :
                    a[0]===2? lerpEdge(pts[3][0],pts[3][1],pts[2][0],pts[2][1],vals[3],vals[2]) :
                              lerpEdge(pts[0][0],pts[0][1],pts[3][0],pts[3][1],vals[0],vals[3]);
          const pb=b[0]===0? lerpEdge(pts[0][0],pts[0][1],pts[1][0],pts[1][1],vals[0],vals[1]) :
                    b[0]===1? lerpEdge(pts[1][0],pts[1][1],pts[2][0],pts[2][1],vals[1],vals[2]) :
                    b[0]===2? lerpEdge(pts[3][0],pts[3][1],pts[2][0],pts[2][1],vals[3],vals[2]) :
                              lerpEdge(pts[0][0],pts[0][1],pts[3][0],pts[3][1],vals[0],vals[3]);
          ctx.beginPath(); ctx.moveTo(pa[0],pa[1]); ctx.lineTo(pb[0],pb[1]); ctx.stroke();
        }
      }
    }
  }
  function update(dt){
    for(const b of balls){
      b.x+=b.vx*dt; b.y+=b.vy*dt;
      if(b.x<b.r||b.x>W-b.r) b.vx*=-1;
      if(b.y<b.r||b.y>H-b.r) b.vy*=-1;
    }
  }
  let last=performance.now();
  function loop(now){
    const dt=Math.min(0.05,(now-last)/1000); last=now;
    update(dt); stamp(); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ======================= 4) Lenia — stronger dynamics & contrast =======================
function startLenia(){
  const c = document.getElementById("leniac");
  // fixed sim grid; CSS upscales
  const W=256, H=256; c.width=W; c.height=H;
  const ctx = c.getContext("2d");
  const A = new Float32Array(W*H), B = new Float32Array(W*H);
  const img = ctx.createImageData(W,H);

  for(let i=0;i<W*H;i++) A[i]=Math.random()*0.35; // higher initial energy
  const idx=(x,y)=> ((x+W)%W)+((y+H)%H)*W;

  // kernel
  const R=10, RS=R*R; const K=[]; let sum=0;
  for(let y=-R;y<=R;y++) for(let x=-R;x<=R;x++){ const d2=x*x+y*y; const v=Math.exp(-d2/(2*RS)); K.push(v); sum+=v; }
  for(let i=0;i<K.length;i++) K[i]/=sum;

  function convolve(src,dst){
    let p=0,k=0;
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        let acc=0; k=0;
        for(let j=-R;j<=R;j++) for(let i=-R;i<=R;i++) acc+=src[idx(x+i,y+j)]*K[k++];
        dst[p++]=acc;
      }
    }
  }

  // more vivid dynamics
  const mu=0.12, sigma=0.03, dt=1.25;
  const grow=(n)=> Math.exp(-((n-mu)*(n-mu))/(2*sigma*sigma))*2.2 - 1.0;

  function step(){
    convolve(A,B);
    for(let i=0;i<W*H;i++){
      let a = A[i] + dt*grow(B[i]);
      A[i] = Math.max(0, Math.min(1, a));
    }
  }

  function render(){
    for(let i=0;i<W*H;i++){
      const v=A[i];
      // high-contrast “fire/cyan” palette
      const r = Math.pow(v, 0.35)*255;
      const g = Math.pow(Math.abs(Math.sin(v*6.283)), 0.6)*255;
      const b = Math.pow(1.0-v, 0.5)*255;
      const o = i*4; img.data[o]=r|0; img.data[o+1]=g|0; img.data[o+2]=b|0; img.data[o+3]=255;
    }
    ctx.putImageData(img,0,0);
  }

  function loop(){
    // more steps per frame so motion is obvious
    for(let k=0;k<4;k++) step();
    render();
    requestAnimationFrame(loop);
  }
  loop();
}
