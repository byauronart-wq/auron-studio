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
    fillPanel:false, domColor:'rgb(210,210,210)',   // preencher placa com a cor da arte
    spill:0, shadow:0, shadowSize:35, shadowAngle:135, reflect:0,  // V5 realismo
    translucency:20, reflectAngle:135, glassFrost:false,           // vidro translúcido
    thickness:30,                                                  // espessura do acrílico (5mm look)
    beamOn:false, beam:55, beamAngle:60, beamPos:50, beamWidth:40, beamSoft:55, // faixa de luz de janela sobre a placa
    env:60,                                                        // ambiente: luz/sombra da divisão + reflexo de sala na placa brilhante
    orient:'v', size:'a3', customW:30, customH:30,  // predefinições de saída (front)
    cw:0, ch:0, nativeW:0, nativeH:0,
    active:false, drag:null, selected:false,
    zoom:1, panX:0, panY:0,                                        // zoom/pan da workspace
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
      $('mkEmpty').style.display='none'; MK.zoom=1;MK.panX=0;MK.panY=0;
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
    MK.design={src,w,h}; MK.selected=true;
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
  // desenha o caminho da forma atual num contexto (para fill/stroke/clip)
  function shapePath(x,w,h){
    const sh=MK.mask, rad=(MK.maskRadius/100);
    if(sh==='ellipse'){ x.beginPath();x.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2); }
    else if(sh==='circle'){ x.beginPath();x.arc(w/2,h/2,Math.min(w,h)/2,0,Math.PI*2); }
    else if(sh==='square'){ const s=Math.min(w,h); rr(x,(w-s)/2,(h-s)/2,s,s,s*rad); }
    else { rr(x,0,0,w,h,Math.min(w,h)*rad); } // rect/round
  }
  // cor dominante da arte (média ponderada pelo alpha) — p/ "preencher placa"
  function computeDom(){
    if(!MK.design){ MK.domColor='rgb(210,210,210)'; return; }
    const t=document.createElement('canvas');t.width=40;t.height=40;const x=t.getContext('2d');
    x.drawImage(MK.design.src,0,0,40,40);
    const d=x.getImageData(0,0,40,40).data; let r=0,g=0,b=0,a=0;
    for(let i=0;i<d.length;i+=4){ const al=d[i+3]/255; r+=d[i]*al; g+=d[i+1]*al; b+=d[i+2]*al; a+=al; }
    MK.domColor = a<1 ? 'rgb(210,210,210)' : 'rgb('+Math.round(r/a)+','+Math.round(g/a)+','+Math.round(b/a)+')';
  }
  // formas com cantos: rect e square aceitam raio (0 = cantos normais, >0 = arredondados)
  function buildMasked(){
    if(!MK.design){ MK.masked=null; MK.finished=null; MK.shapeMask=null; return; }
    const w=MK.design.w,h=MK.design.h;
    computeDom();
    // máscara da FORMA (alpha da placa, independente da arte)
    const sm=document.createElement('canvas');sm.width=w;sm.height=h;const smx=sm.getContext('2d');
    smx.fillStyle='#fff'; shapePath(smx,w,h); smx.fill();
    // feather leve da borda: elimina pixeis duros/serrilhados contra a parede
    const fpx=Math.max(0.8, Math.min(w,h)*0.0022);
    const smf=document.createElement('canvas');smf.width=w;smf.height=h;const smfx=smf.getContext('2d');
    smfx.filter='blur('+fpx+'px)'; smfx.drawImage(sm,0,0); smfx.filter='none';
    MK.shapeMask=smf;
    // arte recortada à forma
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    x.drawImage(smf,0,0); x.globalCompositeOperation='source-in'; x.drawImage(MK.design.src,0,0,w,h);
    MK.masked=c; buildFinished();
  }
  // acabamento — VIDRO TRANSLÚCIDO: arte FIEL (sem véu) + borda; reflexo é feito ao vivo (compositeDesignOnto)
  function buildFinished(){
    if(!MK.masked){ MK.finished=null; return; }
    if(MK.finish==='none'||!MK.finish){ MK.finished=MK.masked; return; }
    const w=MK.masked.width,h=MK.masked.height, mn=Math.min(w,h);
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');

    // 1) CORPO da placa (sob a arte): preencher c/ cor (opcional), vidro fosco (opcional) ou NADA (vidro claro)
    if(MK.fillPanel||MK.glassFrost){
      x.drawImage(MK.shapeMask,0,0); x.globalCompositeOperation='source-in';
      if(MK.fillPanel){ x.globalAlpha=0.92; x.fillStyle=MK.domColor||'#cccccc'; x.fillRect(0,0,w,h); x.globalAlpha=1; }
      else { x.fillStyle='rgba(248,250,252,.16)'; x.fillRect(0,0,w,h); } // fosco
      x.globalCompositeOperation='source-over';
    }
    // 2) glow interior (lightbox) — antes da arte
    if(MK.finish==='lightbox'){
      const g=document.createElement('canvas');g.width=w;g.height=h;const gx=g.getContext('2d');
      gx.filter='blur('+Math.max(2,Math.round(mn*0.04))+'px)'; gx.drawImage(MK.masked,0,0);
      x.globalCompositeOperation='screen'; x.drawImage(g,0,0); x.globalCompositeOperation='source-over';
    }
    // 3) a ARTE — fiel ao print (sem overlays a lavar a cor)
    x.drawImage(MK.masked,0,0);
    if(MK.finish==='lightbox'){ x.globalCompositeOperation='source-atop'; x.fillStyle='rgba(255,250,235,.10)'; x.fillRect(0,0,w,h); x.globalCompositeOperation='source-over'; }

    // 4) BORDA/bisel do acrílico — contorno definido (aresta polida) clipado à forma
    x.save(); shapePath(x,w,h); x.clip();
    // bisel claro interior largo (a espessura do acrílico a apanhar luz)
    shapePath(x,w,h); x.lineWidth=Math.max(2,mn*0.013); x.strokeStyle='rgba(255,255,255,.26)'; x.stroke();
    // contorno exterior fino e definido (aresta de corte)
    shapePath(x,w,h); x.lineWidth=Math.max(1.5,mn*0.005); x.strokeStyle='rgba(18,20,24,.42)'; x.stroke();
    x.restore();
    MK.finished=c;
  }
  function shapeHasCorners(){ return MK.mask==='rect'||MK.mask==='square'||MK.mask==='round'; }
  function setUI(id,val){ const s=$(id); if(s)s.value=val; const v=$(id+'V'); if(v)v.textContent=Math.round(val); }
  window.mockSetMask=function(shape){ mkSnapshot(); MK.mask=shape; buildMasked(); $('mkRadiusRow').style.display=shapeHasCorners()?'':'none'; renderMock(); };
  window.mockSetRadius=function(v){ mkSnapshot(); MK.maskRadius=+v; $('mkRadiusV').textContent=Math.round(v); buildMasked(); renderMock(); };
  window.mockSetFinish=function(v){
    mkSnapshot(true); MK.finish=v; buildFinished();
    // realismo base ao escolher (se ainda a zero) — vidro claro, cor fiel
    if(v==='acrylic'){ MK.shadow=30; MK.reflect=16; MK.spill=0; MK.translucency=6; MK.env=60; }
    else if(v==='lightbox'){ if(MK.spill===0)MK.spill=45; if(MK.shadow===0)MK.shadow=15; if(MK.reflect===0)MK.reflect=15; MK.env=35; }
    else if(v==='none'){ MK.env=0; }
    setUI('mkSpill',MK.spill); setUI('mkShadow',MK.shadow); setUI('mkReflect',MK.reflect); setUI('mkTransl',MK.translucency); setUI('mkEnv',MK.env);
    renderMock();
  };
  window.mockSetTranslucency=function(v){ mkSnapshot(); MK.translucency=+v; $('mkTranslV').textContent=Math.round(v); renderMock(); };
  window.mockSetReflectAngle=function(v){ mkSnapshot(); MK.reflectAngle=+v; $('mkRefAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetThickness=function(v){ mkSnapshot(); MK.thickness=+v; $('mkThickV').textContent=Math.round(v); renderMock(); };
  window.mockToggleFrost=function(){ mkSnapshot(true); MK.glassFrost=!MK.glassFrost; buildFinished(); const b=$('mkFrostBtn'); if(b){b.classList.toggle('on',MK.glassFrost);b.textContent=MK.glassFrost?'Vidro: fosco':'Vidro fosco';} renderMock(); };
  window.mockSetSpill=function(v){ mkSnapshot(); MK.spill=+v; $('mkSpillV').textContent=Math.round(v); renderMock(); };
  window.mockSetShadow=function(v){ mkSnapshot(); MK.shadow=+v; $('mkShadowV').textContent=Math.round(v); renderMock(); };
  window.mockSetShadowSize=function(v){ mkSnapshot(); MK.shadowSize=+v; $('mkShSizeV').textContent=Math.round(v); renderMock(); };
  window.mockSetShadowAngle=function(v){ mkSnapshot(); MK.shadowAngle=+v; $('mkShAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetReflect=function(v){ mkSnapshot(); MK.reflect=+v; $('mkReflectV').textContent=Math.round(v); renderMock(); };
  window.mockSetEnv=function(v){ mkSnapshot(); MK.env=+v; $('mkEnvV').textContent=Math.round(v); renderMock(); };
  window.mockToggleBeam=function(){ mkSnapshot(true); MK.beamOn=!MK.beamOn; const b=$('mkBeamBtn'); if(b){b.classList.toggle('on',MK.beamOn); b.textContent=MK.beamOn?'Luz de janela: ligada':'Luz de janela';} const r=$('mkBeamRows'); if(r)r.style.display=MK.beamOn?'':'none'; renderMock(); };
  window.mockSetBeam=function(v){ mkSnapshot(); MK.beam=+v; $('mkBeamV').textContent=Math.round(v); renderMock(); };
  window.mockSetBeamAngle=function(v){ mkSnapshot(); MK.beamAngle=+v; $('mkBeamAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetBeamPos=function(v){ mkSnapshot(); MK.beamPos=+v; $('mkBeamPosV').textContent=Math.round(v); renderMock(); };
  window.mockSetBeamWidth=function(v){ mkSnapshot(); MK.beamWidth=+v; $('mkBeamWV').textContent=Math.round(v); renderMock(); };
  window.mockSetBeamSoft=function(v){ mkSnapshot(); MK.beamSoft=+v; $('mkBeamSV').textContent=Math.round(v); renderMock(); };
  // alinha a faixa de luz com a direção da luz detetada na cena
  window.mockAutoBeam=function(){
    if(!MK.scene){ alert('Carrega uma cena primeiro.'); return; }
    mkSnapshot(true);
    const N=56, c=document.createElement('canvas');c.width=N;c.height=N;const x=c.getContext('2d');
    x.drawImage(MK.scene,0,0,N,N);
    const d=x.getImageData(0,0,N,N).data;
    let sw=0,cxb=0,cyb=0;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){ const p=(j*N+i)*4; let b=(0.299*d[p]+0.587*d[p+1]+0.114*d[p+2])/255; b=b*b*b; sw+=b; cxb+=b*(i+0.5); cyb+=b*(j+0.5); }
    if(!MK.beamOn){ MK.beamOn=true; const btn=$('mkBeamBtn'); if(btn){btn.classList.add('on');btn.textContent='Luz de janela: ligada';} const r=$('mkBeamRows'); if(r)r.style.display=''; }
    if(sw>1e-6){
      const vx=(cxb/sw)/N-0.5, vy=(cyb/sw)/N-0.5, mag=Math.hypot(vx,vy);   // vetor centro→luz
      if(mag<0.02){ MK.beamAngle=60; MK.beamPos=50; }
      else { MK.beamAngle=((Math.atan2(vy,vx)*180/Math.PI-90)%360+360)%360; MK.beamPos=62; }
    }
    [['mkBeamAng','beamAngle'],['mkBeamPos','beamPos']].forEach(([el,k])=>{const s=$(el);if(s){s.value=MK[k];const v=$(el+'V');if(v)v.textContent=Math.round(MK[k]);}});
    renderMock();
  };
  window.mockRotate90=function(){
    if(!MK.design) return; mkSnapshot(true);
    if(MK.persp&&MK.quad){ const c=centroid(MK.quad); MK.quad=MK.quad.map(p=>({x:c.x-(p.y-c.y), y:c.y+(p.x-c.x)})); }
    else { MK.rot+=Math.PI/2; }
    syncAllUI(); renderMock();
  };
  window.mockFlipH=function(){ // espelhar na horizontal — útil p/ trocar o lado da vista lateral
    if(!MK.design) return; mkSnapshot(true);
    if(!MK.persp){ MK.persp=true; MK.quad=designCorners(); }
    const c=centroid(MK.quad); MK.quad=MK.quad.map(p=>({x:2*c.x-p.x, y:p.y}));
    // repõe a ordem dos cantos [TL,TR,BR,BL] após o espelho
    MK.quad=[MK.quad[1],MK.quad[0],MK.quad[3],MK.quad[2]];
    syncAllUI(); renderMock();
  };
  // vista lateral rápida: encolhe um lado da placa (perspetiva 3/4)
  window.mockSideView=function(dir){
    if(!MK.design) return; mkSnapshot(true);
    if(!MK.persp||!MK.quad){ MK.persp=true; MK.quad=designCorners(); }
    const c=centroid(MK.quad), k=0.62;
    // encolhe verticalmente os 2 cantos do lado escolhido (dir: 'l' encolhe esquerda, 'r' direita)
    const idx = dir==='l'?[0,3]:[1,2];
    idx.forEach(i=>{ MK.quad[i]={x:MK.quad[i].x, y:c.y+(MK.quad[i].y-c.y)*k}; });
    $('mkPerspBtn').classList.add('on'); $('mkPerspBtn').textContent='Perspetiva: ON';
    syncAllUI(); renderMock();
  };
  window.mockToggleFill=function(){ mkSnapshot(true); MK.fillPanel=!MK.fillPanel; buildFinished(); const b=$('mkFillBtn'); if(b){b.classList.toggle('on',MK.fillPanel); b.textContent=MK.fillPanel?'Placa: cor da arte':'Preencher placa';} renderMock(); };
  window.mockSetOrient=function(v){ MK.orient=v; };
  window.mockSetSize=function(v){ MK.size=v; $('mkCustomRow').style.display=(v==='custom')?'':'none'; };
  window.mockSetCustom=function(which,v){ if(which==='w')MK.customW=+v; else MK.customH=+v; };
  // sincroniza TODA a UI a partir do estado MK (usado no undo e ao aplicar template)
  function syncAllUI(){
    setUI('mkOpacity',Math.round(MK.opacity*100)); setUI('mkScale',Math.round(MK.scaleMul*100)); setUI('mkRot',Math.round(MK.rot*180/Math.PI));
    setUI('mkRadius',MK.maskRadius); setUI('mkSpill',MK.spill); setUI('mkShadow',MK.shadow); setUI('mkShSize',MK.shadowSize); setUI('mkShAng',MK.shadowAngle); setUI('mkReflect',MK.reflect); setUI('mkRefAng',MK.reflectAngle); setUI('mkTransl',MK.translucency); setUI('mkThick',MK.thickness);
    if($('mkFrostBtn')){ $('mkFrostBtn').classList.toggle('on',MK.glassFrost); $('mkFrostBtn').textContent=MK.glassFrost?'Vidro: fosco':'Vidro fosco'; }
    if($('mkBlend'))$('mkBlend').value=MK.blend; if($('mkMask'))$('mkMask').value=MK.mask; if($('mkFinish'))$('mkFinish').value=MK.finish;
    if($('mkOrient'))$('mkOrient').value=MK.orient; if($('mkSize'))$('mkSize').value=MK.size;
    if($('mkRadiusRow'))$('mkRadiusRow').style.display=shapeHasCorners()?'':'none';
    if($('mkPerspBtn')){ $('mkPerspBtn').classList.toggle('on',MK.persp); $('mkPerspBtn').textContent=MK.persp?'Perspetiva: ON':'Perspetiva'; }
    if($('mkFillBtn')){ $('mkFillBtn').classList.toggle('on',MK.fillPanel); $('mkFillBtn').textContent=MK.fillPanel?'Placa: cor da arte':'Preencher placa'; }
  }
  // ── UNDO (Ctrl/Cmd+Z, só na aba Mockups) ──────────────────────────────────────
  let _undo=[], _lastSnap=0;
  function mkSerial(){ return JSON.stringify({x:MK.x,y:MK.y,baseScale:MK.baseScale,scaleMul:MK.scaleMul,rot:MK.rot,opacity:MK.opacity,blend:MK.blend,persp:MK.persp,quad:MK.quad,mask:MK.mask,maskRadius:MK.maskRadius,finish:MK.finish,fillPanel:MK.fillPanel,glassFrost:MK.glassFrost,translucency:MK.translucency,thickness:MK.thickness,spill:MK.spill,shadow:MK.shadow,shadowSize:MK.shadowSize,shadowAngle:MK.shadowAngle,reflect:MK.reflect,reflectAngle:MK.reflectAngle}); }
  function mkSnapshot(force){ if(!MK.design)return; const now=Date.now(); if(!force && now-_lastSnap<600) return; _lastSnap=now; _undo.push(mkSerial()); if(_undo.length>60)_undo.shift(); }
  window.mockUndo=function(){ if(!_undo.length) return; const s=JSON.parse(_undo.pop()); Object.assign(MK,s); if(MK.quad)MK.quad=MK.quad.map(p=>({x:p.x,y:p.y})); buildMasked(); syncAllUI(); MK.selected=true; renderMock(); };

  // ── perspetiva ────────────────────────────────────────────────────────────────
  window.mockTogglePersp=function(){
    if(!MK.design) return;
    mkSnapshot(true);
    MK.persp=!MK.persp;
    if(MK.persp) MK.quad=designCorners();   // arranca dos cantos afins atuais
    else MK.quad=null;
    $('mkPerspBtn').classList.toggle('on',MK.persp);
    $('mkPerspBtn').textContent=MK.persp?'Perspetiva: ON':'Perspetiva';
    renderMock();
  };

  // ── propriedades ──────────────────────────────────────────────────────────────
  window.mockSet=function(prop,val){
    mkSnapshot();
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
  function renderLayerOf(img,w,h,ratio){
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    if(!img) return c;
    if(MK.persp&&MK.quad){ drawWarped(x, img, MK.quad.map(p=>({x:p.x*ratio,y:p.y*ratio})), MK.dragging?14:(ratio>1?40:24)); }
    else { x.save(); x.translate(MK.x*ratio,MK.y*ratio); x.rotate(MK.rot); const s=effScale()*ratio,dw=MK.design.w*s,dh=MK.design.h*s; x.drawImage(img,-dw/2,-dh/2,dw,dh); x.restore(); }
    return c;
  }
  function renderDesignLayer(w,h,ratio){ return renderLayerOf(MK.finished||MK.masked,w,h,ratio); }
  // a placa como retângulo SÓLIDO (forma), p/ sombra e reflexo definirem a peça mesmo com arte transparente
  function renderShapeLayer(w,h,ratio){ return renderLayerOf(MK.shapeMask,w,h,ratio); }
  // compõe a peça sobre a cena (ctx2) com realismo de luz (sombra + derrame + reflexo)
  function compositeDesignOnto(ctx2, ratio){
    if(!MK.design) return;
    const w=ctx2.canvas.width, h=ctx2.canvas.height;
    const layer=renderDesignLayer(w,h,ratio);
    const full=!MK.dragging; // durante o arrasto, salta efeitos pesados (fluidez)
    const mn=Math.min(w,h);
    // silhueta para a sombra: se há acabamento (placa física), usa o RETÂNGULO da placa; senão a arte
    const hasPanel=(MK.finish&&MK.finish!=='none'&&MK.shapeMask);
    const shadowSilh=hasPanel?renderShapeLayer(w,h,ratio):layer;
    // 1) SOMBRA (peça → ambiente) — INTENSIDADE (escuridão) e TAMANHO (área) independentes
    if(full && MK.shadow>0){
      const sz=(MK.shadowSize!=null?MK.shadowSize:35)/100;
      const sh=document.createElement('canvas');sh.width=w;sh.height=h;const sx=sh.getContext('2d');
      sx.drawImage(shadowSilh,0,0); sx.globalCompositeOperation='source-in'; sx.fillStyle='#000'; sx.fillRect(0,0,w,h);
      const ang=(MK.shadowAngle||135)*Math.PI/180, off=(0.004+0.07*sz)*mn;  // tamanho → afastamento
      const blur=Math.max(1.5,(0.004+0.06*sz)*mn);                          // tamanho → desfoque
      const b=document.createElement('canvas');b.width=w;b.height=h;const bx=b.getContext('2d');
      bx.filter='blur('+blur+'px)'; bx.drawImage(sh,Math.cos(ang)*off,Math.sin(ang)*off);
      // recorta a área da placa → a sombra só aparece ATRÁS/à volta (não através do vidro transparente)
      bx.filter='none'; bx.globalCompositeOperation='destination-out'; bx.drawImage(shadowSilh,0,0);
      // intensidade → opacidade (até bem escuro p/ sombras fortes e pequenas)
      ctx2.globalAlpha=Math.min(.95,MK.shadow/100*0.95); ctx2.drawImage(b,0,0); ctx2.globalAlpha=1;
    }
    // 2) DERRAME de luz / halo colorido (peça → ambiente) — contido, não "projetor"
    if(full && MK.spill>0){
      const g=document.createElement('canvas');g.width=w;g.height=h;const gx=g.getContext('2d');
      const blur=Math.max(5,(0.012+0.035*(MK.spill/100))*mn); // bem mais apertado que antes
      gx.filter='blur('+blur+'px)'; gx.drawImage(layer,0,0);
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=Math.min(0.85,MK.spill/100*0.85); ctx2.drawImage(g,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 2.5) ESPESSURA do acrílico (~5mm) — a aba lateral da placa, atrás da face frontal
    if(hasPanel && MK.thickness>0){
      const t=Math.max(3,(MK.thickness/100)*0.045*mn);           // espessura em px (mais presente)
      const ang=(MK.shadowAngle||135)*Math.PI/180;                // mesma direção da luz
      const tdx=Math.cos(ang), tdy=Math.sin(ang);
      const steps=Math.max(5,Math.round(t));
      const ed=document.createElement('canvas');ed.width=w;ed.height=h;const ex=ed.getContext('2d');
      // empilha cópias deslocadas da face → constrói o lado
      for(let k=1;k<=steps;k++){ const f=k/steps; ex.globalAlpha=1; ex.drawImage(layer, tdx*t*f, tdy*t*f); }
      // escurece o lado (vidro de canto) e remove a área da face frontal (fica só a aba)
      ex.globalCompositeOperation='source-atop'; ex.fillStyle='rgba(8,10,16,.5)'; ex.fillRect(0,0,w,h);
      ex.globalCompositeOperation='destination-out'; ex.drawImage(layer,0,0);
      ex.globalCompositeOperation='source-over';
      ctx2.globalAlpha=0.92; ctx2.drawImage(ed,0,0); ctx2.globalAlpha=1;
      // lip frontal claro (a aresta da frente a apanhar luz) no lado oposto
      const lip=document.createElement('canvas');lip.width=w;lip.height=h;const lx=lip.getContext('2d');
      lx.drawImage(layer,0,0); lx.globalCompositeOperation='destination-out'; lx.drawImage(layer,-tdx*Math.max(1.5,t*0.12),-tdy*Math.max(1.5,t*0.12));
      lx.globalCompositeOperation='source-atop'; lx.fillStyle='rgba(255,255,255,.5)'; lx.fillRect(0,0,w,h);
      ctx2.globalCompositeOperation='lighter'; ctx2.globalAlpha=0.6; ctx2.drawImage(lip,0,0); ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 3) a PEÇA — translucidez deixa ver a parede através da cor (mantendo a cor fiel)
    const transl=(MK.finish&&MK.finish!=='none'&&!MK.fillPanel)?(MK.translucency||0)/100*0.7:0;
    ctx2.globalAlpha=MK.opacity*(1-transl); ctx2.globalCompositeOperation=MK.blend; ctx2.drawImage(layer,0,0);
    ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    // 3.5) AMBIENTE — a placa apanha a luz E as sombras da parede (raios de janela, folhagem…)
    //      e, sendo acrílico brilhante, reflete suavemente a sala. Tudo derivado da própria cena.
    if(full && MK.scene && MK.finish && MK.finish!=='none' && MK.env>0){
      const clipL=hasPanel?renderShapeLayer(w,h,ratio):layer;
      const amt=MK.env/100;
      // recorte da parede exatamente sob a placa, ligeiramente suavizado
      const env=document.createElement('canvas');env.width=w;env.height=h;const ex2=env.getContext('2d');
      ex2.filter='blur('+Math.max(1,0.003*mn)+'px)'; ex2.drawImage(MK.scene,0,0,w,h); ex2.filter='none';
      ex2.globalCompositeOperation='destination-in'; ex2.drawImage(clipL,0,0); ex2.globalCompositeOperation='source-over';
      // luz + sombra da divisão moduladas na face (soft-light: escurece nas sombras, clareia na luz)
      ctx2.globalCompositeOperation='soft-light'; ctx2.globalAlpha=Math.min(0.85,amt*0.9); ctx2.drawImage(env,0,0);
      // reflexo de sala (vidro brilhante) — versão espelhada e desfocada, muito subtil
      const refl=document.createElement('canvas');refl.width=w;refl.height=h;const rf=refl.getContext('2d');
      rf.filter='blur('+Math.max(2,0.012*mn)+'px)'; rf.save(); rf.translate(0,h); rf.scale(1,-1); rf.drawImage(MK.scene,0,0,w,h); rf.restore(); rf.filter='none';
      rf.globalCompositeOperation='destination-in'; rf.drawImage(clipL,0,0); rf.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=Math.min(0.35,amt*0.22); ctx2.drawImage(refl,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 4) REFLEXO espelhado DIRECIONAL — faixa de brilho que VARRE com o ângulo, espelha a sala
    if(full && MK.reflect>0 && MK.scene){
      const panelA=hasPanel?renderShapeLayer(w,h,ratio):layer;        // recorte = placa toda
      const th=(MK.reflectAngle||135)*Math.PI/180, dx=Math.cos(th), dy=Math.sin(th);
      const cx=w/2, cy=h/2, LL=Math.hypot(w,h);
      const bw=0.17;                                                   // meia-largura da faixa
      // reflexo da SALA dentro da faixa direcional
      const r=document.createElement('canvas');r.width=w;r.height=h;const rx=r.getContext('2d');
      rx.filter='blur('+Math.max(1,0.005*mn)+'px)'; rx.drawImage(MK.scene,0,0,w,h); rx.filter='none';
      rx.globalCompositeOperation='destination-in';
      const g=rx.createLinearGradient(cx-dx*LL/2,cy-dy*LL/2,cx+dx*LL/2,cy+dy*LL/2);
      g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(Math.max(0,.5-bw),'rgba(255,255,255,0)');
      g.addColorStop(.5,'rgba(255,255,255,1)');g.addColorStop(Math.min(1,.5+bw),'rgba(255,255,255,0)');g.addColorStop(1,'rgba(255,255,255,0)');
      rx.fillStyle=g;rx.fillRect(0,0,w,h);
      rx.globalCompositeOperation='destination-in';rx.drawImage(panelA,0,0);rx.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=Math.min(.95,MK.reflect/100); ctx2.drawImage(r,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
      // núcleo especular branco (brilho de vidro) na mesma faixa
      const sp=document.createElement('canvas');sp.width=w;sp.height=h;const spx=sp.getContext('2d');
      spx.drawImage(panelA,0,0); spx.globalCompositeOperation='source-in';
      const g2=spx.createLinearGradient(cx-dx*LL/2,cy-dy*LL/2,cx+dx*LL/2,cy+dy*LL/2);
      g2.addColorStop(Math.max(0,.5-bw*0.45),'rgba(255,255,255,0)');g2.addColorStop(.5,'rgba(255,255,255,'+(0.6*MK.reflect/100)+')');g2.addColorStop(Math.min(1,.5+bw*0.45),'rgba(255,255,255,0)');
      spx.fillStyle=g2; spx.fillRect(0,0,w,h);
      ctx2.globalCompositeOperation='lighter'; ctx2.drawImage(sp,0,0); ctx2.globalCompositeOperation='source-over';
    }
    // 5) LUZ DE JANELA — faixa de sol que atravessa a placa (mesma que cai na parede)
    if(MK.beamOn && MK.beam>0){
      const clipL=(MK.finish&&MK.finish!=='none'&&MK.shapeMask)?renderShapeLayer(w,h,ratio):layer;
      const cx=w/2, cy=h/2, LL=Math.hypot(w,h);
      const th=(MK.beamAngle||60)*Math.PI/180;                 // direção do raio
      const nx=Math.cos(th+Math.PI/2), ny=Math.sin(th+Math.PI/2); // normal → varre a largura da faixa
      const bm=document.createElement('canvas');bm.width=w;bm.height=h;const bx=bm.getContext('2d');
      const g=bx.createLinearGradient(cx-nx*LL/2,cy-ny*LL/2,cx+nx*LL/2,cy+ny*LL/2);
      const t0=Math.max(0,Math.min(1,0.5+(MK.beamPos-50)/100));
      const hw=Math.max(0.02,MK.beamWidth/200);
      const soft=Math.max(0.03,(MK.beamSoft/100)*0.45+0.05);
      const a=Math.min(0.92,MK.beam/100);
      const cs=(p,al)=>{ p=Math.max(0,Math.min(1,p)); g.addColorStop(p,'rgba(255,248,232,'+al+')'); };
      cs(0,0); cs(t0-hw-soft,0); cs(t0-hw,a); cs(t0,a); cs(t0+hw,a); cs(t0+hw+soft,0); cs(1,0);
      bx.fillStyle=g; bx.fillRect(0,0,w,h);
      bx.globalCompositeOperation='destination-in'; bx.drawImage(clipL,0,0); bx.globalCompositeOperation='source-over';
      // wash quente e claro dentro da faixa (a superfície do acrílico a apanhar o sol)
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=1; ctx2.drawImage(bm,0,0);
      // um toque de contraste/brilho extra no núcleo da faixa
      ctx2.globalCompositeOperation='soft-light'; ctx2.globalAlpha=0.6; ctx2.drawImage(bm,0,0);
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
    if(!MK.design||!MK.active||!MK.selected) return;
    const c=currentCorners(); const k=1/(viewScale()||1);
    // GUIAS de perspetiva: prolonga as arestas da placa por toda a tela (alinhar com a parede)
    if(MK.persp){
      o.save(); o.lineWidth=1*k; o.strokeStyle='rgba(120,200,255,.28)'; o.setLineDash([2*k,6*k]);
      const ext=(a,b)=>{ const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,F=Math.max(MK.cw,MK.ch);
        o.beginPath();o.moveTo(a.x-ux*F,a.y-uy*F);o.lineTo(b.x+ux*F,b.y+uy*F);o.stroke(); };
      ext(c[0],c[1]); ext(c[3],c[2]); ext(c[0],c[3]); ext(c[1],c[2]); // 2 horizontais + 2 verticais
      o.restore();
    }
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
    const base=Math.min((stage.clientWidth-40)/MK.cw,(stage.clientHeight-40)/MK.ch,1);
    const s=base*(MK.zoom||1);
    cv.style.width=Math.round(MK.cw*s)+'px'; cv.style.height=Math.round(MK.ch*s)+'px';
    const ov=$('mockOv'); ov.style.width=cv.style.width; ov.style.height=cv.style.height;
    wrap.style.width=cv.style.width; wrap.style.height=cv.style.height;
    wrap.style.transform='translate('+(MK.panX||0)+'px,'+(MK.panY||0)+'px)';
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
    const p0=evPos(e);
    // PAN: clicar fora da peça com zoom ativo (ou botão do meio) → arrastar a vista
    const outside = !MK.design || !hitTest(p0);
    if(outside && ((MK.zoom||1)>1 || e.button===1)){
      e.preventDefault(); MK.drag={type:'pan',sx:e.clientX,sy:e.clientY,opx:MK.panX||0,opy:MK.panY||0};
      $('mockOv').setPointerCapture(e.pointerId); return;
    }
    if(!MK.design) return; let hit=hitTest(p0); const p=p0;
    if(!hit){ if(MK.selected){ MK.selected=false; renderMock(); } return; }  // clicar fora → desselecionar
    e.preventDefault();
    if(!MK.selected){ MK.selected=true; hit={type:'move'}; renderMock(); }    // 1º clique só seleciona+move
    mkSnapshot(true); MK.dragging=true;
    MK.drag={ ...hit, sx:p.x,sy:p.y, ox:MK.x,oy:MK.y, sScale:MK.scaleMul, sRot:MK.rot,
      dist0:Math.hypot(p.x-MK.x,p.y-MK.y), ang0:Math.atan2(p.y-MK.y,p.x-MK.x),
      quad0: MK.quad?MK.quad.map(q=>({...q})):null };
    $('mockOv').setPointerCapture(e.pointerId);
  }
  function onMove(e){
    if(!MK.drag) return; const d=MK.drag;
    if(d.type==='pan'){ MK.panX=d.opx+(e.clientX-d.sx); MK.panY=d.opy+(e.clientY-d.sy); fitView(); return; }
    const p=evPos(e);
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
  function onUp(e){ if(MK.drag){ const wasPan=MK.drag.type==='pan'; MK.drag=null; MK.dragging=false; try{$('mockOv').releasePointerCapture(e.pointerId);}catch(_){ } if(!wasPan)renderMock(); } }
  // ZOOM da workspace
  window.mockZoom=function(factor,cxClient,cyClient){
    const old=MK.zoom||1, nz=Math.max(0.4,Math.min(6, old*factor));
    if(nz===old) return;
    // manter o ponto sob o cursor ~fixo
    if(cxClient!=null){ const wrap=$('mkWrap'); const r=wrap.getBoundingClientRect();
      const ox=cxClient-(r.left+ (MK.panX||0)*0), oy=cyClient-r.top; // simplificado
      MK.panX=(MK.panX||0)-((cxClient-(r.left+r.width/2)))*(nz/old-1);
      MK.panY=(MK.panY||0)-((cyClient-(r.top+r.height/2)))*(nz/old-1);
    }
    MK.zoom=nz; fitView();
  };
  window.mockResetZoom=function(){ MK.zoom=1; MK.panX=0; MK.panY=0; fitView(); };
  function bindStage(){
    const ov=$('mockOv'); ov.addEventListener('pointerdown',onDown); ov.addEventListener('pointermove',onMove); ov.addEventListener('pointerup',onUp); ov.addEventListener('pointercancel',onUp);
    const stage=$('mkStage');
    stage.addEventListener('wheel',e=>{ if(!MK.active||!MK.scene) return; e.preventDefault(); mockZoom(e.deltaY<0?1.12:0.892, e.clientX, e.clientY); },{passive:false});
    stage.addEventListener('dblclick',e=>{ if(MK.active) mockResetZoom(); });
    // Ctrl/Cmd+Z → desfaz no módulo Mockups (em captura, antes do editor de Design)
    window.addEventListener('keydown',e=>{
      if(!MK.active) return;
      if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){ e.preventDefault(); e.stopPropagation(); mockUndo(); }
    },true);
  }
  // NOVO mockup — limpa cena/design
  window.mockNew=function(){
    if((MK.scene||MK.design) && !confirm('Novo mockup? A cena e o design atuais serão removidos.')) return;
    MK.scene=null;MK.design=null;MK.masked=null;MK.finished=null;MK.shapeMask=null;
    MK.persp=false;MK.quad=null;MK.selected=false;MK.zoom=1;MK.panX=0;MK.panY=0;_undo=[];
    const cv=$('mockCv'),ov=$('mockOv'); if(cv){cv.width=300;cv.height=200;} if(ov){ov.width=300;ov.height=200;}
    MK.cw=0;MK.ch=0; const e=$('mkEmpty'); if(e)e.style.display='';
    const ctx2=cv&&cv.getContext('2d'); if(ctx2)ctx2.clearRect(0,0,cv.width,cv.height);
    const o=ov&&ov.getContext('2d'); if(o)o.clearRect(0,0,ov.width,ov.height);
  };

  // LIMPAR MARCA IA — cobre o canto (por defeito inf. direito, onde o Gemini põe a estrela)
  // com um patch amostrado da parede adjacente, misturado nas bordas interiores.
  window.mockCleanCorner=function(corner){
    if(!MK.scene){ alert('Carrega uma cena primeiro.'); return; }
    corner=corner||'br';
    const NW=MK.nativeW||MK.scene.naturalWidth, NH=MK.nativeH||MK.scene.naturalHeight;
    const base=document.createElement('canvas'); base.width=NW; base.height=NH;
    const bx=base.getContext('2d'); bx.drawImage(MK.scene,0,0,NW,NH);
    const sz=Math.round(Math.min(NW,NH)*0.19);           // tamanho do patch
    const rx=(corner==='tr'||corner==='br')?NW-sz:0;      // canto destino
    const ry=(corner==='bl'||corner==='br')?NH-sz:0;
    // amostra da MESMA coluna, deslocada para dentro (preserva o gradiente de luz vertical)
    const insideY=(ry===0)? ry+Math.round(sz*1.25) : ry-Math.round(sz*1.25);
    const sy=Math.max(0,Math.min(NH-sz,insideY));
    const patch=document.createElement('canvas'); patch.width=sz; patch.height=sz;
    const px=patch.getContext('2d');
    px.drawImage(base, rx, sy, sz, sz, 0,0, sz,sz);
    // máscara: opaca no exterior (canto), a esbater nas bordas viradas para dentro
    const mask=document.createElement('canvas'); mask.width=sz; mask.height=sz;
    const mx=mask.getContext('2d'); mx.fillStyle='#fff'; mx.fillRect(0,0,sz,sz);
    const f=Math.round(sz*0.24); mx.globalCompositeOperation='destination-out';
    const towardX=(rx===0)? {a:sz,b:sz-f} : {a:0,b:f};   // borda interior no eixo X
    const towardY=(ry===0)? {a:sz,b:sz-f} : {a:0,b:f};   // borda interior no eixo Y
    let gX=mx.createLinearGradient(towardX.a,0,towardX.b,0);
    gX.addColorStop(0,'rgba(0,0,0,1)'); gX.addColorStop(1,'rgba(0,0,0,0)');
    mx.fillStyle=gX; mx.fillRect(0,0,sz,sz);
    let gY=mx.createLinearGradient(0,towardY.a,0,towardY.b);
    gY.addColorStop(0,'rgba(0,0,0,1)'); gY.addColorStop(1,'rgba(0,0,0,0)');
    mx.fillStyle=gY; mx.fillRect(0,0,sz,sz);
    mx.globalCompositeOperation='source-over';
    px.globalCompositeOperation='destination-in'; px.drawImage(mask,0,0); px.globalCompositeOperation='source-over';
    bx.drawImage(patch, rx, ry);
    const img=new Image();
    img.onload=function(){ MK.scene=img; if(MK.design) buildMasked(); renderMock(); };
    img.src=base.toDataURL('image/png');
  };

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
    const img=MK.finished||MK.masked; if(!img) return c;
    const mn=Math.min(fw,fh);
    const s=Math.min(fw/img.width,fh/img.height)*0.84, w=img.width*s,h=img.height*s, dx=(fw-w)/2, dy=(fh-h)/2;
    const ang=(MK.shadowAngle||135)*Math.PI/180, adx=Math.cos(ang), ady=Math.sin(ang);
    // sombra suave (a placa flutua na grelha do site)
    if(MK.shadow>0){
      const st=Math.max(6,(MK.shadowSize/100)*0.05*mn);
      const sh=document.createElement('canvas');sh.width=fw;sh.height=fh;const sx=sh.getContext('2d');
      sx.drawImage(img,dx+adx*st*0.5,dy+ady*st*0.6,w,h); sx.globalCompositeOperation='source-in';sx.fillStyle='#000';sx.fillRect(0,0,fw,fh);
      const b=document.createElement('canvas');b.width=fw;b.height=fh;const bx=b.getContext('2d');bx.filter='blur('+st+'px)';bx.drawImage(sh,0,0);
      bx.filter='none';bx.globalCompositeOperation='destination-out';bx.drawImage(img,dx,dy,w,h);
      x.globalAlpha=Math.min(.42,MK.shadow/100*0.42);x.drawImage(b,0,0);x.globalAlpha=1;
    }
    // ESPESSURA do acrílico (aba lateral)
    if(MK.thickness>0){
      const t=Math.max(3,(MK.thickness/100)*0.045*mn), steps=Math.max(5,Math.round(t));
      const ed=document.createElement('canvas');ed.width=fw;ed.height=fh;const ex=ed.getContext('2d');
      for(let k=1;k<=steps;k++){const f=k/steps;ex.drawImage(img,dx+adx*t*f,dy+ady*t*f,w,h);}
      ex.globalCompositeOperation='source-atop';ex.fillStyle='rgba(8,10,16,.5)';ex.fillRect(0,0,fw,fh);
      ex.globalCompositeOperation='destination-out';ex.drawImage(img,dx,dy,w,h);ex.globalCompositeOperation='source-over';
      x.globalAlpha=.92;x.drawImage(ed,0,0);x.globalAlpha=1;
    }
    // face frontal
    x.drawImage(img,dx,dy,w,h);
    // lip frontal claro
    if(MK.thickness>0){
      const lo=Math.max(1.5,(MK.thickness/100)*0.045*mn*0.12);
      const lip=document.createElement('canvas');lip.width=fw;lip.height=fh;const lx=lip.getContext('2d');
      lx.drawImage(img,dx,dy,w,h); lx.globalCompositeOperation='destination-out'; lx.drawImage(img,dx-adx*lo,dy-ady*lo,w,h);
      lx.globalCompositeOperation='source-atop'; lx.fillStyle='rgba(255,255,255,.5)'; lx.fillRect(0,0,fw,fh);
      x.globalCompositeOperation='lighter'; x.globalAlpha=.6; x.drawImage(lip,0,0); x.globalAlpha=1; x.globalCompositeOperation='source-over';
    }
    return c; // fundo transparente, com slab + sombra
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
  // export único — mostra a pasta LOGO ao clicar, depois renderiza e grava
  window.mockExport=async function(){
    if(!MK.scene){ alert('Carrega uma cena primeiro.'); return; }
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const name=`${MK.sceneName||'mockup'}_wall_${stamp}.png`;
    let fh=null;
    if(window.showSaveFilePicker){
      try{ fh=await window.showSaveFilePicker({suggestedName:name,types:[{description:'PNG',accept:{'image/png':['.png']}}],id:'auron-mock',startIn:'desktop'}); }
      catch(e){ if(e.name==='AbortError') return; }
    }
    const cv=buildWallCanvas();
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
    if(fh){ try{ const w=await fh.createWritable(); await w.write(blob); await w.close(); }catch(e){ alert('Erro ao gravar: '+e.message); } }
    else { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000); }
  };
  // exportar conjunto front+wall+detail de uma vez
  // renderiza a peça atual (mesmo design/acabamento) numa CENA de template, sem mexer no estado visível
  async function renderWallFromTemplate(t){
    const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=t.scene;});
    if(!img) return null;
    const snap={scene:MK.scene,sceneName:MK.sceneName,nativeW:MK.nativeW,nativeH:MK.nativeH,cw:MK.cw,ch:MK.ch,persp:MK.persp,quad:MK.quad};
    MK.scene=img; MK.nativeW=t.nativeW||img.naturalWidth; MK.nativeH=t.nativeH||img.naturalHeight;
    const s=Math.min(1,WORK_MAX/Math.max(MK.nativeW,MK.nativeH)); MK.cw=Math.round(MK.nativeW*s); MK.ch=Math.round(MK.nativeH*s);
    MK.persp=true; MK.quad=t.quadN.map(p=>({x:p.x*MK.cw,y:p.y*MK.ch}));
    const cv=buildWallCanvas();
    Object.assign(MK,snap);
    return cv;
  }
  window.mockExportSet=async function(){
    if(!MK.design){ alert('Traz um design primeiro (Usar design atual / Carregar PNG).'); return; }
    const colid=(prompt('ID da coleção (ex.: atl):','col')||'col').trim();
    const n=(prompt('Número da peça:','1')||'1').trim();
    // template de galeria (tipo gallery, ou wall) → versão galeria automática
    let galleryT=null;
    try{ const all=await tplAll(); const g=all.filter(t=>t.type==='gallery'||t.type==='wall').sort((a,b)=>b.created-a.created); galleryT=g[0]||null; }catch(e){}
    // pasta de destino (logo, antes de renderizar)
    let dir=null;
    if(window.showDirectoryPicker){ try{ dir=await window.showDirectoryPicker({id:'auron-mockset'}); }catch(e){ if(e.name==='AbortError') return; } }
    const items=[];
    items.push(['front', buildFrontCanvas()]);                  // design sozinho (transparente)
    if(galleryT){ const gc=await renderWallFromTemplate(galleryT); if(gc) items.push(['gallery', gc]); }
    if(MK.scene) items.push(['room', buildWallCanvas()]);       // cena atual = divisão/ambiente
    if(MK.scene) items.push(['detail', buildDetailCanvas()]);
    // gravar
    if(dir){
      for(const [tag,cv] of items){ const blob=await new Promise(r=>cv.toBlob(r,'image/png')); const fh=await dir.getFileHandle(`${colid}-${n}-${tag}.png`,{create:true}); const w=await fh.createWritable(); await w.write(blob); await w.close(); }
      alert('Conjunto exportado ('+items.map(i=>i[0]).join(', ')+')'+(galleryT?'':'\n\nDica: guarda um template de tipo "gallery" para a versão de galeria sair automaticamente.'));
    } else {
      for(const [tag,cv] of items){ await saveCanvas(cv, `${colid}-${n}-${tag}.png`); await new Promise(r=>setTimeout(r,250)); }
    }
  };

  // ── GERADOR DE CENÁRIO (prompt p/ Gemini) ──────────────────────────────────
  const GEN_OPTS={
    view:[
      ['gallery','Galeria','a clean minimalist art gallery interior wall','vertical 4:5'],
      ['sala','Sala','a cozy contemporary living room interior','horizontal 3:2'],
      ['quarto','Quarto','a serene calm bedroom interior','horizontal 3:2'],
      ['corredor','Corredor','a bright hallway / corridor interior','vertical 4:5'],
      ['entrada','Entrada','a stylish entryway / foyer','vertical 4:5'],
      ['escritorio','Escritório','a modern home office interior','horizontal 3:2'],
      ['varanda','Varanda','a sunlit balcony / outdoor terrace','horizontal 3:2'],
    ],
    style:[
      ['luxo','Luxo','luxury high-end elegant'],
      ['minimal','Minimalista','minimalist uncluttered'],
      ['escandinavo','Escandinavo','Scandinavian, light wood, airy'],
      ['japandi','Japandi','Japandi, warm minimal, natural materials'],
      ['industrial','Industrial','industrial, concrete, raw'],
      ['midcentury','Mid-century','mid-century modern'],
      ['boho','Boho','boho, organic, textured'],
      ['contemporaneo','Contemporâneo','contemporary designer'],
    ],
    light:[
      ['natural','Natural suave','soft natural daylight with a single clear direction and gentle shadows'],
      ['dourada','Dourada','warm golden-hour light, long soft shadows'],
      ['dramatica','Dramática/escura','dim moody cinematic low light (ideal for a backlit piece to glow)'],
      ['janela','Janela lateral','soft window light from the side casting gentle directional shadows'],
      ['neon','Néon ambiente','subtle ambient neon glow with deep shadows'],
    ],
    angle:[
      ['frontal','Frontal','straight-on eye-level view'],
      ['tq_esq','3/4 esquerda','slight three-quarter angle from the left'],
      ['tq_dir','3/4 direita','slight three-quarter angle from the right'],
      ['baixo','De baixo','slightly low angle looking up'],
      ['olhos','Nível dos olhos','natural eye-level perspective'],
    ],
    palette:[
      ['quente','Neutros quentes','warm neutral tones (beige, cream, sand)'],
      ['frio','Neutros frios','cool neutral tones (soft greys, off-white)'],
      ['terracota','Terracota','earthy terracotta and clay tones'],
      ['moody','Escuro/moody','dark moody tones with deep shadows'],
      ['salvia','Verde sálvia','sage green and natural earthy tones'],
      ['creme','Branco/creme','soft white and cream palette'],
    ],
    beam:[
      ['nenhum','Sem raio','no strong light beam'],
      ['suave','Raio suave','a soft diagonal shaft of daylight from an off-frame window falls gently across the wall and over the empty placement area'],
      ['forte','Raio de sol forte','a strong bright sunbeam cuts diagonally across the wall through an off-frame window, forming a luminous soft-edged band of light that crosses the empty placement area, with the surrounding wall slightly darker in shadow'],
      ['janela','Sombra de janela','clear sunlight through a window casts the soft shadow of the window frame and mullions across the wall and the placement area, creating bright and shadowed panes'],
      ['persiana','Persiana','warm sunlight filtered through venetian blinds casts soft horizontal stripes of light and shadow across the wall and the placement area'],
    ],
  };
  MK.gen={view:'gallery',style:'luxo',light:'natural',angle:'frontal',palette:'quente',beam:'suave'};
  function genGet(grp,id){ return (GEN_OPTS[grp].find(o=>o[0]===id))||GEN_OPTS[grp][0]; }
  function buildGenPrompt(){
    const g=MK.gen, v=genGet('view',g.view), st=genGet('style',g.style), li=genGet('light',g.light), an=genGet('angle',g.angle), pa=genGet('palette',g.palette), be=genGet('beam',g.beam);
    const beamTxt=(be[0]!=='nenhum')?` ${be[2]}.`:'';
    return `Photorealistic interior photograph, ultra high resolution (3000px+), of ${v[2]}, ${st[2]} style. ${pa[2]}. ${li[2]}; ${an[2]}.${beamTxt} There is a clean empty wall area with generous negative space to place a single artwork — no frames and no existing art in that spot. The wall is matte and mid-toned so it can catch a luminous piece's glow; include one subtle reflectable highlight from an off-frame light source on a nearby surface. Keep the placement area free of any panel or colored glow (the natural light and shadows falling on it are welcome), ready for a translucent backlit acrylic piece to be added in post-production. Composition ${v[3]}. No text, no logos, no people. Editorial, premium interior-decor aesthetic.`;
  }
  function renderGen(){
    const box=$('mkGenOpts'); if(!box) return; box.innerHTML='';
    const groups=[['view','Vista'],['style','Estilo'],['light','Iluminação'],['beam','Raio de luz'],['angle','Ângulo'],['palette','Paleta']];
    groups.forEach(([grp,lbl])=>{
      const sec=document.createElement('div');sec.className='mk-gengrp';
      const h=document.createElement('div');h.className='mk-genlbl';h.textContent=lbl;sec.appendChild(h);
      const row=document.createElement('div');row.className='mk-genchips';
      GEN_OPTS[grp].forEach(o=>{ const b=document.createElement('button');b.className='mk-chip2'+(MK.gen[grp]===o[0]?' on':'');b.textContent=o[1];b.onclick=()=>{MK.gen[grp]=o[0];renderGen();};row.appendChild(b); });
      sec.appendChild(row); box.appendChild(sec);
    });
    const ta=$('mkGenOut'); if(ta) ta.value=buildGenPrompt();
  }
  window.mockOpenGen=function(){ $('mkGen').hidden=false; renderGen(); };
  window.mockCloseGen=function(){ $('mkGen').hidden=true; };
  window.mockGenRandom=function(){ for(const grp in GEN_OPTS){ const a=GEN_OPTS[grp]; MK.gen[grp]=a[Math.floor(Math.random()*a.length)][0]; } renderGen(); };
  window.mockGenCopy=function(){ const t=buildGenPrompt(); navigator.clipboard&&navigator.clipboard.writeText(t); const b=$('mkGenCopyBtn'); if(b){const o=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=o,1400);} };

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
    const type=(prompt('Tipo: gallery (parede limpa p/ versão galeria) / room (divisão) / detail','gallery')||'gallery').toLowerCase().trim();
    // cantos da colocação; se ainda não há design/placa, guarda um quad centrado por defeito
    const q=currentCorners();
    const quadN = q ? q.map(p=>({x:p.x/MK.cw, y:p.y/MK.ch}))
                    : [{x:0.3,y:0.3},{x:0.7,y:0.3},{x:0.7,y:0.7},{x:0.3,y:0.7}];
    const t={ id:'t'+Date.now(), name, type, created:Date.now(),
      scene:sceneToDataURL(), nativeW:MK.nativeW, nativeH:MK.nativeH,
      quadN, mask:MK.mask, maskRadius:MK.maskRadius, blend:MK.blend, opacity:MK.opacity,
      finish:MK.finish, fillPanel:MK.fillPanel, glassFrost:MK.glassFrost, translucency:MK.translucency, thickness:MK.thickness, orient:MK.orient, size:MK.size, customW:MK.customW, customH:MK.customH,
      spill:MK.spill, shadow:MK.shadow, shadowSize:MK.shadowSize, shadowAngle:MK.shadowAngle, reflect:MK.reflect, reflectAngle:MK.reflectAngle,
      beamOn:MK.beamOn, beam:MK.beam, beamAngle:MK.beamAngle, beamPos:MK.beamPos, beamWidth:MK.beamWidth, beamSoft:MK.beamSoft, env:MK.env,
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
      $('mkEmpty').style.display='none'; MK.zoom=1;MK.panX=0;MK.panY=0;
      MK.mask=t.mask; MK.maskRadius=(t.maskRadius!=null?t.maskRadius:0); MK.blend=t.blend; MK.opacity=(t.opacity!=null?t.opacity:1);
      MK.finish=t.finish||'none'; MK.fillPanel=!!t.fillPanel; MK.orient=t.orient||'v'; MK.size=t.size||'a3'; MK.customW=t.customW||30; MK.customH=t.customH||30;
      MK.spill=t.spill||0; MK.shadow=t.shadow||0; MK.shadowSize=(t.shadowSize!=null?t.shadowSize:35); MK.shadowAngle=(t.shadowAngle!=null?t.shadowAngle:135); MK.reflect=t.reflect||0;
      MK.glassFrost=!!t.glassFrost; MK.translucency=(t.translucency!=null?t.translucency:20); MK.reflectAngle=(t.reflectAngle!=null?t.reflectAngle:135); MK.thickness=(t.thickness!=null?t.thickness:30);
      MK.beamOn=!!t.beamOn; MK.beam=(t.beam!=null?t.beam:55); MK.beamAngle=(t.beamAngle!=null?t.beamAngle:60); MK.beamPos=(t.beamPos!=null?t.beamPos:50); MK.beamWidth=(t.beamWidth!=null?t.beamWidth:40); MK.beamSoft=(t.beamSoft!=null?t.beamSoft:55); MK.env=(t.env!=null?t.env:60);
      MK.persp=true; MK.quad=t.quadN.map(p=>({x:p.x*MK.cw, y:p.y*MK.ch})); MK.selected=true;
      if(MK.design) buildMasked();
      // sincronizar UI
      $('mkMask').value=MK.mask; $('mkRadiusRow').style.display=shapeHasCorners()?'':'none';
      $('mkRadius').value=MK.maskRadius; $('mkRadiusV').textContent=Math.round(MK.maskRadius);
      if($('mkFinish'))$('mkFinish').value=MK.finish; if($('mkOrient'))$('mkOrient').value=MK.orient;
      if($('mkFillBtn')){ $('mkFillBtn').classList.toggle('on',MK.fillPanel); $('mkFillBtn').textContent=MK.fillPanel?'Placa: cor da arte':'Preencher placa'; }
      if($('mkSize')){ $('mkSize').value=MK.size; $('mkCustomRow').style.display=(MK.size==='custom')?'':'none'; }
      if($('mkCustomW'))$('mkCustomW').value=MK.customW; if($('mkCustomH'))$('mkCustomH').value=MK.customH;
      [['mkSpill','spill'],['mkShadow','shadow'],['mkShSize','shadowSize'],['mkShAng','shadowAngle'],['mkReflect','reflect'],['mkRefAng','reflectAngle'],['mkTransl','translucency'],['mkThick','thickness'],['mkBeam','beam'],['mkBeamAng','beamAngle'],['mkBeamPos','beamPos'],['mkBeamW','beamWidth'],['mkBeamS','beamSoft'],['mkEnv','env']].forEach(([el2,k])=>{const s=$(el2);if(s){s.value=MK[k];const v=$(el2+'V');if(v)v.textContent=Math.round(MK[k]);}});
      if($('mkBeamBtn')){ $('mkBeamBtn').classList.toggle('on',MK.beamOn); $('mkBeamBtn').textContent=MK.beamOn?'Luz de janela: ligada':'Luz de janela'; } if($('mkBeamRows'))$('mkBeamRows').style.display=MK.beamOn?'':'none';
      if($('mkFrostBtn')){ $('mkFrostBtn').classList.toggle('on',MK.glassFrost); $('mkFrostBtn').textContent=MK.glassFrost?'Vidro: fosco':'Vidro fosco'; }
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
