import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, get, remove, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const FIXED_CODE = "ICNV2027";
const STORAGE_KEY = "icnv_remote_room_code";
const statusEl = document.getElementById("icnv-sync-status");
const createBtn = document.getElementById("icnv-sync-create");
const joinBtn = document.getElementById("icnv-sync-join");
const stopBtn = document.getElementById("icnv-sync-stop");
let db=null, auth=null, roomRef=null, unsubscribe=null, roomDisconnect=null;
let role="none", uid="", lastFingerprint="", publishTimer=null, takeoverPromise=null;
function status(message, roleText="") { statusEl.textContent = roleText ? `${roleText} — ${message}` : message; }
function fingerprint(s) { return JSON.stringify({open:s.open,title:s.title,number:s.number,lines:s.lines,shift:s.shift}); }
function clearSavedRole(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(STORAGE_KEY+"_role");}
function saveRole(value){localStorage.setItem(STORAGE_KEY,FIXED_CODE);localStorage.setItem(STORAGE_KEY+"_role",value);}
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
async function createMaster(automatic=false){
  const previousRole=role;
  try{
    if(!await initialize())return;
    if(!automatic)stopListener();
    roomRef=ref(db,`rooms/${FIXED_CODE}`);
    if(automatic)role="claiming";
    const initial=window.__icnvRemoteRead();
    const result=await runTransaction(roomRef,current=>{
      if(current && current.ownerUid && current.ownerUid!==uid)return;
      return {ownerUid:uid,createdAt:current?.createdAt||Date.now(),state:{...initial,updatedAt:Date.now()}};
    },{applyLocally:false});
    if(!result.committed){
      if(automatic){role="follower";status("Outro acompanhante assumiu o controle.","ACOMPANHANTE");}
      else if(previousRole==="follower"){role="follower";status("A sala ainda tem outro mestre autorizado.","ACOMPANHANTE");}
      else{role="none";status("Este aparelho não é o mestre autorizado desta sala. O mestre atual precisa desconectar para liberar a sala.");}
      if(previousRole==="follower"&&!automatic)connectFollower();
      return;
    }
    stopListener();
    role="master"; lastFingerprint=fingerprint(initial); saveRole("master");
    try{roomDisconnect=onDisconnect(roomRef);await roomDisconnect.remove();}
    catch(disconnectError){roomDisconnect=null;status("Controle iniciado, mas a liberação automática ao perder a conexão não foi ativada: "+disconnectError.message,"MESTRE");return;}
    status(automatic?"Mestre anterior desconectou. Este aparelho assumiu o controle.":"Controle iniciado. Os outros aparelhos podem conectar usando o mesmo código.","MESTRE");
  }catch(e){
    if(automatic){role="follower";status("Não foi possível assumir automaticamente: "+e.message,"ACOMPANHANTE");}
    else{role=previousRole==="follower"?"follower":"none";status("Não foi possível iniciar o controle: "+e.message);if(previousRole==="follower")connectFollower();}
  }
}
function tryTakeover(){
  if(role!=="follower"||takeoverPromise)return;
  takeoverPromise=createMaster(true).finally(()=>{takeoverPromise=null;});
}
async function connectFollower(){
  try{
    if(!await initialize())return;
    stopListener(); const target=ref(db,`rooms/${FIXED_CODE}`); const snap=await get(target);
    if(!snap.exists()){role="none";roomRef=null;status("O mestre ainda não iniciou o controle. Inicie primeiro no aparelho principal.");return;}
    roomRef=target; role="follower"; lastFingerprint=""; saveRole("follower");
    unsubscribe=onValue(target,snap=>{
      const room=snap.val();
      if(!room){if(role==="follower"){status("Mestre desconectou. Tentando liberar e assumir a sala...","ACOMPANHANTE");tryTakeover();}return;}
      const state=room.state; if(!state)return;
      const fp=fingerprint(state); if(fp===lastFingerprint)return; lastFingerprint=fp;
      window.__icnvRemoteApply?.(state); status("Conectado. Louvor e tom acompanham o aparelho mestre.","ACOMPANHANTE");
    },err=>status("Erro ao acompanhar: "+err.message));
  }catch(e){status("Não foi possível conectar: "+e.message);}
}
async function disconnect(){
  const wasMaster=role==="master";
  const currentRoomRef=roomRef;
  stopListener(); clearTimeout(publishTimer); role="none"; roomRef=null; lastFingerprint=""; clearSavedRole();
  if(wasMaster&&currentRoomRef&&db){
    try{
      if(roomDisconnect){await roomDisconnect.cancel();roomDisconnect=null;}
      const snap=await get(currentRoomRef);
      if(snap.val()?.ownerUid===uid){await remove(currentRoomRef);status("Sala liberada. Um acompanhante conectado pode assumir como mestre.");}
      else status("Este aparelho já não é o mestre da sala.");
    }catch(e){status("Não foi possível liberar a sala: "+e.message);}
  }else status("Desconectado. Este aparelho voltou ao controle local.");
}
createBtn.addEventListener("click",()=>createMaster()); joinBtn.addEventListener("click",connectFollower); stopBtn.addEventListener("click",disconnect);
const watched=["title","key","focusSongTitle","focusKey","lyrics","viewer"];
const observer=new MutationObserver(schedulePublish);
for(const id of watched){const el=document.getElementById(id);if(el)observer.observe(el,{subtree:true,childList:true,characterData:true,attributes:id==="viewer"});}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedulePublish();});
// Reconecta o papel salvo. Acompanhantes conectados assumem quando o mestre libera a sala.
if(localStorage.getItem(STORAGE_KEY)===FIXED_CODE){setTimeout(()=>{if(localStorage.getItem(STORAGE_KEY+"_role")==="master")createMaster();else connectFollower();},900);}
