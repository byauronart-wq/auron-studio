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
    mirror:25,                                                     // espelho: reflexo verdadeiro (nítido/desfocado) da sala, tingido de vidro
    ink:65,                                                        // densidade da tinta UV (100=opaca · menos=parede visível através das zonas claras)
    vivid:40,                                                      // vivacidade da tinta (saturação/contraste extra)
    edgeGlow:50, edgeWidth:50,                                     // aresta (fresnel): intensidade e largura
    contact:50,                                                    // sombra de contacto (AO) junto ao rebordo
    glass:50,                                                      // vidro: refração + tinta neutra (ver através)
    edgeSoft:22,                                                   // nitidez do corte da forma (0=nítido/vinil, 100=muito suave)
    edgeBorder:0, edgeBorderW:35, edgeBorderColor:'#141821',        // contorno opcional (0=sem contorno, seamless)
    overlayIntensity:0,   // 0=peça normal (opaca, fiel) · 100=quase pura luz projetada — reduz a opacidade
                           // da peça e soma-lhe uma passagem extra em 'screen', para a parede/luzes da sala
                           // aparecerem através dela (o efeito "overlay" que se vê em mockups de referência)
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
  // a forma de recorte do mockup (MK.mask/maskRadius) é independente da forma do
  // painel do Studio (panelShape) — sem isto, o mockup usa sempre "rect, raio 0"
  // por omissão, e os cantos do gradiente (mais escuros, longe do centro) que a
  // aba Design recorta corretamente (via panelShape) ficam visíveis no mockup.
  function syncMaskFromPanelShape(){
    if(typeof panelShape==='undefined') return;
    const MAP={rect:['rect',0],rounded:['rect',10],sq:['square',0],sqr:['square',10],oval:['ellipse',0],circle:['circle',0]};
    const m=MAP[panelShape]; if(!m) return;
    MK.mask=m[0]; MK.maskRadius=m[1];
    if($('mkMask'))$('mkMask').value=MK.mask;
    if($('mkRadius'))$('mkRadius').value=MK.maskRadius;
    if($('mkRadiusV'))$('mkRadiusV').textContent=Math.round(MK.maskRadius);
    if($('mkRadiusRow'))$('mkRadiusRow').style.display=shapeHasCorners()?'':'none';
  }
  window.mockUseDesign = function(){
    const c=composeDesign(WORK_MAX);
    if(!c){ alert('Não há design no editor. Cria algo na aba Design primeiro.'); return; }
    // só sincroniza na 1ª colocação — se o utilizador já tiver escolhido outra forma
    // de propósito para este mockup, uma actualização do design não a deve repor.
    if(!MK.design) syncMaskFromPanelShape();
    setDesign(c,c.width,c.height);
  };
  window.mockLoadPNG = function(input){
    const f=input.files&&input.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=e=>{ const img=new Image(); img.onload=()=>setDesign(img,img.naturalWidth,img.naturalHeight); img.src=e.target.result; };
    r.readAsDataURL(f); input.value='';
  };
  function setDesign(src,w,h){
    const firstDesign=!MK.design;
    MK.design={src,w,h}; MK.selected=true;
    // por defeito, a peça é ACRÍLICO (aspeto de produto) na 1ª colocação — evita o look "chapado/baço"
    if(firstDesign && (!MK.finish || MK.finish==='none')){
      MK.finish='acrylic'; MK.shadow=22; MK.reflect=0; MK.spill=25; MK.translucency=0; MK.env=15; MK.mirror=25; MK.ink=65;
      MK.vivid=40; MK.edgeGlow=50; MK.edgeWidth=50; MK.contact=50; MK.glass=50; MK.fillPanel=false; MK.glassFrost=false;
      if($('mkFinish'))$('mkFinish').value='acrylic';
      const ir0=$('mkInkRow'); if(ir0)ir0.style.display=''; const ar0=$('mkAcrRows'); if(ar0)ar0.style.display='';
      [['mkShadow','shadow'],['mkReflect','reflect'],['mkTransl','translucency'],['mkEnv','env'],['mkMirror','mirror'],['mkSpill','spill'],['mkInk','ink'],['mkVivid','vivid'],['mkEdgeGlow','edgeGlow'],['mkEdgeWidth','edgeWidth'],['mkContact','contact'],['mkGlass','glass']].forEach(([id,k])=>{const s=$(id);if(s){s.value=MK[k];const v=$(id+'V');if(v)v.textContent=Math.round(MK[k]);}});
    }
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
    if(typeof applyDesignOpacity==='function')applyDesignOpacity(ec,dw,dh);
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
    // nitidez do corte: 0=vinil/nítido, 100=muito suave (slider "Aresta — suavidade")
    const fpx=Math.max(0.4, Math.min(w,h)*((MK.edgeSoft!=null?MK.edgeSoft:22)/100)*0.01);
    const smf=document.createElement('canvas');smf.width=w;smf.height=h;const smfx=smf.getContext('2d');
    smfx.filter='blur('+fpx+'px)'; smfx.drawImage(sm,0,0); smfx.filter='none';
    MK.shapeMask=smf;
    // arte recortada à forma
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    x.drawImage(smf,0,0); x.globalCompositeOperation='source-in'; x.drawImage(MK.design.src,0,0,w,h);
    MK.masked=c; buildFinished();
  }
  // contorno opcional simples (linha fina à volta da forma) — funciona com QUALQUER acabamento,
  // incluindo "Nenhum". Por defeito desligado (edgeBorder=0) → corte limpo, sem nada a mais.
  function applyEdgeBorder(x,w,h){
    if(!(MK.edgeBorder>0)) return;
    const mn=Math.min(w,h);
    x.save(); shapePath(x,w,h); x.clip();
    shapePath(x,w,h);
    x.lineWidth=Math.max(0.5,mn*0.006*((MK.edgeBorderW!=null?MK.edgeBorderW:35)/35));
    x.strokeStyle=MK.edgeBorderColor||'#141821';
    x.globalAlpha=Math.min(1,MK.edgeBorder/100);
    x.stroke();
    x.globalAlpha=1;
    x.restore();
  }
  // acabamento — VIDRO TRANSLÚCIDO: arte FIEL (sem véu) + borda; reflexo é feito ao vivo (compositeDesignOnto)
  function buildFinished(){
    if(!MK.masked){ MK.finished=null; return; }
    if(MK.finish==='none'||!MK.finish){
      // sem acabamento: a arte fica exatamente como é — só o contorno opcional (se ligado)
      if(!(MK.edgeBorder>0)){ MK.finished=MK.masked; return; }
      const w0=MK.masked.width,h0=MK.masked.height;
      const c0=document.createElement('canvas');c0.width=w0;c0.height=h0;const x0=c0.getContext('2d');
      x0.drawImage(MK.masked,0,0); applyEdgeBorder(x0,w0,h0);
      MK.finished=c0; return;
    }
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

    // 3.5) TINTA TRANSLÚCIDA (só acrílico) — modelo do produto real: a tinta UV sobre vidro
    // transparente deixa ver a parede através, proporcionalmente à densidade da tinta.
    // Zonas quase-brancas/claras (pouca tinta) ficam translúcidas; escuras/saturadas ficam densas.
    // (nas fotos da peça física vê-se o vaso ATRAVÉS do gradiente verde — é isto que replica)
    if(MK.finish==='acrylic' && !MK.fillPanel){
      const K=1-((MK.ink!=null?MK.ink:65)/100);   // slider Tinta: 100=opaco, 0=sem tinta = vidro limpo
      if(K>0.01){
        const im=x.getImageData(0,0,w,h), d=im.data;
        for(let i=0;i<d.length;i+=4){
          const a=d[i+3]; if(a===0) continue;
          const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
          const mx=Math.max(r,g,b), mnn=Math.min(r,g,b);
          const lum=0.299*r+0.587*g+0.114*b, sat=mx===0?0:(mx-mnn)/mx;
          const t=lum*(1-sat*0.6);             // 1 = pouca tinta (claro, mesmo c/ leve cor) → transparente
          d[i+3]=a*(1-K*t);
        }
        x.putImageData(im,0,0);
      }
    }

    // 4) BORDA do acrílico — no material real a aresta é uma linha de corte FINA e subtil
    x.save(); shapePath(x,w,h); x.clip();
    shapePath(x,w,h); x.lineWidth=Math.max(1,mn*0.004); x.strokeStyle='rgba(255,255,255,.12)'; x.stroke();
    shapePath(x,w,h); x.lineWidth=Math.max(1,mn*0.0028); x.strokeStyle='rgba(20,24,28,.38)'; x.stroke();
    x.restore();
    MK.finished=c;
  }
  function shapeHasCorners(){ return MK.mask==='rect'||MK.mask==='square'||MK.mask==='round'; }
  function setUI(id,val){ const s=$(id); if(s)s.value=val; const v=$(id+'V'); if(v)v.textContent=Math.round(val); }
  window.mockSetMask=function(shape){ mkSnapshot(); MK.mask=shape; buildMasked(); $('mkRadiusRow').style.display=shapeHasCorners()?'':'none'; renderMock(); };
  window.mockSetRadius=function(v){ mkSnapshot(); MK.maskRadius=+v; $('mkRadiusV').textContent=Math.round(v); buildMasked(); renderMock(); };
  let _edgeT=null;
  window.mockSetEdgeSoft=function(v){ mkSnapshot(); MK.edgeSoft=Math.max(0,Math.min(100,+v||0)); $('mkEdgeSoftV').textContent=Math.round(MK.edgeSoft);
    clearTimeout(_edgeT); _edgeT=setTimeout(()=>{ buildMasked(); renderMock(); },80); };
  window.mockSetEdgeBorder=function(v){ mkSnapshot(); MK.edgeBorder=Math.max(0,Math.min(100,+v||0)); $('mkEdgeBorderV').textContent=Math.round(MK.edgeBorder); buildFinished(); renderMock(); };
  window.mockSetEdgeBorderW=function(v){ mkSnapshot(); MK.edgeBorderW=Math.max(0,Math.min(100,+v||0)); $('mkEdgeBorderWV').textContent=Math.round(MK.edgeBorderW); buildFinished(); renderMock(); };
  window.mockSetEdgeBorderColor=function(v){ mkSnapshot(); MK.edgeBorderColor=v; buildFinished(); renderMock(); };
  window.mockSetFinish=function(v){
    mkSnapshot(true); MK.finish=v;
    // realismo base ao escolher (se ainda a zero) — vidro claro, cor fiel
    if(v==='acrylic'){
      MK.shadow=22; MK.reflect=0; MK.spill=25; MK.translucency=0; MK.env=15; MK.mirror=25; if(MK.ink==null)MK.ink=65;
      if(MK.vivid==null)MK.vivid=40; if(MK.edgeGlow==null)MK.edgeGlow=50; if(MK.edgeWidth==null)MK.edgeWidth=50;
      if(MK.contact==null)MK.contact=50; if(MK.glass==null)MK.glass=50;
      MK.fillPanel=false; MK.glassFrost=false;  // vidro claro por defeito — usa os toggles se quiseres opaco/fosco
      MK.blend='source-over'; if($('mkBlend'))$('mkBlend').value='source-over';  // Overlay lava o modelo transparente — a luz da sala entra via Ambiente/Espelho
    }
    else if(v==='lightbox'){ if(MK.spill===0)MK.spill=45; if(MK.shadow===0)MK.shadow=15; if(MK.reflect===0)MK.reflect=15; MK.env=35; }
    else if(v==='none'){ MK.env=0; }
    buildFinished();
    setUI('mkSpill',MK.spill); setUI('mkShadow',MK.shadow); setUI('mkReflect',MK.reflect); setUI('mkTransl',MK.translucency); setUI('mkEnv',MK.env); setUI('mkMirror',MK.mirror); setUI('mkInk',MK.ink!=null?MK.ink:65);
    setUI('mkVivid',MK.vivid); setUI('mkEdgeGlow',MK.edgeGlow); setUI('mkEdgeWidth',MK.edgeWidth); setUI('mkContact',MK.contact); setUI('mkGlass',MK.glass);
    if($('mkFillBtn')){ $('mkFillBtn').classList.toggle('on',MK.fillPanel); $('mkFillBtn').textContent=MK.fillPanel?'Placa: cor da arte':'Preencher placa'; }
    if($('mkFrostBtn')){ $('mkFrostBtn').classList.toggle('on',MK.glassFrost); $('mkFrostBtn').textContent=MK.glassFrost?'Vidro: fosco':'Vidro fosco'; }
    const ir=$('mkInkRow'); if(ir)ir.style.display=(v==='acrylic')?'':'none'; const ar=$('mkAcrRows'); if(ar)ar.style.display=(v==='acrylic')?'':'none';
    renderMock();
  };
  window.mockSetTranslucency=function(v){ mkSnapshot(); MK.translucency=+v; $('mkTranslV').textContent=Math.round(v); renderMock(); };
  window.mockSetReflectAngle=function(v){ mkSnapshot(); MK.reflectAngle=+v; $('mkRefAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetThickness=function(v){ mkSnapshot(); MK.thickness=Math.max(0,Math.min(100,+v||0)); $('mkThickV').textContent=Math.round(MK.thickness); renderMock(); };
  window.mockToggleFrost=function(){ mkSnapshot(true); MK.glassFrost=!MK.glassFrost; buildFinished(); const b=$('mkFrostBtn'); if(b){b.classList.toggle('on',MK.glassFrost);b.textContent=MK.glassFrost?'Vidro: fosco':'Vidro fosco';} renderMock(); };
  const c01=v=>Math.max(0,Math.min(100,+v||0));   // clamp 0-100 (defensivo — evita nºs disparatados na UI/render)
  window.mockSetSpill=function(v){ mkSnapshot(); MK.spill=c01(v); $('mkSpillV').textContent=Math.round(MK.spill); renderMock(); };
  window.mockSetShadow=function(v){ mkSnapshot(); MK.shadow=c01(v); $('mkShadowV').textContent=Math.round(MK.shadow); renderMock(); };
  window.mockSetShadowSize=function(v){ mkSnapshot(); MK.shadowSize=c01(v); $('mkShSizeV').textContent=Math.round(MK.shadowSize); renderMock(); };
  window.mockSetShadowAngle=function(v){ mkSnapshot(); MK.shadowAngle=+v; $('mkShAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetReflect=function(v){ mkSnapshot(); MK.reflect=c01(v); $('mkReflectV').textContent=Math.round(MK.reflect); renderMock(); };
  window.mockSetEnv=function(v){ mkSnapshot(); MK.env=c01(v); $('mkEnvV').textContent=Math.round(MK.env); renderMock(); };
  window.mockSetMirror=function(v){ mkSnapshot(); MK.mirror=c01(v); $('mkMirrorV').textContent=Math.round(MK.mirror); renderMock(); };
  let _inkT=null;
  window.mockSetInk=function(v){ mkSnapshot(); MK.ink=c01(v); $('mkInkV').textContent=Math.round(MK.ink);
    clearTimeout(_inkT); _inkT=setTimeout(()=>{ buildFinished(); renderMock(); },80); };  // rebuild adiado → slider fluido
  window.mockSetVivid=function(v){ mkSnapshot(); MK.vivid=c01(v); $('mkVividV').textContent=Math.round(MK.vivid); renderMock(); };
  window.mockSetEdgeGlow=function(v){ mkSnapshot(); MK.edgeGlow=c01(v); $('mkEdgeGlowV').textContent=Math.round(MK.edgeGlow); renderMock(); };
  window.mockSetEdgeWidth=function(v){ mkSnapshot(); MK.edgeWidth=c01(v); $('mkEdgeWidthV').textContent=Math.round(MK.edgeWidth); renderMock(); };
  window.mockSetContact=function(v){ mkSnapshot(); MK.contact=c01(v); $('mkContactV').textContent=Math.round(MK.contact); renderMock(); };
  window.mockSetGlass=function(v){ mkSnapshot(); MK.glass=c01(v); $('mkGlassV').textContent=Math.round(MK.glass); renderMock(); };
  window.mockToggleBeam=function(){ mkSnapshot(true); MK.beamOn=!MK.beamOn; const b=$('mkBeamBtn'); if(b){b.classList.toggle('on',MK.beamOn); b.textContent=MK.beamOn?'Luz de janela: ligada':'Luz de janela';} const r=$('mkBeamRows'); if(r)r.style.display=MK.beamOn?'':'none'; renderMock(); };
  window.mockSetBeam=function(v){ mkSnapshot(); MK.beam=c01(v); $('mkBeamV').textContent=Math.round(MK.beam); renderMock(); };
  window.mockSetBeamAngle=function(v){ mkSnapshot(); MK.beamAngle=+v; $('mkBeamAngV').textContent=Math.round(v); renderMock(); };
  window.mockSetBeamPos=function(v){ mkSnapshot(); MK.beamPos=c01(v); $('mkBeamPosV').textContent=Math.round(MK.beamPos); renderMock(); };
  window.mockSetBeamWidth=function(v){ mkSnapshot(); MK.beamWidth=c01(v); $('mkBeamWV').textContent=Math.round(MK.beamWidth); renderMock(); };
  window.mockSetBeamSoft=function(v){ mkSnapshot(); MK.beamSoft=c01(v); $('mkBeamSV').textContent=Math.round(MK.beamSoft); renderMock(); };
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
    setUI('mkEnv',MK.env); setUI('mkMirror',MK.mirror); setUI('mkInk',MK.ink!=null?MK.ink:65);
    setUI('mkVivid',MK.vivid!=null?MK.vivid:40); setUI('mkEdgeGlow',MK.edgeGlow!=null?MK.edgeGlow:50); setUI('mkEdgeWidth',MK.edgeWidth!=null?MK.edgeWidth:50);
    setUI('mkContact',MK.contact!=null?MK.contact:50); setUI('mkGlass',MK.glass!=null?MK.glass:50);
    setUI('mkEdgeSoft',MK.edgeSoft!=null?MK.edgeSoft:22); setUI('mkEdgeBorder',MK.edgeBorder!=null?MK.edgeBorder:0); setUI('mkEdgeBorderW',MK.edgeBorderW!=null?MK.edgeBorderW:35);
    if($('mkEdgeBorderColor'))$('mkEdgeBorderColor').value=MK.edgeBorderColor||'#141821';
    if($('mkInkRow'))$('mkInkRow').style.display=(MK.finish==='acrylic')?'':'none'; if($('mkAcrRows'))$('mkAcrRows').style.display=(MK.finish==='acrylic')?'':'none';
    if($('mkFrostBtn')){ $('mkFrostBtn').classList.toggle('on',MK.glassFrost); $('mkFrostBtn').textContent=MK.glassFrost?'Vidro: fosco':'Vidro fosco'; }
    if($('mkBlend'))$('mkBlend').value=MK.blend; if($('mkMask'))$('mkMask').value=MK.mask; if($('mkFinish'))$('mkFinish').value=MK.finish;
    if($('mkOrient'))$('mkOrient').value=MK.orient; if($('mkSize'))$('mkSize').value=MK.size;
    if($('mkRadiusRow'))$('mkRadiusRow').style.display=shapeHasCorners()?'':'none';
    if($('mkPerspBtn')){ $('mkPerspBtn').classList.toggle('on',MK.persp); $('mkPerspBtn').textContent=MK.persp?'Perspetiva: ON':'Perspetiva'; }
    if($('mkFillBtn')){ $('mkFillBtn').classList.toggle('on',MK.fillPanel); $('mkFillBtn').textContent=MK.fillPanel?'Placa: cor da arte':'Preencher placa'; }
  }
  // ── UNDO (Ctrl/Cmd+Z, só na aba Mockups) ──────────────────────────────────────
  let _undo=[], _lastSnap=0;
  function mkSerial(){ return JSON.stringify({x:MK.x,y:MK.y,baseScale:MK.baseScale,scaleMul:MK.scaleMul,rot:MK.rot,opacity:MK.opacity,blend:MK.blend,persp:MK.persp,quad:MK.quad,mask:MK.mask,maskRadius:MK.maskRadius,finish:MK.finish,fillPanel:MK.fillPanel,glassFrost:MK.glassFrost,translucency:MK.translucency,thickness:MK.thickness,spill:MK.spill,shadow:MK.shadow,shadowSize:MK.shadowSize,shadowAngle:MK.shadowAngle,reflect:MK.reflect,reflectAngle:MK.reflectAngle,env:MK.env,mirror:MK.mirror,ink:MK.ink,vivid:MK.vivid,edgeGlow:MK.edgeGlow,edgeWidth:MK.edgeWidth,contact:MK.contact,glass:MK.glass,edgeSoft:MK.edgeSoft,edgeBorder:MK.edgeBorder,edgeBorderW:MK.edgeBorderW,edgeBorderColor:MK.edgeBorderColor,overlayIntensity:MK.overlayIntensity}); }
  function mkSnapshot(force){ if(!MK.design)return; const now=Date.now(); if(!force && now-_lastSnap<600) return; _lastSnap=now; _undo.push(mkSerial()); if(_undo.length>60)_undo.shift(); }
  window.mockUndo=function(){ if(!_undo.length) return; const s=JSON.parse(_undo.pop()); Object.assign(MK,s); if(MK.quad)MK.quad=MK.quad.map(p=>({x:p.x,y:p.y})); buildMasked(); syncAllUI(); MK.selected=true; renderMock(); };

  // ── perspetiva ────────────────────────────────────────────────────────────────
  window.mockTogglePersp=function(){
    if(!MK.design) return;
    mkSnapshot(true);
    MK.persp=!MK.persp;
    if(MK.persp) MK.quad=designCorners();   // arranca dos cantos afins atuais
    else {
      // desligar: converte o quad ATUAL de volta a afim equivalente (centro/rotação/escala),
      // senão a peça salta para o x/y/escala antigos (que podem nem corresponder — ex. após template)
      if(MK.quad){
        const q=MK.quad, c=centroid(q);
        const topW=Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y), botW=Math.hypot(q[2].x-q[3].x,q[2].y-q[3].y);
        const lH=Math.hypot(q[3].x-q[0].x,q[3].y-q[0].y), rH=Math.hypot(q[2].x-q[1].x,q[2].y-q[1].y);
        MK.x=c.x; MK.y=c.y;
        MK.rot=Math.atan2(q[1].y-q[0].y, q[1].x-q[0].x);
        const eff=Math.max(0.0001, Math.min(((topW+botW)/2)/MK.design.w, ((lH+rH)/2)/MK.design.h));
        if(!(MK.scaleMul>0)) MK.scaleMul=1;
        MK.baseScale=eff/MK.scaleMul;
      }
      MK.quad=null;
      syncProps();
    }
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
    else if(prop==='overlayIntensity'){ MK.overlayIntensity=+val; $('mkOverlayV').textContent=Math.round(val); }
    renderMock();
  };
  function syncProps(){
    $('mkOpacity').value=Math.round(MK.opacity*100); $('mkOpacityV').textContent=Math.round(MK.opacity*100);
    $('mkScale').value=Math.round(MK.scaleMul*100); $('mkScaleV').textContent=Math.round(MK.scaleMul*100);
    $('mkRot').value=Math.round(MK.rot*180/Math.PI); $('mkRotV').textContent=Math.round(MK.rot*180/Math.PI);
    $('mkBlend').value=MK.blend;
    if($('mkOverlay')){ $('mkOverlay').value=Math.round(MK.overlayIntensity||0); $('mkOverlayV').textContent=Math.round(MK.overlayIntensity||0); }
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
  // cor média da cena (p/ harmonização) — cacheada por imagem para não recalcular a cada frame
  let _avgCache=null,_avgSrc=null;
  function sceneAvgColor(){
    if(_avgSrc===MK.scene && _avgCache) return _avgCache;
    const s=20,sh=Math.max(1,Math.round(s*(MK.scene.naturalHeight||MK.scene.height||1)/(MK.scene.naturalWidth||MK.scene.width||1)));
    const c=document.createElement('canvas');c.width=s;c.height=sh;const x=c.getContext('2d');
    x.drawImage(MK.scene,0,0,s,sh);
    const d=x.getImageData(0,0,s,sh).data; let r=0,g=0,b=0,n=0;
    for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
    _avgCache=[r/n,g/n,b/n]; _avgSrc=MK.scene; return _avgCache;
  }
  function renderDesignLayer(w,h,ratio){ return renderLayerOf(MK.finished||MK.masked,w,h,ratio); }
  // a placa como retângulo SÓLIDO (forma), p/ sombra e reflexo definirem a peça mesmo com arte transparente
  function renderShapeLayer(w,h,ratio){ return renderLayerOf(MK.shapeMask,w,h,ratio); }
  // anel fino junto ao REBORDO REAL da peça (já posicionada/rodada/em perspetiva no frame) —
  // erosão por raster: desfoca a máscara por `insetPx` e usa o resultado quase-opaco como "interior
  // seguro"; subtraindo-o da máscara original sobra só uma faixa de largura ~insetPx junto à aresta.
  // Funciona em qualquer posição/rotação/perspetiva, ao contrário de desenhar shapePath no frame inteiro.
  function edgeRing(clipMask,w,h,insetPx){
    const ring=document.createElement('canvas');ring.width=w;ring.height=h;const rgx=ring.getContext('2d');
    rgx.drawImage(clipMask,0,0);
    const inner=document.createElement('canvas');inner.width=w;inner.height=h;const ix=inner.getContext('2d');
    ix.filter='blur('+Math.max(1,insetPx)+'px)'; ix.drawImage(clipMask,0,0); ix.filter='none';
    const id=ix.getImageData(0,0,w,h),d=id.data;
    for(let i=3;i<d.length;i+=4) d[i]=d[i]>248?255:0;   // threshold: só o que sobreviveu quase intacto ao blur
    ix.putImageData(id,0,0);
    rgx.globalCompositeOperation='destination-out'; rgx.drawImage(inner,0,0); rgx.globalCompositeOperation='source-over';
    return ring;
  }
  // tamanho REAL da peça no frame (não da cena) — para escalar corretamente anéis/molduras
  // com base na máscara já posicionada, em vez do tamanho do ecrã/export (que pode ser bem maior)
  function maskExtent(mask,w,h){
    const S=48,c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d');
    x.drawImage(mask,0,0,w,h,0,0,S,S);
    const d=x.getImageData(0,0,S,S).data;
    let minX=S,maxX=-1,minY=S,maxY=-1;
    for(let y=0;y<S;y++)for(let xx=0;xx<S;xx++){ const a=d[(y*S+xx)*4+3]; if(a>16){ if(xx<minX)minX=xx; if(xx>maxX)maxX=xx; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
    if(maxX<0) return Math.min(w,h);
    const sx=w/S, sy=h/S;
    return Math.min((maxX-minX+1)*sx, (maxY-minY+1)*sy);
  }
  // compõe a peça sobre a cena (ctx2) com realismo de luz (sombra + derrame + reflexo)
  function compositeDesignOnto(ctx2, ratio){
    if(!MK.design) return;
    const w=ctx2.canvas.width, h=ctx2.canvas.height;
    const layer=renderDesignLayer(w,h,ratio);
    const full=!MK.dragging; // só o arrasto da PEÇA (mover/rodar/escalar) salta efeitos pesados — sliders sempre em qualidade completa
    const mn=Math.min(w,h);
    // silhueta para a sombra: usa sempre a FORMA cortada (nítida), mesmo sem acabamento —
    // uma sombra que segue o alpha difuso da arte fica com um ar impreciso/desfocado.
    const hasPanel=(MK.finish&&MK.finish!=='none'&&MK.shapeMask);
    const shadowSilh=MK.shapeMask?renderShapeLayer(w,h,ratio):layer;
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
    // 1.2) VIDRO — dentro da placa, a parede é vista ATRAVÉS do acrílico: micro-desvio de
    //      refração + tinta neutra ligeiríssima. É o "tell" de haver um objeto de vidro ali.
    if(full && MK.scene && MK.finish==='acrylic' && MK.glass>0){
      const gAmt=MK.glass/50;                        // 50=baseline(1x) · 0=off · 100=2x
      const clipV=hasPanel?renderShapeLayer(w,h,ratio):layer;
      const shift=Math.max(0.4,0.0018*mn*gAmt);
      const gl=document.createElement('canvas');gl.width=w;gl.height=h;const gx2=gl.getContext('2d');
      gx2.filter='blur(0.5px)'; gx2.drawImage(MK.scene,0,shift,w,h); gx2.filter='none';
      gx2.globalCompositeOperation='multiply'; gx2.globalAlpha=Math.min(1,MK.glass/100);
      gx2.fillStyle='rgba(232,238,236,1)'; gx2.fillRect(0,0,w,h); gx2.globalAlpha=1; // vidro absorve luz, tom neutro-frio
      gx2.globalCompositeOperation='destination-in'; gx2.drawImage(clipV,0,0); gx2.globalCompositeOperation='source-over';
      // Intensidade overlay negativa (<0): reduz também este "ver a parede através do vidro" —
      // não é só a passagem 3 (opacidade da peça) que deixa a parede transparecer.
      const ovNeg0=Math.max(0,-(MK.overlayIntensity||0)/100);
      if(ovNeg0>0){ ctx2.globalAlpha=1-ovNeg0; ctx2.drawImage(gl,0,0); ctx2.globalAlpha=1; }
      else ctx2.drawImage(gl,0,0);
    }
    // 1.5) AO / bisel — sombra de contacto fina ao longo do REBORDO REAL da peça (já posicionada no frame)
    if(full && hasPanel && MK.contact>0){
      const band=Math.max(2,maskExtent(shadowSilh,w,h)*0.03);
      const ring=edgeRing(shadowSilh,w,h,band);
      ring.getContext('2d').globalCompositeOperation='source-in'; ring.getContext('2d').fillStyle='rgba(0,0,0,1)'; ring.getContext('2d').fillRect(0,0,w,h);
      ctx2.globalCompositeOperation='multiply'; ctx2.globalAlpha=(MK.contact/100)*0.64; ctx2.drawImage(ring,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 2) PROJEÇÃO DE COR na parede — a tinta do acrílico projeta a sua cor no ambiente
    //    (na foto da peça real vê-se o halo verde na parede ao lado). Só FORA da placa,
    //    saturada e desfocada — o cue de realismo mais forte do material.
    if(full && MK.spill>0){
      const ext=hasPanel?maskExtent(shadowSilh,w,h):mn;
      const g=document.createElement('canvas');g.width=w;g.height=h;const gx=g.getContext('2d');
      const blur=Math.max(6,(0.05+0.10*(MK.spill/100))*ext);
      gx.filter='blur('+blur+'px) saturate(1.5)'; gx.drawImage(layer,0,0); gx.filter='none';
      // só fora da placa (dentro, a cor já lá está — evita lavar a arte)
      gx.globalCompositeOperation='destination-out'; gx.drawImage(shadowSilh,0,0); gx.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=Math.min(0.9,MK.spill/100*0.9); ctx2.drawImage(g,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 2.5) ESPESSURA do acrílico (~5mm) — a aba lateral da placa, atrás da face frontal.
    // Na peça real (ver foto de detalhe), a aresta NÃO é branca/tingida de neutro — é a MESMA
    // cor do material, só mais densa/escura, porque estás a ver mais espessura de tinta
    // translúcida de lado (como vidro colorido visto ao través). Por isso aprofundamos a cor
    // PRÓPRIA da aresta (saturação↑, luz↓) em vez de a pintar com um tom neutro/navy.
    if(hasPanel && MK.thickness>0){
      const t=Math.max(3,(MK.thickness/100)*0.045*mn);           // espessura em px (mais presente)
      const ang=(MK.shadowAngle||135)*Math.PI/180;                // mesma direção da luz
      const tdx=Math.cos(ang), tdy=Math.sin(ang);
      const steps=Math.max(5,Math.round(t));
      const ed=document.createElement('canvas');ed.width=w;ed.height=h;const ex=ed.getContext('2d');
      // empilha cópias deslocadas da face → constrói o lado
      for(let k=1;k<=steps;k++){ const f=k/steps; ex.globalAlpha=1; ex.drawImage(layer, tdx*t*f, tdy*t*f); }
      // aprofunda a cor própria (Beer-Lambert simplificado: mais material = mais denso/escuro)
      // e remove a área da face frontal (fica só a aba lateral)
      const deep=document.createElement('canvas');deep.width=w;deep.height=h;const dpx=deep.getContext('2d');
      dpx.filter='saturate(1.55) brightness(0.5) contrast(1.08)'; dpx.drawImage(ed,0,0); dpx.filter='none';
      dpx.globalCompositeOperation='destination-out'; dpx.drawImage(layer,0,0); dpx.globalCompositeOperation='source-over';
      ctx2.globalAlpha=0.94; ctx2.drawImage(deep,0,0); ctx2.globalAlpha=1;
      // lip frontal — realce SUBTIL e tingido (a mesma cor, mais clara), não um brilho branco
      const lip=document.createElement('canvas');lip.width=w;lip.height=h;const lx=lip.getContext('2d');
      lx.drawImage(layer,0,0); lx.globalCompositeOperation='destination-out'; lx.drawImage(layer,-tdx*Math.max(1.5,t*0.12),-tdy*Math.max(1.5,t*0.12));
      lx.globalCompositeOperation='source-over';
      const tint=document.createElement('canvas');tint.width=w;tint.height=h;const tpx=tint.getContext('2d');
      tpx.filter='brightness(1.7) saturate(0.9)'; tpx.drawImage(lip,0,0); tpx.filter='none';
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=0.4; ctx2.drawImage(tint,0,0); ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 3) a PEÇA — translucidez deixa ver a parede através da cor (mantendo a cor fiel)
    const translBase=(MK.finish&&MK.finish!=='none'&&!MK.fillPanel)?(MK.translucency||0)/100*0.7:0;
    // Intensidade do overlay é bidirecional: negativa (<0) empurra para MAIS sólida/opaca —
    // reduz a translucidez base do acabamento; positiva (>0) empurra para MAIS transparente/
    // "luz projetada" — reduz a opacidade da passagem normal e soma uma passagem extra em 'screen'.
    const ovRaw=(MK.overlayIntensity||0)/100;
    const ovPos=Math.max(0,ovRaw), ovNeg=Math.max(0,-ovRaw);
    const transl=translBase*(1-ovNeg);
    const ovMix=ovPos;
    const pieceAlpha=MK.opacity*(1-transl)*(1-ovMix*0.6);
    const vividFilter=(MK.finish==='acrylic' && MK.vivid>0)?('saturate('+(1+MK.vivid/100*0.30)+') contrast('+(1+MK.vivid/100*0.075)+')'):'';
    if(ovNeg>0 && MK.blend!=='source-over'){
      // Intensidade overlay negativa também tem de neutralizar uma Fusão forte (Screen/Multiply/
      // Overlay escolhida no dropdown "Fusão") — sem isto, o slider negativo só mexia na
      // translucidez/vidro e ficava sem efeito nenhum sempre que a Fusão não fosse "Normal".
      // Renderiza-se a peça duas vezes sobre o mesmo fundo (com a Fusão escolhida e com Normal)
      // e mistura-se as duas consoante ovNeg — a 100% negativo fica 100% Normal/opaca.
      const bgSnap=document.createElement('canvas');bgSnap.width=w;bgSnap.height=h;
      bgSnap.getContext('2d').drawImage(ctx2.canvas,0,0);
      const renderWith=(blendMode)=>{
        const c=document.createElement('canvas');c.width=w;c.height=h;const cx3=c.getContext('2d');
        cx3.drawImage(bgSnap,0,0);
        cx3.globalAlpha=pieceAlpha;cx3.globalCompositeOperation=blendMode;
        if(vividFilter)cx3.filter=vividFilter;
        cx3.drawImage(layer,0,0);cx3.filter='none';
        return c;
      };
      const withBlend=renderWith(MK.blend), withNormal=renderWith('source-over');
      ctx2.globalAlpha=1;ctx2.globalCompositeOperation='source-over';ctx2.drawImage(withBlend,0,0);
      ctx2.globalAlpha=ovNeg;ctx2.drawImage(withNormal,0,0);ctx2.globalAlpha=1;
    }else{
      ctx2.globalAlpha=pieceAlpha; ctx2.globalCompositeOperation=MK.blend;
      if(vividFilter)ctx2.filter=vividFilter;
      ctx2.drawImage(layer,0,0); ctx2.filter='none';
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 3.05) passagem extra em 'screen' — soma o brilho da peça sobre a parede/luzes já visíveis
    // por baixo, dando o efeito de "luz projetada" do overlay em vez de painel opaco colado.
    if(ovMix>0){
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=ovMix;
      ctx2.drawImage(layer,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 3.1) HARMONIZAÇÃO — puxa ligeiramente o matiz da peça para a cor dominante da cena
    //      (composite 'color': só muda matiz/saturação, NUNCA a luminância → não escurece nem lava)
    if(full && MK.scene && MK.finish && MK.finish!=='none'){
      const clipH=hasPanel?renderShapeLayer(w,h,ratio):layer;
      const av=sceneAvgColor();
      const tint=document.createElement('canvas');tint.width=w;tint.height=h;const tx=tint.getContext('2d');
      tx.fillStyle='rgb('+(av[0]|0)+','+(av[1]|0)+','+(av[2]|0)+')'; tx.fillRect(0,0,w,h);
      tx.globalCompositeOperation='destination-in'; tx.drawImage(clipH,0,0); tx.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='color'; ctx2.globalAlpha=0.10; ctx2.drawImage(tint,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
    }
    // 3.5) AMBIENTE — reflexos de vidro. Só os REALCES FORTES da sala (janela/candeeiros)
    //      chegam à peça; a parede difusa é descartada para NÃO enevoar/lavar a cor.
    if(full && MK.scene && MK.finish && MK.finish!=='none' && MK.env>0){
      const clipL=hasPanel?renderShapeLayer(w,h,ratio):layer;
      const amt=MK.env/100;
      // H = só o que é MUITO claro na cena (isolado com brilho/contraste → médios ficam pretos)
      const H=document.createElement('canvas');H.width=w;H.height=h;const hx=H.getContext('2d');
      // blur GRANDE primeiro (mata o grão do JPEG) e só depois isola realces → reflexo liso, sem ruído
      hx.filter='blur('+Math.max(3,0.02*mn)+'px) brightness(0.6) contrast(2.9) blur('+Math.max(1,0.006*mn)+'px)';
      hx.drawImage(MK.scene,0,0,w,h); hx.filter='none';
      hx.globalCompositeOperation='destination-in'; hx.drawImage(clipL,0,0); hx.globalCompositeOperation='source-over';
      // reflexo espelhado dos realces (vidro) — localizado, subtil, recortado à placa
      const R=document.createElement('canvas');R.width=w;R.height=h;const rx=R.getContext('2d');
      rx.save(); rx.translate(0,h); rx.scale(1,-1); rx.drawImage(H,0,0); rx.restore();
      rx.globalCompositeOperation='destination-in'; rx.drawImage(clipL,0,0); rx.globalCompositeOperation='source-over';
      // SOMBRA da divisão a passar À FRENTE da placa (o que o Overlay dava) — só as sombras,
      // sem escurecer as zonas neutras → mantém a cor viva. Mapa: parede≈branco, sombra<1.
      const Sh=document.createElement('canvas');Sh.width=w;Sh.height=h;const shx=Sh.getContext('2d');
      shx.filter='blur('+Math.max(2,0.014*mn)+'px) brightness(1.5) contrast(1.35)';
      shx.drawImage(MK.scene,0,0,w,h); shx.filter='none';
      shx.globalCompositeOperation='destination-in'; shx.drawImage(clipL,0,0); shx.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='multiply'; ctx2.globalAlpha=Math.min(0.55,amt*0.6); ctx2.drawImage(Sh,0,0);
      ctx2.globalCompositeOperation='screen';
      ctx2.globalAlpha=Math.min(0.45,amt*0.42); ctx2.drawImage(H,0,0);   // realce direto (janela)
      ctx2.globalAlpha=Math.min(0.25,amt*0.16); ctx2.drawImage(R,0,0);   // reflexo espelhado
      // sheen de vidro — risca clara fina no topo (não uma lavagem larga)
      const S=document.createElement('canvas');S.width=w;S.height=h;const sx3=S.getContext('2d');
      const gg=sx3.createLinearGradient(0,0,w*0.32,h*0.32);
      gg.addColorStop(0,'rgba(255,255,255,'+(0.12*amt)+')'); gg.addColorStop(0.4,'rgba(255,255,255,0)');
      sx3.fillStyle=gg; sx3.fillRect(0,0,w,h); sx3.globalCompositeOperation='destination-in'; sx3.drawImage(clipL,0,0); sx3.globalCompositeOperation='source-over';
      ctx2.globalAlpha=1; ctx2.drawImage(S,0,0);
      ctx2.globalCompositeOperation='source-over';
    }
    // 3.6) BRILHO DE VIDRO — sinais de acrílico polido, SEMPRE no acabamento acrílico:
    //      faixa especular diagonal (reflexo de vidro) + aresta superior a apanhar luz.
    if(full && MK.finish==='acrylic'){
      const clipG=hasPanel?renderShapeLayer(w,h,ratio):layer;
      const cx=w/2, cy=h/2, LL=Math.hypot(w,h);
      // faixa especular diagonal larga e suave (alinha com a luz se a Luz de janela estiver ligada)
      const th=((MK.beamOn?MK.beamAngle:38))*Math.PI/180, nx=Math.cos(th+Math.PI/2), ny=Math.sin(th+Math.PI/2);
      const G=document.createElement('canvas');G.width=w;G.height=h;const gx2=G.getContext('2d');
      const g=gx2.createLinearGradient(cx-nx*LL/2,cy-ny*LL/2,cx+nx*LL/2,cy+ny*LL/2);
      g.addColorStop(0,'rgba(255,255,255,0)');
      g.addColorStop(0.30,'rgba(255,255,255,0)');
      g.addColorStop(0.40,'rgba(255,255,255,0.10)');   // risca principal (subtil — o reflexo real vem do Espelho)
      g.addColorStop(0.44,'rgba(255,255,255,0.03)');
      g.addColorStop(0.52,'rgba(255,255,255,0.05)');   // risca secundária ténue (dupla = vidro)
      g.addColorStop(0.56,'rgba(255,255,255,0)');
      g.addColorStop(1,'rgba(255,255,255,0)');
      gx2.fillStyle=g; gx2.fillRect(0,0,w,h);
      gx2.globalCompositeOperation='destination-in'; gx2.drawImage(clipG,0,0); gx2.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=1; ctx2.drawImage(G,0,0);
      ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
      // ARESTA (fresnel) — na peça real é só uma linha fina a apanhar luz, não uma moldura
      // brilhante. Intensidade (MK.edgeGlow) e largura (MK.edgeWidth) totalmente ajustáveis.
      if(MK.edgeGlow>0){
        const wMul=Math.max(0.1,MK.edgeWidth/50);          // 50=baseline
        const band=Math.max(2,maskExtent(clipG,w,h)*0.02*wMul);
        const halo=edgeRing(clipG,w,h,band);
        const line=edgeRing(clipG,w,h,Math.max(1,band*0.3));
        const whiten=(ring,alpha)=>{ const rc=ring.getContext('2d'); rc.globalCompositeOperation='source-in'; rc.globalAlpha=alpha; rc.fillStyle='#fff'; rc.fillRect(0,0,w,h); rc.globalAlpha=1; rc.globalCompositeOperation='source-over'; };
        whiten(halo,1); whiten(line,1);
        const gMul=MK.edgeGlow/50;                         // 50=baseline
        ctx2.globalCompositeOperation='screen';
        ctx2.globalAlpha=Math.min(1,0.18*gMul); ctx2.drawImage(halo,0,0);
        ctx2.globalAlpha=Math.min(1,0.5*gMul); ctx2.drawImage(line,0,0);
        ctx2.globalAlpha=1; ctx2.globalCompositeOperation='source-over';
      }
    }
    // 3.7) ESPELHO — reflexo verdadeiro da sala (nítido↔desfocado conforme o slider), tingido de vidro.
    //      Diferente do Ambiente (que só isola realces fortes): aqui reflete-se a cena inteira,
    //      por isso mostra elementos reconhecíveis da divisão — "screen" nunca escurece a cor.
    if(full && MK.scene && MK.finish && MK.finish!=='none' && MK.mirror>0){
      const clipM=hasPanel?renderShapeLayer(w,h,ratio):layer;
      const amtM=MK.mirror/100;
      const M=document.createElement('canvas');M.width=w;M.height=h;const mx2=M.getContext('2d');
      const blurPx=Math.max(0.6,(1-amtM)*0.05*mn+0.004*mn);   // mais Espelho = mais nítido
      mx2.filter='blur('+blurPx+'px)';
      mx2.save(); mx2.translate(0,h); mx2.scale(1,-1); mx2.drawImage(MK.scene,0,0,w,h); mx2.restore();
      mx2.filter='none';
      mx2.globalCompositeOperation='color'; mx2.globalAlpha=0.35; mx2.fillStyle='rgb(206,226,232)'; mx2.fillRect(0,0,w,h); mx2.globalAlpha=1; // tinta de vidro muito leve (o reflexo real mantém as cores da sala)
      mx2.globalCompositeOperation='destination-in'; mx2.drawImage(clipM,0,0); mx2.globalCompositeOperation='source-over';
      ctx2.globalCompositeOperation='screen'; ctx2.globalAlpha=Math.min(0.55,amtM*0.5); ctx2.drawImage(M,0,0);
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
  function _drawMock(){
    const cv=$('mockCv'); if(!cv) return; const ctx2=cv.getContext('2d');
    ctx2.clearRect(0,0,MK.cw,MK.ch);
    if(MK.scene) ctx2.drawImage(MK.scene,0,0,MK.cw,MK.ch);
    if(MK.design) compositeDesignOnto(ctx2,1);
    drawHandles();
  }
  // agrupa múltiplas chamadas no MESMO frame (vários sliders/eventos) numa só passagem —
  // mas SEMPRE com os efeitos completos (só o arrasto da peça em si, MK.dragging, é que
  // salta os efeitos pesados, para o mover/rodar/escalar ser fluido). Sliders deixam de
  // mostrar um frame "vazio" enquanto arrastas — vês sempre o resultado real.
  let _rmRAF=null;
  window.renderMock=function(){
    if(_rmRAF) return;
    _rmRAF=requestAnimationFrame(()=>{ _rmRAF=null; _drawMock(); });
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
    // tamanho BASE (encaixe na área) — o zoom é aplicado por transform, não pelo tamanho
    const base=Math.min((stage.clientWidth-40)/MK.cw,(stage.clientHeight-40)/MK.ch,1);
    cv.style.width=Math.round(MK.cw*base)+'px'; cv.style.height=Math.round(MK.ch*base)+'px';
    const ov=$('mockOv'); ov.style.width=cv.style.width; ov.style.height=cv.style.height;
    wrap.style.width=cv.style.width; wrap.style.height=cv.style.height;
    wrap.style.transformOrigin='50% 50%';
    wrap.style.transform='translate('+(MK.panX||0)+'px,'+(MK.panY||0)+'px) scale('+(MK.zoom||1)+')';
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
    // PAN: clicar fora da peça (ou botão do meio) → arrastar a vista, a qualquer zoom
    const outside = !MK.design || !hitTest(p0);
    if(outside || e.button===1){
      e.preventDefault(); if(MK.selected){ MK.selected=false; renderMock(); }
      MK.drag={type:'pan',sx:e.clientX,sy:e.clientY,opx:MK.panX||0,opy:MK.panY||0};
      $('mockOv').setPointerCapture(e.pointerId); $('mkStage').style.cursor='grabbing'; return;
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
  function onUp(e){ if(MK.drag){ const wasPan=MK.drag.type==='pan'; MK.drag=null; MK.dragging=false; try{$('mockOv').releasePointerCapture(e.pointerId);}catch(_){ } $('mkStage').style.cursor=''; if(!wasPan)renderMock(); } }
  // ZOOM da workspace
  window.mockZoom=function(factor,cxClient,cyClient){
    const old=MK.zoom||1, nz=Math.max(0.5,Math.min(8, old*factor));
    if(nz===old) return;
    // manter o ponto sob o cursor fixo (pivô = centro do stage, igual à origem do transform)
    const stage=$('mkStage'), sr=stage.getBoundingClientRect();
    const Cx=sr.left+sr.width/2, Cy=sr.top+sr.height/2;
    if(cxClient==null){ cxClient=Cx; cyClient=Cy; }
    const px=MK.panX||0, py=MK.panY||0, k=nz/old;
    MK.panX = cxClient - Cx - k*(cxClient - Cx - px);
    MK.panY = cyClient - Cy - k*(cyClient - Cy - py);
    MK.zoom=nz; fitView();
  };
  window.mockResetZoom=function(){ MK.zoom=1; MK.panX=0; MK.panY=0; fitView(); };
  function bindStage(){
    const ov=$('mockOv'); ov.addEventListener('pointerdown',onDown); ov.addEventListener('pointermove',onMove); ov.addEventListener('pointerup',onUp); ov.addEventListener('pointercancel',onUp);
    const stage=$('mkStage');
    // trackpad: pinça (ctrl/cmd+wheel) = zoom · dois dedos = mover a vista · mouse: wheel = zoom
    stage.addEventListener('wheel',e=>{ if(!MK.active||!MK.scene) return; e.preventDefault();
      if(e.ctrlKey||e.metaKey){ const f=Math.exp(-e.deltaY*0.01); mockZoom(f, e.clientX, e.clientY); }
      else if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey){ MK.panX=(MK.panX||0)-(e.shiftKey?e.deltaY:e.deltaX); fitView(); }
      else { MK.panY=(MK.panY||0)-e.deltaY; MK.panX=(MK.panX||0)-e.deltaX; fitView(); }
    },{passive:false});
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
    // Normaliza: trabalha sempre como se o canto-alvo fosse "baixo-direita", através de flips.
    // Assim o algoritmo só precisa de ser escrito uma vez, e serve para os 4 cantos.
    const flipX=(corner==='tl'||corner==='bl'), flipY=(corner==='tl'||corner==='tr');
    const work=document.createElement('canvas'); work.width=NW; work.height=NH;
    const wctx=work.getContext('2d');
    wctx.save(); wctx.translate(flipX?NW:0, flipY?NH:0); wctx.scale(flipX?-1:1, flipY?-1:1);
    wctx.drawImage(MK.scene,0,0,NW,NH); wctx.restore();

    const sz=Math.round(Math.min(NW,NH)*0.17);
    const rx=NW-sz, ry=NH-sz;
    // PREENCHIMENTO por ESPELHO DE TEXTURA (não é blur/média — continua o padrão real da parede,
    // por isso não fica "óbvio": gradientes, grão e até luz continuam corretos em vez de ficar borrado).
    // Bloco H: a coluna de parede LIMPA imediatamente à esquerda do patch, espelhada para colar na costura.
    const Hs=Math.max(0,rx-sz);
    const Hc=document.createElement('canvas'); Hc.width=sz; Hc.height=sz; const hctx=Hc.getContext('2d');
    hctx.save(); hctx.translate(sz,0); hctx.scale(-1,1); hctx.drawImage(work,Hs,ry,sz,sz,0,0,sz,sz); hctx.restore();
    // Bloco V: a linha de parede LIMPA imediatamente acima do patch, espelhada.
    const Vs=Math.max(0,ry-sz);
    const Vc=document.createElement('canvas'); Vc.width=sz; Vc.height=sz; const vctx=Vc.getContext('2d');
    vctx.save(); vctx.translate(0,sz); vctx.scale(1,-1); vctx.drawImage(work,rx,Vs,sz,sz,0,0,sz,sz); vctx.restore();
    // mistura os dois espelhos por proximidade à respetiva costura (perto da esquerda pesa H,
    // perto do topo pesa V; no canto extremo, mais longe de ambas, fica ~50/50 — sem linha visível)
    const hID=hctx.getImageData(0,0,sz,sz).data, vID=vctx.getImageData(0,0,sz,sz).data;
    const outC=document.createElement('canvas'); outC.width=sz; outC.height=sz; const octx=outC.getContext('2d');
    const outID=octx.createImageData(sz,sz), od=outID.data;
    for(let y=0;y<sz;y++){ const wV=1-y/sz; for(let x=0;x<sz;x++){ const i=(y*sz+x)*4; const wH=1-x/sz, norm=(wH+wV)||1;
      od[i]=(hID[i]*wH+vID[i]*wV)/norm; od[i+1]=(hID[i+1]*wH+vID[i+1]*wV)/norm; od[i+2]=(hID[i+2]*wH+vID[i+2]*wV)/norm; od[i+3]=255; } }
    octx.putImageData(outID,0,0);
    // desfoque GRADUAL: nítido junto às duas costuras (onde a continuidade da textura tem de bater
    // certo) e progressivamente mais desfocado no canto profundo (a zona menos fiável da estimativa —
    // esconde qualquer fragmento de objeto próximo que o espelho tenha apanhado por engano).
    const blurC=document.createElement('canvas'); blurC.width=sz; blurC.height=sz; const bctx=blurC.getContext('2d');
    bctx.filter='blur('+Math.max(2,sz*0.09)+'px)'; bctx.drawImage(outC,0,0); bctx.filter='none';
    const sharpID=octx.getImageData(0,0,sz,sz), sd=sharpID.data;
    const blurID=bctx.getImageData(0,0,sz,sz), bd=blurID.data;
    for(let y=0;y<sz;y++){ for(let x=0;x<sz;x++){ const i=(y*sz+x)*4;
      const depth=Math.min(1, Math.min(x,y)/(sz*0.55));   // 0 = junto a uma costura, 1 = canto profundo
      sd[i]=sd[i]*(1-depth)+bd[i]*depth; sd[i+1]=sd[i+1]*(1-depth)+bd[i+1]*depth; sd[i+2]=sd[i+2]*(1-depth)+bd[i+2]*depth; } }
    octx.putImageData(sharpID,0,0);
    const patch=document.createElement('canvas'); patch.width=sz; patch.height=sz; const px=patch.getContext('2d');
    px.filter='blur('+Math.max(0.6,sz*0.008)+'px)'; px.drawImage(outC,0,0); px.filter='none';
    // máscara: opaca no canto extremo, esbatida junto às duas costuras (para fundir sem emenda)
    const mask=document.createElement('canvas'); mask.width=sz; mask.height=sz;
    const mx=mask.getContext('2d'); mx.fillStyle='#fff'; mx.fillRect(0,0,sz,sz);
    const f=Math.round(sz*0.30); mx.globalCompositeOperation='destination-out';
    let gX=mx.createLinearGradient(0,0,f,0); gX.addColorStop(0,'rgba(0,0,0,1)'); gX.addColorStop(1,'rgba(0,0,0,0)');
    mx.fillStyle=gX; mx.fillRect(0,0,sz,sz);
    let gY=mx.createLinearGradient(0,0,0,f); gY.addColorStop(0,'rgba(0,0,0,1)'); gY.addColorStop(1,'rgba(0,0,0,0)');
    mx.fillStyle=gY; mx.fillRect(0,0,sz,sz);
    mx.globalCompositeOperation='source-over';
    px.globalCompositeOperation='destination-in'; px.drawImage(mask,0,0); px.globalCompositeOperation='source-over';
    wctx.drawImage(patch, rx, ry);
    // desfaz o flip de normalização e exporta
    const base=document.createElement('canvas'); base.width=NW; base.height=NH; const bx=base.getContext('2d');
    bx.save(); bx.translate(flipX?NW:0, flipY?NH:0); bx.scale(flipX?-1:1, flipY?-1:1);
    bx.drawImage(work,0,0); bx.restore();
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
      beamOn:MK.beamOn, beam:MK.beam, beamAngle:MK.beamAngle, beamPos:MK.beamPos, beamWidth:MK.beamWidth, beamSoft:MK.beamSoft, env:MK.env, mirror:MK.mirror, ink:MK.ink,
      vivid:MK.vivid, edgeGlow:MK.edgeGlow, edgeWidth:MK.edgeWidth, contact:MK.contact, glass:MK.glass,
      edgeSoft:MK.edgeSoft, edgeBorder:MK.edgeBorder, edgeBorderW:MK.edgeBorderW, edgeBorderColor:MK.edgeBorderColor,
      overlayIntensity:MK.overlayIntensity,
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
      const c01t=v=>Math.max(0,Math.min(100,+v||0));
      MK.beamOn=!!t.beamOn; MK.beam=c01t(t.beam!=null?t.beam:55); MK.beamAngle=(t.beamAngle!=null?t.beamAngle:60); MK.beamPos=c01t(t.beamPos!=null?t.beamPos:50); MK.beamWidth=c01t(t.beamWidth!=null?t.beamWidth:40); MK.beamSoft=c01t(t.beamSoft!=null?t.beamSoft:55); MK.env=c01t(t.env!=null?t.env:60); MK.mirror=c01t(t.mirror!=null?t.mirror:25); MK.ink=c01t(t.ink!=null?t.ink:65);
      MK.vivid=c01t(t.vivid!=null?t.vivid:40); MK.edgeGlow=c01t(t.edgeGlow!=null?t.edgeGlow:50); MK.edgeWidth=c01t(t.edgeWidth!=null?t.edgeWidth:50); MK.contact=c01t(t.contact!=null?t.contact:50); MK.glass=c01t(t.glass!=null?t.glass:50);
      MK.edgeSoft=c01t(t.edgeSoft!=null?t.edgeSoft:22); MK.edgeBorder=c01t(t.edgeBorder!=null?t.edgeBorder:0); MK.edgeBorderW=c01t(t.edgeBorderW!=null?t.edgeBorderW:35); MK.edgeBorderColor=t.edgeBorderColor||'#141821';
      MK.overlayIntensity=Math.max(-100,Math.min(100,+(t.overlayIntensity!=null?t.overlayIntensity:0)||0));
      MK.persp=true; MK.quad=t.quadN.map(p=>({x:p.x*MK.cw, y:p.y*MK.ch})); MK.selected=true;
      if(MK.design) buildMasked();
      // sincronizar UI
      $('mkMask').value=MK.mask; $('mkRadiusRow').style.display=shapeHasCorners()?'':'none';
      $('mkRadius').value=MK.maskRadius; $('mkRadiusV').textContent=Math.round(MK.maskRadius);
      if($('mkFinish'))$('mkFinish').value=MK.finish; if($('mkOrient'))$('mkOrient').value=MK.orient;
      if($('mkInkRow'))$('mkInkRow').style.display=(MK.finish==='acrylic')?'':'none'; if($('mkAcrRows'))$('mkAcrRows').style.display=(MK.finish==='acrylic')?'':'none';
      if($('mkFillBtn')){ $('mkFillBtn').classList.toggle('on',MK.fillPanel); $('mkFillBtn').textContent=MK.fillPanel?'Placa: cor da arte':'Preencher placa'; }
      if($('mkSize')){ $('mkSize').value=MK.size; $('mkCustomRow').style.display=(MK.size==='custom')?'':'none'; }
      if($('mkCustomW'))$('mkCustomW').value=MK.customW; if($('mkCustomH'))$('mkCustomH').value=MK.customH;
      [['mkSpill','spill'],['mkShadow','shadow'],['mkShSize','shadowSize'],['mkShAng','shadowAngle'],['mkReflect','reflect'],['mkRefAng','reflectAngle'],['mkTransl','translucency'],['mkThick','thickness'],['mkBeam','beam'],['mkBeamAng','beamAngle'],['mkBeamPos','beamPos'],['mkBeamW','beamWidth'],['mkBeamS','beamSoft'],['mkEnv','env'],['mkMirror','mirror'],['mkInk','ink'],['mkVivid','vivid'],['mkEdgeGlow','edgeGlow'],['mkEdgeWidth','edgeWidth'],['mkContact','contact'],['mkGlass','glass'],['mkEdgeSoft','edgeSoft'],['mkEdgeBorder','edgeBorder'],['mkEdgeBorderW','edgeBorderW'],['mkOverlay','overlayIntensity']].forEach(([el2,k])=>{const s=$(el2);if(s){s.value=MK[k];const v=$(el2+'V');if(v)v.textContent=Math.round(MK[k]);}});
      if($('mkEdgeBorderColor'))$('mkEdgeBorderColor').value=MK.edgeBorderColor;
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
