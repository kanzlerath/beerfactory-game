import {socket,$,api,escapeHtml,fmtPct} from "/common.js";
let timer;
async function load(){const d=await api("/api/public-state");render(d)}
function render(d){
  clearInterval(timer);
  const r=d.round,q=r.question;
  $("#status").textContent=r.status==="open"?"Ответы принимаются":r.status==="closed"?"Время вышло":r.status==="revealed"?"Ответ":"Ожидание";
  if(!q){$("#stage").innerHTML=`<div class="question">Скоро начинаем.</div><p class="muted">Собирайте команду и готовьте телефоны.</p>`}
  else if(r.status==="revealed"){
    const answer=escapeHtml(q.options[q.correctOption]);
    const rows=(r.results||[]).map(x=>`<div class="leader"><div>${x.winner?"★":""}</div><div><b>${escapeHtml(x.teamName)}</b><div class="small muted">${x.correct} из ${x.eligible} правильно · ${fmtPct(x.accuracy)}</div></div><div class="score">${x.winner?"+1":""}</div></div>`).join("");
    $("#stage").innerHTML=`<div class="muted">Правильный ответ</div><div class="question">${answer}</div><div style="margin-top:28px">${rows}</div>`;
  } else {
    $("#stage").innerHTML=`<div class="question">${escapeHtml(q.text)}</div><div class="options" style="margin-top:26px">${q.options.map((o,i)=>`<div class="option"><b>${String.fromCharCode(65+i)}.</b> ${escapeHtml(o)}</div>`).join("")}</div><div id="timer" class="timer" style="margin-top:24px"></div>`;
    const tick=()=>{const left=Math.max(0,Math.ceil((r.endsAt-Date.now())/1000));const el=$("#timer");if(el)el.textContent=r.status==="open"?left+" сек":"Время";};
    tick();timer=setInterval(tick,250);
  }
  $("#leaders").innerHTML=d.teams.length?d.teams.map(x=>`<div class="leader"><div class="rank">#${x.rank}</div><div><b>${escapeHtml(x.name)}</b><div class="small muted">${x.players} игроков</div></div><div class="score">${x.score}</div></div>`).join(""):`<p class="muted">Команды ещё не зарегистрированы.</p>`;
}
socket.on("state:changed",load);load();
