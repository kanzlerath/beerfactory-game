import {socket,$,api,escapeHtml,wordmark,hideSplash} from "/common.js";
$("#logo").innerHTML=wordmark("JOIN");
async function load(){
  try{
    const teams=await api("/api/public-teams");
    $("#empty").classList.toggle("hidden",teams.length>0);
    $("#teams").innerHTML=teams.map((t,i)=>`<a class="team-pick fade-in" href="/join/${t.joinCode}"><span class="eyebrow">Команда ${String(i+1).padStart(2,"0")}</span><b>${escapeHtml(t.name)}</b><span class="muted small">${t.players} участников · код ${t.joinCode}</span></a>`).join("");
  } finally { hideSplash(); }
}
socket.on("state:changed",load);load();
