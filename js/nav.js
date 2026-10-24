// Back-button support: each overlay (premium / chat / DM) pushes one history entry.
let n=0,ignore=0;
export function push(){try{history.pushState({v:1},"");n++}catch{}}
export function unwind(){if(n>0){const k=n;n=0;ignore=1;setTimeout(()=>{ignore=0},700);history.go(-k)}}
window.addEventListener("popstate",()=>{if(ignore){ignore=0;return}if(n>0)n--;window.dispatchEvent(new Event("velora:back"))});
