/* ========================================================================== 
   LEAF² VISUAL MORATORIUM

   Experimental ecology may run. Unapproved visual substitutions may not.
   Restore the source world's actual renderers and measure its subtle gyre silk
   in place, without replacing it with a louder persistence layer.
   ========================================================================== */
(function(){
'use strict';
const A=globalThis.LEAF2_ANCESTRAL_VISUALS;if(!A)return;
function install(name,fn){if(typeof fn!=='function')return;try{globalThis[name]=fn;eval(name+' = fn')}catch(_){}}
for(const [name,fn] of Object.entries(A))install(name,fn);

let silkVisible=true;
const ancestralTrails=A.drawGyreTrails,ancestralGyres=A.drawGyres;
drawGyreTrails=function(){
  if(!silkVisible)return;
  const t=performance.now();ancestralTrails();
  try{if(globalThis.LEAF2&&LEAF2.stats)LEAF2.stats.trailBuildMs=(LEAF2.stats.trailBuildMs||0)*.88+(performance.now()-t)*.12}catch(_){}
};
drawGyres=function(){
  const t=performance.now();ancestralGyres();
  try{if(globalThis.LEAF2&&LEAF2.stats)LEAF2.stats.gyreDrawMs=(LEAF2.stats.gyreDrawMs||0)*.88+(performance.now()-t)*.12}catch(_){}
};
install('drawGyreTrails',drawGyreTrails);install('drawGyres',drawGyres);

const style=document.createElement('style');style.textContent='#leaf2-beings{display:none!important}';document.head.appendChild(style);

if(globalThis.LEAF2){
  LEAF2.setTrails=function(value){silkVisible=!!value;return silkVisible};
  LEAF2.visuals={state:'ancestral',silkVisible:()=>silkVisible};
}
addEventListener('keydown',event=>{
  if(event.altKey&&(event.key==='s'||event.key==='S')){event.preventDefault();silkVisible=!silkVisible}
},true);
})();
