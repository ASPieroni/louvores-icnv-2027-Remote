import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const FIXED_CODE = "ICNV2027";
const STORAGE_KEY = "icnv_remote_room_code";
const statusEl = document.getElementById("icnv-sync-status");
const createBtn = document.getElementById("icnv-sync-create");
const joinBtn = document.getElementById("icnv-sync-join");
const stopBtn = document.getElementById("icnv-sync-stop");
let db=null, auth=null, roomRef=null, unsubscribe=null;
let role="none", uid="", lastFingerprint="", publishTimer=null;
function status(message, roleText="") { statusEl.textContent = roleText ? `${roleText} — ${message}` : message; }
function fingerprint(s) { return JSON.stringify({open:s.open,title:s.title,number:s.number,lines:s.lines,shift:s.shift}); }
async function initialize(){
  const cfg=window.ICNV_FIREBASE_CONFIG;
  if(!cfg || !cfg.apiKey || cfg.apiKey.startsWith("COLE_") || !cfg.databaseURL || cfg.projectId==="SEU-PROJETO"){
    status("Configure firebase-config.js e siga o LEIA-ME para ativar a sincronização."); return false;
  }
  if(!db){ const app=initializeApp(cfg); auth=getAuth(app); db=getDatabase(app); }
  if(!auth.currentUser){ const credential=await signInAnonymously(auth); uid=credential.user.uid; }
  else uid=auth.currentUser.uid;
  return true;
}
function stopListener(){ if(unsubscribe) unsubscribe(); unsubscribe=null; }
async function publish(){
  if(role!=="master" || !roomRef || !window.__icnvRemoteRead) return;
  const state=window.__icnvRemoteRead();
  if(Array.isArray(state.lines) && state.lines.reduce((n,line)=>n+String(line).length,0)>60000){status("A letra/cifra excede o limite de transmissão desta versão.");return;}
  const fp=fingerprint(state); if(fp===lastFingerprint)return; lastFingerprint=fp;
  await set(ref(db,`rooms/${FIXED_CODE}/state`),{...state,updatedAt:Date.now()});
}
function schedulePublish(){ if(role!=="master" || window.__icnvRemoteIsApplying?.())return; clearTimeout(publishTimer); publishTimer=setTimeout(()=>publish().catch(e=>status("Falha ao enviar comando: "+e.message)),120); }
async function createMaster(){
  try{
    if(!await initialize())return;
    stopListener(); roomRef=ref(db,`rooms/${FIXED_CODE}`);
    const snap=await get(roomRef); const existing=snap.val();
    if(existing && existing.ownerUid && existing.ownerUid!==uid){status("Este aparelho não é o mestre autorizado desta sala. Use o aparelho que iniciou o controle originalmente.");return;}
    const initial=window.__icnvRemoteRead();
    await set(roomRef,{ownerUid:uid,createdAt:existing?.createdAt||Date.now(),state:{...initial,updatedAt:Date.now()}});
    role="master"; lastFingerprint=fingerprint(initial); localStorage.setItem(STORAGE_KEY,FIXED_CODE); localStorage.setItem(STORAGE_KEY+"_role","master");
    status("Controle iniciado. Os outros aparelhos podem conectar usando o mesmo código.","MESTRE");
  }catch(e){role="none";status("Não foi possível iniciar o controle: "+e.message);}
}
async function connectFollower(){
  try{
    if(!await initialize())return;
    stopListener(); const target=ref(db,`rooms/${FIXED_CODE}`); const snap=await get(target);
    if(!snap.exists()){status("O mestre ainda não iniciou o controle. Inicie primeiro no aparelho principal.");return;}
    roomRef=target; role="follower"; lastFingerprint=""; localStorage.setItem(STORAGE_KEY,FIXED_CODE); localStorage.setItem(STORAGE_KEY+"_role","follower");
    unsubscribe=onValue(ref(db,`rooms/${FIXED_CODE}/state`),snap=>{
      const state=snap.val(); if(!state)return; const fp=fingerprint(state); if(fp===lastFingerprint)return; lastFingerprint=fp;
      window.__icnvRemoteApply?.(state); status("Conectado. Louvor e tom acompanham o aparelho mestre.","ACOMPANHANTE");
    },err=>status("Erro ao acompanhar: "+err.message));
  }catch(e){status("Não foi possível conectar: "+e.message);}
}
function disconnect(){stopListener();role="none";roomRef=null;lastFingerprint="";localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(STORAGE_KEY+"_role");status("Desconectado. Este aparelho voltou ao controle local.");}
createBtn.addEventListener("click",createMaster); joinBtn.addEventListener("click",connectFollower); stopBtn.addEventListener("click",disconnect);
const watched=["title","key","focusSongTitle","focusKey","lyrics","viewer"];
const observer=new MutationObserver(schedulePublish);
for(const id of watched){const el=document.getElementById(id);if(el)observer.observe(el,{subtree:true,childList:true,characterData:true,attributes:id==="viewer"});}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedulePublish();});
// O código fixo é lembrado neste aparelho; acompanhantes reconectam automaticamente após recarregar.
if(localStorage.getItem(STORAGE_KEY)===FIXED_CODE){setTimeout(()=>{if(localStorage.getItem(STORAGE_KEY+"_role")==="master")createMaster();else connectFollower();},900);}
