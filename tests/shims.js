/* SOLO PARA PRUEBAS: sustitutos de librerías del CDN (sin red en el entorno de pruebas) */
(function(){
if (window.__shims) return; window.__shims = true;
/* qrcode-generator */
window.qrcode = function(t, e){ let d=''; return { addData(x){d=x}, make(){}, getModuleCount(){return 25},
  createDataURL(cell, margin){ cell=cell||2; margin=margin||0; const n=25, s=n*cell+margin*2, c=document.createElement('canvas'); c.width=c.height=s; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,s,s); x.fillStyle='#000';
    let h=0; for(const ch of d) h=(h*31+ch.charCodeAt(0))>>>0;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){ h=(h*1103515245+12345)>>>0; const fp=(i<7&&j<7)||(i<7&&j>n-8)||(i>n-8&&j<7); if(fp? (i%6===0||j%6===0||(i%6>1&&i%6<5&&j%6>1&&j%6<5)) : (h>>16)&1) x.fillRect(margin+j*cell, margin+i*cell, cell, cell); }
    return c.toDataURL('image/png'); } }; };
/* bwip-js */
window.bwipjs = { toCanvas(cv, o){ cv.width=300; cv.height=90; const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,300,90); x.fillStyle='#000'; for(let i=0;i<300;i+=3) if((i*7+o.text.length)%5<3) x.fillRect(i,0,2,90); return cv; }, toSVG(){ return '<svg viewBox="0 0 10 10"></svg>'; } };
/* html2canvas: lienzo blanco del tamaño del elemento con su texto (solo prueba el flujo) */
window.html2canvas = async function(el, o){ const r=el.getBoundingClientRect(), k=o.scale||1, c=document.createElement('canvas'); c.width=Math.round(r.width*k); c.height=Math.round(r.height*k);
  const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.fillStyle='#354FA3'; x.fillRect(0,0,c.width,40*k); x.fillStyle='#1A2233'; x.font=(14*k)+'px Arial';
  const lines=el.innerText.split('\n').filter(Boolean).slice(0,60); lines.forEach((l,i)=>x.fillText(l.slice(0,90), 20*k, (60+i*16)*k));
  for(const im of el.querySelectorAll('img')){ try{ const ir=im.getBoundingClientRect(); if(ir.width>20) x.drawImage(im,(ir.left-r.left)*k,(ir.top-r.top)*k,ir.width*k,ir.height*k);}catch(e){} }
  return c; };
/* jsPDF mínimo: páginas con una imagen JPEG + enlaces */
function jpegSize(u8){ let i=2; while(i<u8.length){ if(u8[i]!==0xFF){i++;continue} const m=u8[i+1], len=(u8[i+2]<<8)|u8[i+3]; if(m>=0xC0&&m<=0xC2) return {h:(u8[i+5]<<8)|u8[i+6], w:(u8[i+7]<<8)|u8[i+8]}; i+=2+len; } return {w:1,h:1}; }
function b64u8(d){ const b=atob(d.split(',')[1]); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
function jsPDF(opts){ const fmt=opts.format==='letter'?[612,792]:opts.format; let W=fmt[0],H=fmt[1]; if(opts.orientation==='landscape'&&W<H){[W,H]=[H,W]}
  const pages=[{W,H,img:null,links:[]}]; let props={};
  return { addPage(){ pages.push({W,H,img:null,links:[]}); }, addImage(d,t,x,y,w,h){ const u=b64u8(d); pages[pages.length-1].img={u,x,y,w,h,px:jpegSize(u)}; },
    link(x,y,w,h,o){ pages[pages.length-1].links.push({x,y,w,h,url:o.url}); }, setProperties(p){props=p},
    output(kind){ const parts=[]; let len=0; const offs=[]; const enc=s=>{const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i)&255; return u};
      const push=u=>{ if(typeof u==='string') u=enc(u); parts.push(u); len+=u.length; };
      const objs=[]; const add=(fn)=>{ objs.push(fn); return objs.length; };
      const pageIds=[]; push('%PDF-1.4\n');
      const plan=[]; let n=2; pages.forEach(p=>{ const pid=++n, cid=++n, iid=++n; const lids=p.links.map(()=>++n); plan.push({p,pid,cid,iid,lids}); pageIds.push(pid); });
      const infoId=++n;
      const obj=(id,body,stream)=>{ offs[id]=len; push(id+' 0 obj\n'+body); if(stream){ push('\nstream\n'); push(stream); push('\nendstream'); } push('\nendobj\n'); };
      obj(1,'<</Type/Catalog/Pages 2 0 R>>');
      obj(2,'<</Type/Pages/Kids['+pageIds.map(i=>i+' 0 R').join(' ')+']/Count '+pageIds.length+'>>');
      plan.forEach(({p,pid,cid,iid,lids})=>{ const im=p.img;
        obj(pid,'<</Type/Page/Parent 2 0 R/MediaBox[0 0 '+p.W+' '+p.H+']/Resources<</XObject<</Im1 '+iid+' 0 R>>>>/Contents '+cid+' 0 R/Annots['+lids.map(i=>i+' 0 R').join(' ')+']>>');
        const cs=im?'q '+im.w.toFixed(2)+' 0 0 '+im.h.toFixed(2)+' '+im.x.toFixed(2)+' '+(p.H-im.y-im.h).toFixed(2)+' cm /Im1 Do Q':'';
        const imgw=im?im.w:1; obj(cid,'<</Length '+cs.length+'>>',cs);
        if(im) obj(iid,'<</Type/XObject/Subtype/Image/Width '+im.px.w+'/Height '+im.px.h+'/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length '+im.u.length+'>>',im.u);
        else obj(iid,'<</Type/XObject/Subtype/Image/Width 1/Height 1/ColorSpace/DeviceGray/BitsPerComponent 8/Length 1>>','\xff');
        p.links.forEach((l,k)=>obj(lids[k],'<</Type/Annot/Subtype/Link/Rect['+[l.x,p.H-l.y-l.h,l.x+l.w,p.H-l.y].map(v=>v.toFixed(2)).join(' ')+']/Border[0 0 0]/A<</S/URI/URI('+l.url.replace(/[()\\]/g,'\\$&')+')>>>>'));
      });
      obj(infoId,'<</Title('+String(props.title||'').replace(/[()\\]/g,'')+')>>');
      const xref=len; push('xref\n0 '+(n+1)+'\n0000000000 65535 f \n'); for(let i=1;i<=n;i++) push(String(offs[i]||0).padStart(10,'0')+' 00000 n \n');
      push('trailer\n<</Size '+(n+1)+'/Root 1 0 R/Info '+infoId+' 0 R>>\nstartxref\n'+xref+'\n%%EOF');
      const out=new Uint8Array(len); let o=0; parts.forEach(u=>{out.set(u,o);o+=u.length});
      return kind==='blob'? new Blob([out],{type:'application/pdf'}) : out.buffer; } };
}
window.jspdf = { jsPDF };
})();
