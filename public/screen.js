import {socket,$,api,escapeHtml,fmtPct} from "/common.js";
let timer;
async function load(){const d=await api("/api/public-state");render(d)}
function render(d){
  clearInterval(timer);
  const r=d.round,q=r.question;
  $("#online").textContent=`${d.teams.reduce((n,t)=>n+t.players,0)} игроков · ${d.teams.length} команд`;
  $("#status").textContent=r.status==="open"?"Играем":r.status==="closed"?"Стоп":r.status==="revealed"?"Результат":"Ожидание";
  if(!q){
    $("#stage").innerHTML=`<div class="grid grid2" style="align-items:center"><div><div class="kicker">12 лет — полёт нормальный</div><div class="question" style="margin-top:10px">Соберите команду.<br>Дальше будет интересно.</div><p class="muted" style="font-size:18px;margin-top:18px">Сканируйте QR и выбирайте свою команду.</p></div><div class="join-box"><img class="qr-large" src="/api/join-qr.svg" alt="QR для входа"><div><div class="eyebrow">Вход в игру</div><h2 style="font-size:30px;margin:8px 0">Один QR для всех</h2><p class="muted">После сканирования выберите команду и укажите имя.</p></div></div></div>`;
  } else if(r.status==="revealed"){
    const answer=escapeHtml(q.options[q.correctOption]);
    const rows=(r.results||[]).map(x=>`<div class="leader ${x.winner?"winner":""}" style="padding-left:14px;padding-right:14px;border-radius:14px"><div class="rank">${x.winner?"★":"—"}</div><div><b>${escapeHtml(x.teamName)}</b><div class="small muted">${x.correct} из ${x.eligible} · ${fmtPct(x.accuracy)}</div></div><div class="score">${x.winner?"+1":fmtPct(x.accuracy)}</div></div>`).join("");
    $("#stage").innerHTML=`<div class="eyebrow">Правильный ответ</div><div class="question" style="margin-top:8px">${answer}</div><div style="margin-top:30px">${rows}</div>`;
  } else {
    $("#stage").innerHTML=`<div class="eyebrow">Вопрос</div><div class="question" style="margin-top:8px">${escapeHtml(q.text)}</div><div class="options" style="margin-top:28px">${q.options.map((o,i)=>`<div class="option"><span class="answer-badge">${String.fromCharCode(65+i)}</span>${escapeHtml(o)}</div>`).join("")}</div><div id="timer" class="timer" style="margin-top:26px"></div><div class="progress"><i id="bar"></i></div>`;
    const tick=()=>{const left=Math.max(0,(r.endsAt-Date.now())/1000);const el=$("#timer");const bar=$("#bar");if(el)el.textContent=r.status==="open"?Math.ceil(left):"0";if(bar)bar.style.width=Math.max(0,Math.min(100,(left/q.durationSec)*100))+"%";};
    tick();timer=setInterval(tick,100);
  }
  $("#leaders").innerHTML=d.teams.length?d.teams.map(x=>`<div class="leader"><div class="rank">#${x.rank}</div><div><b>${escapeHtml(x.name)}</b><div class="small muted">${x.players} игроков</div></div><div class="score">${x.score}</div></div>`).join(""):`<p class="muted">Команды ещё не зарегистрированы.</p>`;
}
socket.on("state:changed",load);load();
