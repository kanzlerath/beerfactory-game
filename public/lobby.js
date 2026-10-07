import {socket,$,api,escapeHtml} from "/common.js";
async function load(){
  const teams=await api("/api/public-teams");
  $("#empty").classList.toggle("hidden",teams.length>0);
  $("#teams").innerHTML=teams.map(t=>`<a class="team-pick" href="/join/${t.joinCode}"><b>${escapeHtml(t.name)}</b><span class="muted small">${t.players} игроков · код ${t.joinCode}</span></a>`).join("");
}
socket.on("state:changed",load);load();
