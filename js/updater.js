import { CONFIG } from "./config.js";
import { db, fb } from "./firebase.js";
const VERSION_URL=new URL("../version.json",import.meta.url);
const cacheBust=()=>`${VERSION_URL.href}?t=${Date.now()}`;
let checking=false,reloadStarted=false;
async function readVersion(){try{const r=await fetch(cacheBust(),{cache:"no-store"});if(!r.ok)return null;const j=await r.json();return typeof j.version==="string"?j.version:null;}catch{return null;}}
function cmp(a,b){const aa=String(a).split(".").map(Number),bb=String(b).split(".").map(Number);for(let i=0;i<Math.max(aa.length,bb.length);i++){const x=aa[i]||0,y=bb[i]||0;if(x!==y)return x-y;}return 0;}
async function check(){if(checking||!navigator.onLine||reloadStarted)return;checking=true;try{const v=await readVersion();if(v&&v!==CONFIG.APP_VERSION&&cmp(v,CONFIG.APP_VERSION)!==0)await applyUpdate(v);}finally{checking=false;}}
async function applyUpdate(version){const applied=localStorage.getItem("velora-applied-version"),last=Number(sessionStorage.getItem("velora-last-reload")||0);if(applied===version||Date.now()-last<CONFIG.UPDATE_RELOAD_COOLDOWN_SECONDS*1000)return;reloadStarted=true;
  try{sessionStorage.setItem("velora-route",document.body.dataset.route||"home");sessionStorage.setItem("velora-scroll",String(window.scrollY));}catch{}
  const toast=document.getElementById("toast");if(toast){toast.textContent="Refreshing for the latest collection…";toast.classList.add("show");}
  const reg=await navigator.serviceWorker?.getRegistration().catch(()=>null);
  try{reg?.waiting?.postMessage({type:"SKIP_WAITING"});await reg?.update();}catch{}
  try{const {ref,set}=await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js");const {db}=await import("./firebase.js");await set(ref(db,"clientUpdateSignals/lastObserved"),version).catch(()=>{});}catch{}
  localStorage.setItem("velora-applied-version",version);sessionStorage.setItem("velora-last-reload",String(Date.now()));
  const reload=()=>location.reload();if(navigator.serviceWorker?.controller){navigator.serviceWorker.addEventListener("controllerchange",reload,{once:true});setTimeout(reload,3000);}else setTimeout(reload,1000);
}
if("serviceWorker" in navigator){navigator.serviceWorker.register(new URL("../sw.js",import.meta.url),{scope:"../"}).catch(()=>{});}
check();setInterval(check,CONFIG.UPDATE_POLL_SECONDS*1000);
for(const e of ["visibilitychange","focus","online","pageshow"]){window.addEventListener(e,()=>{if(e!=="visibilitychange"||document.visibilityState==="visible")check();});}
fbLive();
async function fbLive(){try{const {onValue,ref}=await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js");const {db}=await import("./firebase.js");onValue(ref(db,"appMeta/version"),snap=>{const v=snap.val();if(v&&v!==CONFIG.APP_VERSION)check();});}catch{}}
