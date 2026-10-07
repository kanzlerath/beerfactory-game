import {socket,$,api,escapeHtml} from "/common.js";
const code=location.pathname.split("/").filter(Boolean).pop().toUpperCase();
const storageKey="beerfactory:"+code+":player";
let playerId=localStorage.getItem(storageKey)||"";
let current=null;
async function join(name){
  const data=await api("/api/join/"+code,{method:"POST",body:JSON.stringify({name,playerId})});
  playerId=data.player.id;localStorage.setItem(storageKey,playerId);$("#teamBadge").textContent=data.team.name;await load();
}
async function load(){
  if(!playerId)return;
  try{current=await api("/api/player-state/"+playerId);render()}catch{localStorage.removeItem(storageKey);playerId="";$("#joinCard").classList.remove("hidden");$("#game").classList.add("hidden")}
}
function render(){
  $("#joinCard").classList.add("hidden");$("#game").classList.remove("hidden");$("#teamBadge").textContent=current.team?.name||"";
  const r=current.round,q=r.question;
  if(!q){$("#game").innerHTML=`<div class="card"><h1>Вы в игре, ${escapeHtml(current.player.name)}.</h1><p class="muted">Ждём следующий вопрос.</p></div>`;return}
  if(!r.eligible){$("#game").innerHTML=`<div class="card"><h2>Вопрос уже идёт</h2><p class="muted">Вы подключились после старта. В следующем вопросе сможете отвечать.</p></div>`;return}
  if(r.status==="open"){
    $("#game").innerHTML=`<div class="card"><div class="muted small">Вопрос</div><h1>${escapeHtml(q.text)}</h1><div id="mobileTimer" class="score"></div><div class="grid" style="margin-top:18px">${q.options.map((o,i)=>`<button class="option answer ${r.answer?.option===i?"selected":""}" data-option="${i}" ${r.answer?"disabled":""}><b>${String.fromCharCode(65+i)}.</b> ${escapeHtml(o)}</button>`).join("")}</div><p class="muted small" style="margin-top:14px">${r.answer?"Ответ принят. Изменить его уже нельзя.":"Выберите один вариант."}</p></div>`;
    const tick=()=>{const el=$("#mobileTimer");if(el)el.textContent=Math.max(0,Math.ceil((r.endsAt-Date.now())/1000))+" сек";};tick();setTimeout(tick,250);return
  }
  if(r.status==="closed"){$("#game").innerHTML=`<div class="card"><h1>Ответы закрыты</h1><p class="muted">Смотрим на общий экран.</p></div>`;return}
  if(r.status==="revealed"){
    const correct=r.answer?.option===q.correctOption;
    $("#game").innerHTML=`<div class="card"><div class="muted">Правильный ответ</div><h1>${escapeHtml(q.options[q.correctOption])}</h1><p class="${correct?"ok":"muted"}">${r.answer?(correct?"Ваш ответ правильный.":"В этот раз мимо."):"Вы не успели ответить."}</p></div>`;
  }
}
$("#joinForm").addEventListener("submit",async e=>{e.preventDefault();$("#joinError").textContent="";try{await join($("#name").value.trim())}catch(err){$("#joinError").textContent=err.message}});
$("#game").addEventListener("click",async e=>{const btn=e.target.closest(".answer");if(!btn||btn.disabled)return;try{btn.disabled=true;await api("/api/answer",{method:"POST",body:JSON.stringify({playerId,option:Number(btn.dataset.option)})});await load()}catch(err){alert(err.message);await load()}});
socket.on("state:changed",load);
if(playerId)load();
