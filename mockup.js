// ════════════════════════════════════════════════════════════════════════════
// AURON STUDIO — MÓDULO MOCKUPS (isolado · V2)
// V1: tab Design⇄Mockups, cena, design (flatten), mover/escalar/rodar, opacidade, fusão, export.
// V2: perspetiva (warp por homografia, 4 cantos livres) + máscaras de formato.
// NÃO toca no editor. Estado próprio (MK), canvas próprios, funções próprias.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const MK = {
    scene:null, sceneName:'', sceneW:0, sceneH:0,
    design:null,            // {src:(canvas|img), w, h}
    masked:null,            // canvas do design já com a máscara de forma aplicada
    x:0, y:0,               // centro do design (modo afim), px do buffer
    baseScale:1, scaleMul:1, rot:0, opacity:1, blend:'source-over',
    persp:false, quad:null, // modo perspetiva: 4 cantos livres [TL,TR,BR,BL]
    mask:'rect', maskRadius:0, finished:null,
    finish:'none',          // acabamento: none | acrylic | lightbox
    spill:0, shadow:0, shadowAngle:135, reflect:0,  // V5 realismo: derrame, sombra, reflexo
    orient:'v', size:'a3', customW:30, customH:30,  // predefinições de saída (front)
    cw:0, ch:0, nativeW:0, nativeH:0,
    active:false, drag:null,
  };
  const WORK_MAX = 1600;
  const $ = id => document.getElementById(id);

  // ── abas ─────────────────────────────────────────────────────────────────────
  window.mockSwitch = function(which){
    const mock = which==='mockups'; MK.active=mock;
    $('mockView').hidden=!mock;
    $('mkTabMock').classList.toggle('on',mock);
    $('mkTabDesign').classList.toggle('on',!mock);
    if(mock){ fitView(); renderMock(); }
  };

  // ── cena ──────────────────────────────────────────────────────────────────────
  window.mockLoadScene = function(input){
    const f=input.files&&input.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=e=>{ const img=new Image(); img.onload=()=>{
      MK.scene=img; MK.sceneName=(f.name||'mockup').replace(/\.[^.]+$/,'');
      MK.nativeW=img.naturalWidth; MK.nativeH=img.naturalHeight;
      const s=Math.min(1,WORK_MAX/Math.max(img.naturalWidth,img.naturalHeight));
      MK.cw=Math.round(img.naturalWidth*s); MK.ch=Math.round(img.naturalHeight*s);
      $('mockCv').width=MK.cw; $('mockCv').height=MK.ch; $('mockOv').width=MK.cw; $('mockOv').height=MK.ch;
      $('mkEmpty').style.display='none';
      if(MK.design) placeDesignCentered();
      fitView(); renderMock();
    }; img.src=e.target.result; };
    r.readAsDataURL(f); input.value='';
  };

  // ── design ──────────────────────────────────────────────────────────────────
  window.mockUseDesign = function(){
    const c=composeDesign(WORK_MAX);
    if(!c){ alert('Não há design no editor. Cria algo na aba Design primeiro.'); return; }
    setDesign(c,c.width,c.height);
  };
  window.mockLoadPNG = function(input){
    const f=input.files&&input.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=e=>{ const img=new Image(); img.onload=()=>setDesign(img,img.naturalWidth,img.naturalHeight); img.src=e.target.result; };
    r.readAsDataURL(f); input.value='';
  };
  function setDesign(src,w,h){
    MK.design={src,w,h};
    buildMasked();
    // se há uma placa de template ativa (perspetiva+quad), o design entra logo nela;
    // caso contrário, posiciona ao centro (comportamento normal)
    if(MK.persp && MK.quad){ /* mantém a placa */ }
    else if(MK.scene) placeDesignCentered();
    else { MK.x=0; MK.y=0; }
    syncProps(); renderMock();
  }
  function placeDesignCentered(){
    MK.x=MK.cw/2; MK.y=MK.ch/2;
    const target=Math.min(MK.cw,MK.ch)*0.55;
    MK.baseScale=target/Math.max(MK.design.w,MK.design.h);
    MK.scaleMul=1; MK.rot=0; MK.persp=false; MK.quad=null;
  }

  function composeDesign(maxDim){
    if(typeof layers==='undefined'||!layers||!layers.length) return null;
    const vis=layers.filter(L=>L.visible); if(!vis.length) return null;
    const ar=W/H; let dw,dh; if(ar>=1){dw=maxDim;dh=Math.round(maxDim/ar);}else{dh=maxDim;dw=Math.round(maxDim*ar);}
    const c=document.createElement('canvas');c.width=dw;c.height=dh;const ec=c.getContext('2d');
    const offs=vis.map(L=>({L,off:drawLayerToCanvas(L,dw,dh)}));
    offs.forEach(item=>{const{L}=item;if(!L.displaceEnabled||!L.displaceTargets.length)return;if(!['caustic','perlin','noise','grid'].includes(L.type))return;const dm=getDispMap(L,dw,dh);L.displaceTargets.forEach(tid=>{const t=offs.find(x=>x.L.id===tid);if(t)applyDisplace(t.off,dm,L.displaceStrength,dw,dh);});});
    offs.forEach(item=>{const{L,off}=item;if(L.displaceEnabled&&L.displaceTargets.length&&['caustic','perlin','noise','grid'].includes(L.type))return;ec.globalAlpha=L.opacity/100;ec.globalCompositeOperation=L.blend==='add'?'lighter':L.blend;ec.drawImage(off,0,0);ec.globalAlpha=1;ec.globalCompositeOperation='source-over';});
    if(typeof applyGlobalAdjustments==='function')applyGlobalAdjustments(ec,dw,dh);
    return c;
  }

  // ── máscara de forma (aplicada ao design na sua resolução de origem) ─────────
  function rr(x,X,Y,w,h,r){ r=Math.min(r,w/2,h/2); x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath(); }
  // formas com cantos: rect e square aceitam raio (0 = cantos normais, >0 = arredondados)
  function buildMasked(){
    if(!MK.design){ MK.masked=null; MK.finished=null; return; }
    const w=MK.design.w,h=MK.design.h;
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    x.fillStyle='#fff';
    const sh=MK.mask, rad=(MK.maskRadius/100);
    if(sh==='rect'||sh==='round'){ rr(x,0,0,w,h,Math.min(w,h)*rad); x.fill(); }
    else if(sh==='square'){ const s=Math.min(w,h); rr(x,(w-s)/2,(h-s)/2,s,s,s*rad); x.fill(); }
    else if(sh==='ellipse'){ x.beginPath();x.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);x.fill(); }
    else if(sh==='circle'){ x.beginPath();x.arc(w/2,h/2,Math.min(w,h)/2,0,Math.PI*2);x.fill(); }
    else x.fillRect(0,0,w,h);
    x.globalCompositeOperation='source-in';
    x.drawImage(MK.design.src,0,0,w,h);
    MK.masked=c; buildFinished();
  }
  // acabamento de material aplicado dentro da forma (segue a perspetiva)
  function buildFinished(){
    if(!MK.masked){ MK.finished=null; return; }
    if(MK.finish==='none'||!MK.finish){ MK.finished=MK.masked; return; }
    const w=MK.masked.width,h=MK.masked.height;
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    if(MK.finish==='lightbox'){
      const g=document.createElement('canvas');g.width=w;g.height=h;const gx=g.getContext('2d');
      gx.filter='blur('+Math.max(2,Math.round(Math.min(w,h)*0.045))+'px)'; gx.drawImage(MK.masked,0,0);
      x.drawImage(g,0,0); x.globalCompositeOperation='screen'; x.drawImage(g,0,0);
      x.globalCompositeOperation='source-over'; x.drawImage(MK.masked,0,0);
      x.globalCompositeOperation='source-atop'; x.fillStyle='rgba(255,250,235,.16)'; x.fillRect(0,0,w,h);
      x.globalCompositeOperation='source-over';
    } else if(MK.finish==='acrylic'){
      x.drawImage(MK.masked,0,0);
      const sg=x.createLinearGradient(0,0,w,h);
      sg.addColorStop(0,'rgba(255,255,255,.24)');sg.addColorStop(.22,'rgba(255,255,255,.05)');
      sg.addColorStop(.5,'rgba(255,255,255,0)');sg.addColorStop(.82,'rgba(255,255,255,.04)');sg.addColorStop(1,'rgba(255,255,255,.14)');
      x.globalCompositeOperation='source-atop'; x.fillStyle=sg; x.fillRect(0,0,w,h);
      x.globalCompositeOperation='source-over';
    } else { MK.finished=MK.masked; return; }
    MK.finished=c;
  }
  function shapeHasCorners(){ return MK.mask==='rect'||MK.mask==='square'||MK.mask==='round'; }
  window.mockSetMask=function(shape){ MK.mask=shape; buildMasked(); $('mkRadiusRow').style.display=shapeHasCorners()?'':'none'; renderMock(); };
  window.mockSetRadius=function(v){ MK.maskRadius=+v; $('mkRadiusV').textContent=Math.round(v); buildMasked(); renderMock(); };
  window.mockSetFinish=function(v){ MK.finish=v; buildFinished(); renderMock(); };
  window.mockSetSpill=function(v){ MK.spill=+v; $('mkSpillV').textContent=Math.round(v); renderMock(); };
  window.mockSetShadow=function(v){ MK.shadow=+v; $('mkShadowV').textContent=Math.round(v); renderMock(); };
  window.mockSetShadowAngle=function(v){ MK.shadowAngle=+v; $('mkShAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetReflect=function(v){ MK.reflect=+v; $('mkReflectV').textContent=Math.round(v); renderMock(); };
  window.mockSetOrient=function(v){ MK.orient=v; };
  window.mockSetSize=function(v){ MK.size=v; $('mkCustomRow').style.display=(v==='custom')?'':'none'; };
  window.mockSetCustom=function(which,v){ if(which==='w')MK.customW=+v; else MK.customH=+v; };

  // ── perspetiva ────────────────────────────────────────────────────────────────
  window.mockTogglePersp=function(){
    if(!MK.design) return;
    MK.persp=!MK.persp;
    if(MK.persp) MK.quad=designCorners();   // arranca dos cantos afins atuais
    else MK.quad=null;
    $('mkPerspBtn').classList.toggle('on',MK.persp);
    $('mkPerspBtn').textContent=MK.persp?'Perspetiva: ON':'Perspetiva';
    renderMock();
  };

  // ── propriedades ──────────────────────────────────────────────────────────────
  window.mockSet=function(prop,val){
    if(prop==='opacity'){ MK.opacity=val; $('mkOpacityV').textContent=Math.round(val*100); }
    else if(prop==='scaleP'){ const m=val/100; if(MK.persp){ scaleQuad(m/(MK.scaleMul||1)); } MK.scaleMul=m; $('mkScaleV').textContent=Math.round(val); }
    else if(prop==='rotD'){ const rad=val*Math.PI/180; if(MK.persp){ rotateQuad(rad-MK.rot); } MK.rot=rad; $('mkRotV').textContent=Math.round(val); }
    else if(prop==='blend'){ MK.blend=val; }
    renderMock();
  };
  function syncProps(){
    $('mkOpacity').value=Math.round(MK.opacity*100); $('mkOpacityV').textContent=Math.round(MK.opacity*100);
    $('mkScale').value=Math.round(MK.scaleMul*100); $('mkScaleV').textContent=Math.round(MK.scaleMul*100);
    $('mkRot').value=Math.round(MK.rot*180/Math.PI); $('mkRotV').textContent=Math.round(MK.rot*180/Math.PI);
    $('mkBlend').value=MK.blend;
    if($('mkPerspBtn')){ $('mkPerspBtn').classList.toggle('on',MK.persp); $('mkPerspBtn').textContent=MK.persp?'Perspetiva: ON':'Perspetiva'; }
  }

  // ── geometria ─────────────────────────────────────────────────────────────────
  function effScale(){ return MK.baseScale*MK.scaleMul; }
  function designCorners(){
    if(!MK.design) return null;
    const hw=MK.design.w*effScale()/2, hh=MK.design.h*effScale()/2;
    const co=Math.cos(MK.rot), si=Math.sin(MK.rot);
    return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([lx,ly])=>({x:MK.x+lx*co-ly*si, y:MK.y+lx*si+ly*co}));
  }
  function currentCorners(){ return (MK.persp&&MK.quad)?MK.quad:designCorners(); }
  function centroid(q){ return {x:(q[0].x+q[1].x+q[2].x+q[3].x)/4, y:(q[0].y+q[1].y+q[2].y+q[3].y)/4}; }
  function rotateQuad(da){ const c=centroid(MK.quad),co=Math.cos(da),si=Math.sin(da); MK.quad=MK.quad.map(p=>{const dx=p.x-c.x,dy=p.y-c.y;return{x:c.x+dx*co-dy*si,y:c.y+dx*si+dy*co};}); }
  function scaleQuad(f){ const c=centroid(MK.quad); MK.quad=MK.quad.map(p=>({x:c.x+(p.x-c.x)*f, y:c.y+(p.y-c.y)*f})); }
  function rotateHandlePt(){
    const q=currentCorners(); const c=centroid(q);
    const topMid={x:(q[0].x+q[1].x)/2, y:(q[0].y+q[1].y)/2};
    let dx=topMid.x-c.x, dy=topMid.y-c.y; const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    const k=1/(viewScale()||1);
    return {x:topMid.x+dx*30*k, y:topMid.y+dy*30*k};
  }

  // ── homografia + warp 2D (sem WebGL) ──────────────────────────────────────────
  function solveHomography(s,d){
    // resolve 8 incógnitas: x'=(ax+by+c)/(gx+hy+1), y'=(dx+ey+f)/(gx+hy+1)
    const A=[],B=[];
    for(let i=0;i<4;i++){
      const X=s[i].x,Y=s[i].y,u=d[i].x,v=d[i].y;
      A.push([X,Y,1,0,0,0,-u*X,-u*Y]); B.push(u);
      A.push([0,0,0,X,Y,1,-v*X,-v*Y]); B.push(v);
    }
    const h=solve8(A,B); // [a,b,c,d,e,f,g,h]
    return h;
  }
  function solve8(A,B){
    const n=8, M=A.map((r,i)=>r.concat(B[i]));
    for(let col=0;col<n;col++){
      let piv=col; for(let r=col+1;r<n;r++) if(Math.abs(M[r][col])>Math.abs(M[piv][col])) piv=r;
      const tmp=M[col]; M[col]=M[piv]; M[piv]=tmp;
      const pv=M[col][col]||1e-9;
      for(let c=col;c<=n;c++) M[col][c]/=pv;
      for(let r=0;r<n;r++){ if(r===col) continue; const f=M[r][col]; for(let c=col;c<=n;c++) M[r][c]-=f*M[col][c]; }
    }
    return M.map(r=>r[n]);
  }
  function applyH(h,x,y){ const d=h[6]*x+h[7]*y+1; return {x:(h[0]*x+h[1]*y+h[2])/d, y:(h[3]*x+h[4]*y+h[5])/d}; }

  function drawWarped(ctx2,img,quad,N){
    const w=img.width,h=img.height;
    const src=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    const H=solveHomography(src,quad);
    // grelha de vértices destino (na posição projetiva real → linhas retas mantêm-se)
    const gx=N+1, V=[];
    for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){ const sx=i/N*w, sy=j/N*h; const d=applyH(H,sx,sy); V.push({sx,sy,dx:d.x,dy:d.y}); }
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const a=V[j*gx+i], b=V[j*gx+i+1], c=V[(j+1)*gx+i+1], d=V[(j+1)*gx+i];
      drawTri(ctx2,img,a,b,c); drawTri(ctx2,img,a,c,d);
    }
  }
  function drawTri(ctx2,img,p0,p1,p2){
    // expande ligeiramente o triângulo destino p/ não deixar costuras
    const cx=(p0.dx+p1.dx+p2.dx)/3, cy=(p0.dy+p1.dy+p2.dy)/3, EXP=0.6;
    const e=p=>{ const dx=p.dx-cx,dy=p.dy-cy,l=Math.hypot(dx,dy)||1; return {x:p.dx+dx/l*EXP, y:p.dy+dy/l*EXP}; };
    const d0=e(p0),d1=e(p1),d2=e(p2);
    ctx2.save();
    ctx2.beginPath();ctx2.moveTo(d0.x,d0.y);ctx2.lineTo(d1.x,d1.y);ctx2.lineTo(d2.x,d2.y);ctx2.closePath();ctx2.clip();
    // afim que mapeia (sx,sy)->(dx,dy) dos 3 pontos
    const u0=p0.sx,v0=p0.sy,u1=p1.sx,v1=p1.sy,u2=p2.sx,v2=p2.sy;
    const den=u0*(v2-v1)-u1*v2+u2*v1+(u1-u2)*v0;
    if(Math.abs(den)<1e-6){ ctx2.restore(); return; }
    const a=-(v0*(d2.x-d1.x)-v1*d2.x+v2*d1.x+(v1-v2)*d0.x)/den;
    const b=(v1*d2.y+v0*(d1.y-d2.y)-v2*d1.y+(v2-v1)*d0.y)/den;
    const c=(u0*(d2.x-d1.x)-u1*d2.x+u2*d1.x+(u1-u2)*d0.x)/den;
    const dd=-(u1*d2.y+u0*(d1.y-d2.y)-u2*d1.y+(u2-u1)*d0.y)/den;
    const e2=(u0*(v2*d1.x-v1*d2.x)+v0*(u1*d2.x-u2*d1.x)+(u2*v1-u1*v2)*d0.x)/den;
    const f=(u0*(v2*d1.y-v1*d2.y)+v0*(u1*d2.y-u2*d1.y)+(u2*v1-u1*v2)*d0.y)/den;
    ctx2.transform(a,b,c,dd,e2,f);
    ctx2.drawImage(img,0,0);
    ctx2.restore();
  }

  // ── render ────────────────────────────────────────────────────────────────────
  // pinta SÓ a peça (sem blend/opacidade) num canvas transparente do tamanho do alvo,
  // já com perspetiva/forma/acabamento — base para sombra, derrame e reflexo
  function renderDesignLayer(w,h,ratio){
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    const img=MK.finished||MK.masked; if(!img) return c;
    if(MK.persp&&MK.quad){ drawWarped(x, img, MK.quad.map(p=>({x:p.x*ratio,y:p.y*ratio})), MK.dragging?14:(ratio>1?40:24)); }
    else { x.save(); x.translate(MK.x*ratio,MK.y*ratio); x.rotate(MK.rot); const s=effScale()*ratio,dw=MK.design.w*s,dh=MK.design.h*s; x.drawImage(img,-dw/2,-dh/2,dw,dh); x.restore(); }
    return c;
  }
  // compõe a peça sobre a cena (ctx2) com realismo de luz (sombra + derrame + reflexo)
  function compositeDesignOnto(ctx2, ratio){
    if(!MK.design) return;
    const w=ctx2.canvas.width, h=ctx2.canvas.height;
    const layer=renderDesignLayer(w,h,ratio);
    const full=!MK.dragging; // durante o arrasto, salta efeitos pesados (fluidez)
    const mn=Math.min(w,h);
    // 1) SOMBRA de contacto (peça → ambiente)
    if(full && MK.shadow>0){
      const sh=document.createElement('canvas');sh.width=w;sh.height=h;const sx=sh.getContext('2d');
      sx.drawImage(layer,0,0); sx.globalCompositeOperation='source-in'; sx.fillStyle='#000'; sx.fillRect(0,0,w,h);
      const ang=(MK.shadowAngle||135)*Math.PI/180, off=(0.012+0.03*(MK.shadow/100))*mn;
      const blur=Math.max(3,(0.02+0.03*(MK.shadow/100))*mn);
      const b=document.createElement('canvas');b.width=w;b.height=h;const bx=b.getContext('2d');
      bx.filter='blur('+blur+'px)'; bx.drawImage(sh,Math.cos(ang)*off,Math.sin(ang)*off);
      ctx2.globalAlpha=Math.min(.75,MK.shadow/100*0.75); ctx2.drawImage(b,0,0); ctx2.globalAlpha=1;
    }
    // 2) DERRAME de luz / halo colorido (peça → ambiente)
    if(full && MK.spill>0){
      const g=document.createElement('canvas');g.width=w;g.height=h;const gx=g.getContext('2d');
      const blur=Math.max(6,(0.03+0.07*(MK.spill/100))*mn);
      gx.filter='blur('+blur+'px)'; gx.drawImage(layer,0,0);
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=Math.min(1,MK.spill/100); ctx2.drawImage(g,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 3) a PEÇA (com blend/opacidade do utilizador)
    ctx2.globalAlpha=MK.opacity; ctx2.globalCompositeOperation=MK.blend; ctx2.drawImage(layer,0,0);
    ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    // 4) REFLEXO do ambiente no acrílico (ambiente → peça)
    if(full && MK.reflect>0 && MK.scene){
      const r=document.createElement('canvas');r.width=w;r.height=h;const rx=r.getContext('2d');
      rx.filter='blur('+Math.max(2,0.012*mn)+'px)'; rx.drawImage(MK.scene,0,0,w,h);
      rx.filter='none'; rx.globalCompositeOperation='destination-in'; rx.drawImage(layer,0,0);
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=MK.reflect/100*0.5; ctx2.drawImage(r,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
  }
  window.renderMock=function(){
    const cv=$('mockCv'); if(!cv) return; const ctx2=cv.getContext('2d');
    ctx2.clearRect(0,0,MK.cw,MK.ch);
    if(MK.scene) ctx2.drawImage(MK.scene,0,0,MK.cw,MK.ch);
    if(MK.design) compositeDesignOnto(ctx2,1);
    drawHandles();
  };
  function drawHandles(){
    const ov=$('mockOv'); if(!ov) return; const o=ov.getContext('2d');
    o.clearRect(0,0,MK.cw,MK.ch);
    if(!MK.design||!MK.active) return;
    const c=currentCorners(); const k=1/(viewScale()||1);
    o.lineWidth=1.5*k; o.strokeStyle=MK.persp?'rgba(255,180,90,.95)':'rgba(90,172,200,.9)'; o.setLineDash([5*k,4*k]);
    o.beginPath();o.moveTo(c[0].x,c[0].y);for(let i=1;i<4;i++)o.lineTo(c[i].x,c[i].y);o.closePath();o.stroke();
    o.setLineDash([]);
    const rp=rotateHandlePt(), tm={x:(c[0].x+c[1].x)/2,y:(c[0].y+c[1].y)/2};
    o.beginPath();o.moveTo(tm.x,tm.y);o.lineTo(rp.x,rp.y);o.stroke();
    dot(o,rp.x,rp.y,6*k,'#5aacc8');
    c.forEach(p=>dot(o,p.x,p.y,5.5*k, MK.persp?'#ffb347':'#eaf6fb'));
  }
  function dot(o,x,y,r,fill){ o.beginPath();o.arc(x,y,r,0,Math.PI*2);o.fillStyle=fill;o.fill();o.lineWidth=1.5;o.strokeStyle='rgba(10,20,28,.85)';o.stroke(); }

  // ── view ──────────────────────────────────────────────────────────────────────
  function viewScale(){ const cv=$('mockCv'); if(!cv||!cv.width) return 1; const r=cv.getBoundingClientRect(); return r.width/cv.width; }
  function fitView(){
    const cv=$('mockCv'),wrap=$('mkWrap'),stage=$('mkStage'); if(!cv||!MK.cw) return;
    const s=Math.min((stage.clientWidth-40)/MK.cw,(stage.clientHeight-40)/MK.ch,1);
    cv.style.width=Math.round(MK.cw*s)+'px'; cv.style.height=Math.round(MK.ch*s)+'px';
    const ov=$('mockOv'); ov.style.width=cv.style.width; ov.style.height=cv.style.height;
    wrap.style.width=cv.style.width; wrap.style.height=cv.style.height;
  }
  window.addEventListener('resize',()=>{ if(MK.active){ fitView(); renderMock(); } });

  // ── interação ─────────────────────────────────────────────────────────────────
  function evPos(e){ const cv=$('mockOv'),r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*MK.cw, y:(e.clientY-r.top)/r.height*MK.ch}; }
  function hitTest(p){
    if(!MK.design) return null;
    const k=1/(viewScale()||1), tol=13*k;
    const rp=rotateHandlePt(); if(Math.hypot(p.x-rp.x,p.y-rp.y)<tol) return {type:'rotate'};
    const c=currentCorners();
    for(let i=0;i<4;i++) if(Math.hypot(p.x-c[i].x,p.y-c[i].y)<tol) return {type:'corner',corner:i};
    if(pointInQuad(p,c)) return {type:'move'};
    return null;
  }
  function pointInQuad(p,q){ let inside=false; for(let i=0,j=3;i<4;j=i++){ const xi=q[i].x,yi=q[i].y,xj=q[j].x,yj=q[j].y; if(((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi)) inside=!inside; } return inside; }

  function onDown(e){
    if(!MK.design) return; const p=evPos(e),hit=hitTest(p); if(!hit) return; e.preventDefault();
    MK.dragging=true;
    MK.drag={ ...hit, sx:p.x,sy:p.y, ox:MK.x,oy:MK.y, sScale:MK.scaleMul, sRot:MK.rot,
      dist0:Math.hypot(p.x-MK.x,p.y-MK.y), ang0:Math.atan2(p.y-MK.y,p.x-MK.x),
      quad0: MK.quad?MK.quad.map(q=>({...q})):null };
    $('mockOv').setPointerCapture(e.pointerId);
  }
  function onMove(e){
    if(!MK.drag) return; const p=evPos(e),d=MK.drag;
    if(d.type==='move'){
      const dx=p.x-d.sx, dy=p.y-d.sy;
      if(MK.persp&&d.quad0){ MK.quad=d.quad0.map(q=>({x:q.x+dx,y:q.y+dy})); }
      else { MK.x=d.ox+dx; MK.y=d.oy+dy; }
    } else if(d.type==='corner'){
      if(MK.persp){ MK.quad[d.corner]={x:p.x,y:p.y}; }          // canto livre (distorção)
      else { const dist=Math.hypot(p.x-MK.x,p.y-MK.y); let f=dist/(d.dist0||1); if(!isFinite(f)||f<=0)f=.01; MK.scaleMul=Math.max(.02,Math.min(8,d.sScale*f)); }
    } else if(d.type==='rotate'){
      const c=MK.persp?centroid(MK.quad):{x:MK.x,y:MK.y};
      const ang=Math.atan2(p.y-c.y,p.x-c.x);
      let nrot=d.sRot+(ang-d.ang0); if(e.shiftKey){ const st=Math.PI/12; nrot=Math.round(nrot/st)*st; }
      if(MK.persp&&d.quad0){ const da=nrot-d.sRot, co=Math.cos(da),si=Math.sin(da); MK.quad=d.quad0.map(q=>{const dx=q.x-c.x,dy=q.y-c.y;return{x:c.x+dx*co-dy*si,y:c.y+dx*si+dy*co};}); }
      MK.rot=nrot;
    }
    syncProps(); renderMock();
  }
  function onUp(e){ if(MK.drag){ MK.drag=null; MK.dragging=false; try{$('mockOv').releasePointerCapture(e.pointerId);}catch(_){ } renderMock(); } }
  function bindStage(){ const ov=$('mockOv'); ov.addEventListener('pointerdown',onDown); ov.addEventListener('pointermove',onMove); ov.addEventListener('pointerup',onUp); ov.addEventListener('pointercancel',onUp); }

  // ── composição das 3 saídas (resolução nativa) ──────────────────────────────────
  // WALL: cena + design (perspetiva/máscara/acabamento)
  function buildWallCanvas(){
    const NW=MK.nativeW||MK.cw, NH=MK.nativeH||MK.ch, ratio=NW/MK.cw;
    const ex=document.createElement('canvas');ex.width=NW;ex.height=NH;const ec=ex.getContext('2d');
    ec.imageSmoothingEnabled=true; ec.imageSmoothingQuality='high';
    ec.drawImage(MK.scene,0,0,NW,NH);
    if(MK.design){ const wd=MK.dragging; MK.dragging=false; compositeDesignOnto(ec,ratio); MK.dragging=wd; }
    return ex;
  }
  // FRONT: só o design (forma+acabamento), fundo transparente, ao tamanho/orientação escolhidos
  function frontDims(){
    const A={a4:[210,297],a3:[297,420],a2:[420,594]};
    let mm = MK.size==='custom' ? [(MK.customW||30)*10,(MK.customH||30)*10] : (A[MK.size]||A.a3);
    let wmm=mm[0],hmm=mm[1];
    if(MK.orient==='h'){ const a=Math.max(wmm,hmm),b=Math.min(wmm,hmm); wmm=a;hmm=b; } else { const a=Math.min(wmm,hmm),b=Math.max(wmm,hmm); wmm=a;hmm=b; }
    const px=v=>Math.round(v*300/25.4); return [px(wmm),px(hmm)];
  }
  function buildFrontCanvas(){
    const [fw,fh]=frontDims();
    const c=document.createElement('canvas');c.width=fw;c.height=fh;const x=c.getContext('2d');
    const img=MK.finished||MK.masked;
    if(img){ const s=Math.min(fw/img.width,fh/img.height)*0.92, w=img.width*s,h=img.height*s; x.drawImage(img,(fw-w)/2,(fh-h)/2,w,h); }
    return c; // fundo transparente
  }
  // DETAIL: close-up do canto inferior-direito da placa (borda/translucidez)
  function buildDetailCanvas(){
    const wall=buildWallCanvas(), ratio=wall.width/MK.cw;
    const q=currentCorners()||[{x:MK.cw*.3,y:MK.ch*.3},{x:MK.cw*.7,y:MK.ch*.3},{x:MK.cw*.7,y:MK.ch*.7},{x:MK.cw*.3,y:MK.ch*.7}];
    const cn=q[2], topW=Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y);
    const sz=Math.max(120,topW*0.55)*ratio;
    let sx=Math.min(Math.max(0,cn.x*ratio-sz*0.62), wall.width-sz);
    let sy=Math.min(Math.max(0,cn.y*ratio-sz*0.62), wall.height-sz);
    const OUT=1200, out=document.createElement('canvas');out.width=OUT;out.height=OUT;
    const oc=out.getContext('2d'); oc.imageSmoothingEnabled=true; oc.imageSmoothingQuality='high';
    oc.drawImage(wall, sx,sy,sz,sz, 0,0,OUT,OUT);
    return out;
  }
  function saveCanvas(cv, name){
    return new Promise(res=>cv.toBlob(async blob=>{
      if(window.showSaveFilePicker){
        try{ const fh=await window.showSaveFilePicker({suggestedName:name,types:[{description:'PNG',accept:{'image/png':['.png']}}],id:'auron-mock',startIn:'desktop'}); const w=await fh.createWritable(); await w.write(blob); await w.close(); return res(); }
        catch(err){ if(err.name==='AbortError') return res(); }
      }
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000); res();
    },'image/png'));
  }
  // export único (a saída atualmente visível = wall)
  window.mockExport=async function(){
    if(!MK.scene){ alert('Carrega uma cena primeiro.'); return; }
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    await saveCanvas(buildWallCanvas(), `${MK.sceneName||'mockup'}_wall_${stamp}.png`);
  };
  // exportar conjunto front+wall+detail de uma vez
  window.mockExportSet=async function(){
    if(!MK.scene){ alert('Carrega cena/template primeiro.'); return; }
    if(!MK.design){ alert('Traz um design primeiro (Usar design atual / Carregar PNG).'); return; }
    const colid=(prompt('ID da coleção (ex.: atl):','col')||'col').trim();
    const n=(prompt('Número da peça:','1')||'1').trim();
    const items=[['front',buildFrontCanvas()],['wall',buildWallCanvas()],['detail',buildDetailCanvas()]];
    if(window.showDirectoryPicker){
      let dir; try{ dir=await window.showDirectoryPicker({id:'auron-mockset'}); }catch(e){ if(e.name==='AbortError') return; }
      for(const [tag,cv] of items){ const blob=await new Promise(r=>cv.toBlob(r,'image/png')); const fh=await dir.getFileHandle(`${colid}-${n}-${tag}.png`,{create:true}); const w=await fh.createWritable(); await w.write(blob); await w.close(); }
      alert('Conjunto exportado: '+colid+'-'+n+'-front/wall/detail.png');
    } else {
      for(const [tag,cv] of items){ await saveCanvas(cv, `${colid}-${n}-${tag}.png`); await new Promise(r=>setTimeout(r,250)); }
    }
  };

  // ── biblioteca de templates (IndexedDB) ────────────────────────────────────
  const DB='auronMockups', STORE='templates';
  function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE,{keyPath:'id'}); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function tplPut(t){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(t); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function tplAll(){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); }); }
  async function tplDel(id){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }

  function sceneToDataURL(){ const c=document.createElement('canvas');c.width=MK.nativeW;c.height=MK.nativeH;c.getContext('2d').drawImage(MK.scene,0,0,MK.nativeW,MK.nativeH);return c.toDataURL('image/jpeg',0.9); }
  function makeThumb(){ const sc=Math.min(260/MK.cw,260/MK.ch,1); const t=document.createElement('canvas');t.width=Math.round(MK.cw*sc);t.height=Math.round(MK.ch*sc);t.getContext('2d').drawImage($('mockCv'),0,0,t.width,t.height);return t.toDataURL('image/jpeg',0.72); }

  window.mockSaveTemplate=async function(){
    if(!MK.scene){ alert('Carrega uma cena primeiro.'); return; }
    const name=prompt('Nome do template:', MK.sceneName||'Template'); if(name===null) return;
    const type=(prompt('Tipo: wall / room / detail','wall')||'wall').toLowerCase().trim();
    const q=currentCorners(); const quadN=q.map(p=>({x:p.x/MK.cw, y:p.y/MK.ch}));
    const t={ id:'t'+Date.now(), name, type, created:Date.now(),
      scene:sceneToDataURL(), nativeW:MK.nativeW, nativeH:MK.nativeH,
      quadN, mask:MK.mask, maskRadius:MK.maskRadius, blend:MK.blend, opacity:MK.opacity,
      finish:MK.finish, orient:MK.orient, size:MK.size, customW:MK.customW, customH:MK.customH,
      spill:MK.spill, shadow:MK.shadow, shadowAngle:MK.shadowAngle, reflect:MK.reflect,
      thumb:makeThumb() };
    try{ await tplPut(t); renderLib(); }catch(e){ alert('Erro a guardar: '+e.message); }
  };

  window.mockApplyTemplate=async function(id){
    let all; try{ all=await tplAll(); }catch(e){ return; }
    const t=all.find(x=>x.id===id); if(!t) return;
    const img=new Image();
    img.onload=()=>{
      MK.scene=img; MK.sceneName=t.name;
      MK.nativeW=t.nativeW||img.naturalWidth; MK.nativeH=t.nativeH||img.naturalHeight;
      const s=Math.min(1,WORK_MAX/Math.max(MK.nativeW,MK.nativeH));
      MK.cw=Math.round(MK.nativeW*s); MK.ch=Math.round(MK.nativeH*s);
      $('mockCv').width=MK.cw;$('mockCv').height=MK.ch;$('mockOv').width=MK.cw;$('mockOv').height=MK.ch;
      $('mkEmpty').style.display='none';
      MK.mask=t.mask; MK.maskRadius=(t.maskRadius!=null?t.maskRadius:0); MK.blend=t.blend; MK.opacity=(t.opacity!=null?t.opacity:1);
      MK.finish=t.finish||'none'; MK.orient=t.orient||'v'; MK.size=t.size||'a3'; MK.customW=t.customW||30; MK.customH=t.customH||30;
      MK.spill=t.spill||0; MK.shadow=t.shadow||0; MK.shadowAngle=(t.shadowAngle!=null?t.shadowAngle:135); MK.reflect=t.reflect||0;
      MK.persp=true; MK.quad=t.quadN.map(p=>({x:p.x*MK.cw, y:p.y*MK.ch}));
      if(MK.design) buildMasked();
      // sincronizar UI
      $('mkMask').value=MK.mask; $('mkRadiusRow').style.display=shapeHasCorners()?'':'none';
      $('mkRadius').value=MK.maskRadius; $('mkRadiusV').textContent=Math.round(MK.maskRadius);
      if($('mkFinish'))$('mkFinish').value=MK.finish; if($('mkOrient'))$('mkOrient').value=MK.orient;
      if($('mkSize')){ $('mkSize').value=MK.size; $('mkCustomRow').style.display=(MK.size==='custom')?'':'none'; }
      if($('mkCustomW'))$('mkCustomW').value=MK.customW; if($('mkCustomH'))$('mkCustomH').value=MK.customH;
      [['mkSpill','spill'],['mkShadow','shadow'],['mkShAng','shadowAngle'],['mkReflect','reflect']].forEach(([el2,k])=>{const s=$(el2);if(s){s.value=MK[k];const v=$(el2+'V');if(v)v.textContent=Math.round(MK[k]);}});
      syncProps(); fitView(); renderMock(); mockCloseLib();
    };
    img.src=t.scene;
  };

  let _libToken=0;
  window.renderLib=async function(){
    const grid=$('mkLibGrid'); if(!grid) return;
    const tok=++_libToken;
    let all; try{ all=await tplAll(); }catch(e){ grid.innerHTML='<div class="mk-hint">IndexedDB indisponível.</div>'; return; }
    if(tok!==_libToken) return;       // outro render mais recente em curso → aborta
    grid.innerHTML='';
    all.sort((a,b)=>b.created-a.created);
    if(!all.length){ grid.innerHTML='<div class="mk-hint">Ainda não há templates. Monta um mockup (cena + placa) e clica “Guardar atual”.</div>'; return; }
    all.forEach(t=>{
      const card=document.createElement('div');card.className='mk-card';
      const im=document.createElement('img');im.src=t.thumb;im.title='Aplicar';im.onclick=()=>mockApplyTemplate(t.id);
      const lbl=document.createElement('div');lbl.className='mk-cardlbl';lbl.textContent=t.name+' · '+t.type;
      const del=document.createElement('button');del.className='mk-del';del.textContent='✕';del.title='Apagar';
      del.onclick=async e=>{ e.stopPropagation(); if(confirm('Apagar template “'+t.name+'”?')){ await tplDel(t.id); renderLib(); } };
      card.append(im,lbl,del); grid.appendChild(card);
    });
  };
  window.mockOpenLib=function(){ $('mkLib').hidden=false; renderLib(); };
  window.mockCloseLib=function(){ $('mkLib').hidden=true; };

  if(document.readyState!=='loading') bindStage();
  else document.addEventListener('DOMContentLoaded',bindStage);
})();
