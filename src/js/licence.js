// ══ LICENCE PRO : clé signée (ECDSA P-256), vérifiée hors ligne ═══════════════
// Format « ST1.<données>.<signature> » (voir api/_licence.js). Sans licence : version gratuite
// (verrous de light-lock.js). Activation : retour de Stripe (?session_id=…), lien offert
// (#licence=…) ou clé collée dans la fenêtre « Passer à Pro ».
const LICENCE_PUBKEY='{{LICENCE_PUBKEY}}'; // coordonnées x.y de la clé publique (base64url)
const LICENCE_PRICE='{{LICENCE_PRICE}}';
const LICENCE_RE=/^ST1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{86})$/;
function _b64u(s){const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
function licenceParse(k){
  const m=LICENCE_RE.exec(String(k||'').trim());if(!m)return null;
  try{const p=JSON.parse(new TextDecoder().decode(_b64u(m[1])));return p&&p.v===1&&typeof p.id==='string'?{p,data:m[1],sig:m[2]}:null;}catch(e){return null;}
}
async function licenceVerify(k){
  const l=licenceParse(k);if(!l||!window.crypto||!crypto.subtle)return false;
  try{
    const [x,y]=LICENCE_PUBKEY.split('.');
    const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x,y,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,_b64u(l.sig),new TextEncoder().encode('ST1.'+l.data));
  }catch(e){return false;}
}
// Lecture synchrone au démarrage (IS_PRO) ; la signature est revérifiée juste après (licenceCheckStored)
function licenceActive(){return !!licenceParse(store.get('licence'));}

function _licenceMsg(key,isErr){
  const el=document.getElementById('licence-msg');if(!el)return;
  el.textContent=key?t(key):'';el.classList.toggle('err',!!isErr);
}
async function licenceActivate(k,{silent}={}){
  const key=String(k||'').trim();
  if(!(await licenceVerify(key))){if(!silent)_licenceMsg('licenceInvalid',true);return false;}
  store.set('licence',key);
  // Adresse nettoyée (ni session Stripe ni clé dans l'historique), puis rechargement en version Pro
  location.replace(location.pathname);
  return true;
}
function licenceFromInput(){
  const inp=document.getElementById('licence-input');
  _licenceMsg('licenceChecking');
  licenceActivate(inp?inp.value:'');
}
async function licenceBuy(){
  _licenceMsg('licenceRedirect');
  try{
    const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:currentLang})});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.url&&/^https:\/\/checkout\.stripe\.com\//.test(j.url)){location.href=j.url;return;}
  }catch(e){}
  _licenceMsg('licenceBuyError',true);
}
// Retour de Stripe Checkout ou lien d'activation offert
async function licenceFromUrl(){
  const sid=new URLSearchParams(location.search).get('session_id');
  const hash=/^#licence=(ST1\.[A-Za-z0-9_.-]+)$/.exec(location.hash);
  if(hash){
    if(!(await licenceActivate(hash[1],{silent:true}))){window.history.replaceState(null,'',location.pathname);_spop();_licenceMsg('licenceInvalid',true);}
    return;
  }
  if(!sid)return;
  _spop();_licenceMsg('licenceChecking');
  try{
    const r=await fetch('/api/licence?session_id='+encodeURIComponent(sid));
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.licence&&(await licenceActivate(j.licence,{silent:true})))return;
  }catch(e){}
  window.history.replaceState(null,'',location.pathname);
  _licenceMsg('licencePaymentError',true);
}
// Une licence stockée mais invalide (modifiée à la main, autre clé) est retirée
async function licenceCheckStored(){
  const k=store.get('licence');
  if(k&&!(await licenceVerify(k))){store.del('licence');location.replace(location.pathname);}
}
function licenceCopy(){
  const k=store.get('licence')||'';
  const done=()=>_licenceRow(true);
  if(navigator.clipboard)navigator.clipboard.writeText(k).then(done,done);else done();
}
// Ligne « Licence » des réglages
function _licenceRow(copied){
  const row=document.getElementById('licence-row');if(!row)return;
  const on=licenceActive();
  const st=row.querySelector('#licence-status'),btn=row.querySelector('#licence-action');
  st.textContent=on?t('licenceOn'):t('licenceOff');
  btn.textContent=on?(copied?t('licenceCopied'):t('licenceCopy')):t('proBuy').replace('{p}',LICENCE_PRICE);
  btn.onclick=on?licenceCopy:()=>_spop();
}
// Textes de la fenêtre Pro et de la ligne des réglages (appelé par applyLang)
function licenceRenderTexts(){
  const set=(id,txt)=>{const el=document.getElementById(id);if(el)el.textContent=txt;};
  set('pro-pitch',t('proPitch'));
  set('pro-price',t('proPrice').replace('{p}',LICENCE_PRICE));
  set('pro-buy',t('proBuy').replace('{p}',LICENCE_PRICE));
  set('pro-have-key',t('proHaveKey'));
  set('licence-activate',t('proActivate'));
  set('pro-close',t('ariaClose'));
  const inp=document.getElementById('licence-input');if(inp)inp.setAttribute('aria-label',t('proKeyLabel'));
  _licenceRow();
}
// Au démarrage, une fois la page entière analysée (la fenêtre Pro est placée après ce script)
(function(){const go=()=>{licenceCheckStored();licenceFromUrl();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();})();
