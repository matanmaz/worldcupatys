// ---------- 2026 World Cup Group Stage Schedule (post-draw, ET) ----------
const SCHEDULE = [
  // GROUP A
  { id:"a1", group:"A", date:"Thu Jun 11", time:"3:00 PM", teamA:"Mexico", teamB:"South Africa", venue:"Estadio Azteca, Mexico City" },
  { id:"a2", group:"A", date:"Thu Jun 11", time:"10:00 PM", teamA:"South Korea", teamB:"Czechia", venue:"Estadio Akron, Zapopan" },
  { id:"l6", group:"L", date:"Sat Jun 27", time:"5:00 PM", teamA:"Croatia", teamB:"Ghana", venue:"Lincoln Financial Field, Philadelphia" },
];

const POINTS_BUDGET = 10;
let currentSort = localStorage.getItem('wcys_sort_pref') || 'group';

// ---------- Routing ----------
const ROUTES = ["home","party","vote","volunteer","subscribe","admin"];
function showPage(route){
  if(!ROUTES.includes(route)) route = "home";
  ROUTES.forEach(r=>{
    const el = document.getElementById("page-"+r);
    if(el) el.classList.toggle("active", r===route);
  });
  document.querySelectorAll('nav a[data-route]').forEach(a=>{
    a.classList.toggle("active", a.dataset.route===route);
  });
  window.scrollTo({top:0,behavior:"instant"});
  if(route==="vote") renderSchedule();
  if(route==="admin") initAdmin();
}
function routeFromHash(){
  const h = (location.hash||"#home").replace(/^#/,"").split("?")[0];
  return h || "home";
}
window.addEventListener("hashchange", ()=>showPage(routeFromHash()));

// ---------- Voting (server-backed) ----------
const TEAM_FLAGS = {
  "Mexico":"🇲🇽","South Africa":"🇿🇦","South Korea":"🇰🇷","Czechia":"🇨🇿",
  "Canada":"🇨🇦","Bosnia & Herzegovina":"🇧🇦","Qatar":"🇶🇦","Switzerland":"🇨🇭",
  "Brazil":"🇧🇷","Morocco":"🇲🇦","Haiti":"🇭🇹","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "USA":"🇺🇸","Paraguay":"🇵🇾","Australia":"🇦🇺","Türkiye":"🇹🇷",
  "Germany":"🇩🇪","Curaçao":"🇨🇼","Ivory Coast":"🇨🇮","Ecuador":"🇪🇨",
  "Netherlands":"🇳🇱","Japan":"🇯🇵","Sweden":"🇸🇪","Tunisia":"🇹🇳",
  "Belgium":"🇧🇪","Egypt":"🇪🇬","Iran":"🇮🇷","New Zealand":"🇳🇿",
  "Spain":"🇪🇸","Cape Verde":"🇨🇻","Saudi Arabia":"🇸🇦","Uruguay":"🇺🇾",
  "France":"🇫🇷","Senegal":"🇸🇳","Iraq":"🇮🇶","Norway":"🇳🇴",
  "Argentina":"🇦🇷","Algeria":"🇩🇿","Austria":"🇦🇹","Jordan":"🇯🇴",
  "Portugal":"🇵🇹","DR Congo":"🇨🇩","Uzbekistan":"🇺🇿","Colombia":"🇨🇴",
  "England":"🇬🇧","Croatia":"🇭🇷","Ghana":"🇬🇭","Panama":"🇵🇦",
};
function flag(t){ return TEAM_FLAGS[t] || ""; }

let SERVER_RESULTS = {};       // matchId -> count
let MY_VOTES = {};             // matchId -> my count
let MY_SPENT = 0;

const $name = document.getElementById("voter-name");
const $points = document.getElementById("points-badge");
const $status = document.getElementById("vote-status");
const $errors = document.getElementById("error-box");

$name.value = localStorage.getItem("wcys_name") || "";
$name.addEventListener("change", async ()=>{
  localStorage.setItem("wcys_name", $name.value.trim());
  await loadMyVotes();
  renderSchedule();
});

function showError(msg){
  $errors.innerHTML = `<div class="error">${msg}</div>`;
  setTimeout(()=>{ $errors.innerHTML=""; }, 4000);
}
function setStatus(msg){ $status.textContent = msg || ""; }

async function loadResults(){
  try{
    const r = await fetch("/api/results");
    const j = await r.json();
    SERVER_RESULTS = j.results || {};
  }catch(e){ /* offline ok */ }
}
async function loadMyVotes(){
  const name = $name.value.trim();
  if(!name){ MY_VOTES = {}; MY_SPENT = 0; updatePoints(); return; }
  try{
    const r = await fetch("/api/user?name=" + encodeURIComponent(name));
    const j = await r.json();
    MY_VOTES = j.votes || {};
    MY_SPENT = j.spent || 0;
    updatePoints();
  }catch(e){}
}
function updatePoints(){
  const left = POINTS_BUDGET - MY_SPENT;
  $points.textContent = $name.value.trim() ? `${left} of ${POINTS_BUDGET} points left` : "Enter your name to vote";
}

async function castVote(matchId, delta){
  const name = $name.value.trim();
  if(!name){ showError("Enter your name first."); $name.focus(); return; }
  // optimistic
  MY_VOTES[matchId] = (MY_VOTES[matchId]||0) + delta;
  MY_SPENT += delta;
  SERVER_RESULTS[matchId] = Math.max(0,(SERVER_RESULTS[matchId]||0) + delta);
  updatePoints(); renderSchedule(); setStatus("saving…");
  try{
    const r = await fetch("/api/vote", {
      method:"POST",
      headers:{"content-type":"application/json"},
      body: JSON.stringify({ name, matchId, delta })
    });
    const j = await r.json();
    if(!r.ok){
      // rollback
      MY_VOTES[matchId] = (MY_VOTES[matchId]||0) - delta;
      MY_SPENT -= delta;
      SERVER_RESULTS[matchId] = Math.max(0,(SERVER_RESULTS[matchId]||0) - delta);
      showError(j.error || "Vote failed.");
      setStatus("");
      updatePoints(); renderSchedule();
      return;
    }
    // sync with server truth
    MY_VOTES = j.userVotes || MY_VOTES;
    MY_SPENT = j.spent ?? MY_SPENT;
    SERVER_RESULTS[matchId] = j.matchTotal;
    setStatus("saved ✓");
    setTimeout(()=>setStatus(""), 1200);
    updatePoints(); renderSchedule();
  }catch(e){
    showError("Network error. Check your connection.");
    setStatus("");
  }
}

function renderRow(m) {
  const myCount = MY_VOTES[m.id]||0;
  const total = SERVER_RESULTS[m.id]||0;
  const noPoints = (POINTS_BUDGET - MY_SPENT) <= 0;
  return `<tr>
    <td data-label="Date">${m.date}</td>
    <td data-label="Time (ET)">${m.time}</td>
    <td data-label="Match" class="match-cell">${flag(m.teamA)} ${m.teamA} <span style="opacity:.5">vs</span> ${flag(m.teamB)} ${m.teamB}
      ${total>0?`<span class="total-badge">${total} 🗳️</span>`:""}
    </td>
    <td data-label="Venue" class="small">${m.venue}</td>
    <td data-label="Your Vote" class="vote-cell">
      <button class="vote-btn minus" data-id="${m.id}" data-delta="-1" ${myCount<=0?"disabled":""}>-</button>
      <span class="vote-count">${myCount}</span>
      <button class="vote-btn" data-id="${m.id}" data-delta="1" ${noPoints?"disabled":""}>+</button>
    </td>
  </tr>`;
}

function renderSchedule(){
  const container = document.getElementById("schedule-container");
  if(!container) return;

  document.getElementById('sort-by-group').classList.toggle('active', currentSort === 'group');
  document.getElementById('sort-by-date').classList.toggle('active', currentSort === 'date');

  let out = [];
  if (currentSort === 'group') {
    const groups = {};
    SCHEDULE.forEach(m => { (groups[m.group] = groups[m.group] || []).push(m); });
    Object.keys(groups).sort().forEach(g => {
      const matches = groups[g];
      const teams = [...new Set(matches.flatMap(m => [m.teamA, m.teamB]))];
      out.push(`<div class="group">
        <h3>Group ${g} <span class="teams">${teams.map(t=>flag(t)+" "+t).join(" · ")}</span></h3>
        <table class="matches"><thead><tr><th>Date</th><th>Time (ET)</th><th>Match</th><th>Venue</th><th style="text-align:right">Your vote</th></tr></thead><tbody>
        ${matches.map(renderRow).join("")}
        </tbody></table></div>`);
    });
  } else { // Sort by date
    const scheduleByDate = [...SCHEDULE].sort((a, b) => new Date(a.date) - new Date(b.date));
    let currentDate = '';
    out.push('<table class="matches"><thead><tr><th>Date</th><th>Time (ET)</th><th>Match</th><th>Venue</th><th style="text-align:right">Your vote</th></tr></thead><tbody>');
    scheduleByDate.forEach(match => {
        if (match.date !== currentDate) {
            currentDate = match.date;
            out.push(`<tr><td colspan="5"><h3 class="date-header">${currentDate}</h3></td></tr>`);
        }
        out.push(renderRow(match));
    });
    out.push('</tbody></table>');
  }

  container.innerHTML = out.join("");
  container.querySelectorAll(".vote-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>castVote(btn.dataset.id, parseInt(btn.dataset.delta,10)));
  });
}

// ---------- Admin ----------
async function initAdmin(){
  const stored = sessionStorage.getItem("wcys_admin_key");
  if(stored){
    const ok = await loadAdmin(stored);
    if(ok) return;
    sessionStorage.removeItem("wcys_admin_key");
  }
  document.getElementById("admin-login").style.display = "";
  document.getElementById("admin-content").style.display = "none";
}
document.getElementById("admin-login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const key = document.getElementById("admin-key").value.trim();
  const ok = await loadAdmin(key);
  if(ok) sessionStorage.setItem("wcys_admin_key", key);
  else document.getElementById("admin-error").innerHTML = `<div class="error">Invalid admin key.</div>`;
});
document.getElementById("admin-refresh").addEventListener("click", ()=>{
  const k = sessionStorage.getItem("wcys_admin_key");
  if(k) loadAdmin(k);
});
document.getElementById("admin-logout").addEventListener("click", ()=>{
  sessionStorage.removeItem("wcys_admin_key");
  initAdmin();
});

async function loadAdmin(key){
  try{
    const r = await fetch("/api/admin?key=" + encodeURIComponent(key));
    if(!r.ok) return false;
    const data = await r.json();
    renderAdmin(data);
    document.getElementById("admin-login").style.display = "none";
    document.getElementById("admin-content").style.display = "";
    return true;
  }catch(e){ return false; }
}

function matchLabel(id){
  const m = SCHEDULE.find(x=>x.id===id);
  if(!m) return id;
  return `${flag(m.teamA)} ${m.teamA} vs ${flag(m.teamB)} ${m.teamB} <span class="small">(${m.date}, ${m.time}, Grp ${m.group})</span>`;
}

function renderAdmin(d){
  document.getElementById("admin-stats").innerHTML = `
    <div class="stat"><span class="n">${d.totalVoters}</span><span class="l">Voters</span></div>
    <div class="stat"><span class="n">${d.totalVotes}</span><span class="l">Votes cast</span></div>
    <div class="stat"><span class="n">${Object.keys(d.matches).length}</span><span class="l">Matches w/ votes</span></div>
    <div class="stat"><span class="n">${d.totalVoters>0?Math.round(d.totalVotes/d.totalVoters*10)/10:0}</span><span class="l">Avg per voter</span></div>
  `;
  const sorted = Object.entries(d.matches).sort((a,b)=>b[1]-a[1]);
  const max = sorted[0]?sorted[0][1]:1;
  document.getElementById("admin-leaderboard").innerHTML = sorted.length===0
    ? "<p><em>No votes yet.</em></p>"
    : `<table class="leaderboard"><thead><tr><th>#</th><th>Match</th><th>Votes</th></tr></thead><tbody>${
      sorted.map((row,i)=>`<tr><td>${i+1}</td><td>${matchLabel(row[0])}</td><td><span class="bar" style="width:${Math.max(8,row[1]/max*180)}px"></span>${row[1]}</td></tr>`).join("")
    }</tbody></table>`;

  document.getElementById("admin-voters").innerHTML = d.users.length===0
    ? "<p><em>No voters yet.</em></p>"
    : `<table class="leaderboard"><thead><tr><th>Name</th><th>Spent</th><th>Voted for</th><th>Last vote</th></tr></thead><tbody>${
      d.users.map(u=>{
        const picks = Object.entries(u.votes||{}).filter(([,n])=>n>0)
          .map(([id,n])=>{
            const m = SCHEDULE.find(x=>x.id===id);
            return m ? `${m.teamA} v ${m.teamB} ×${n}` : `${id} ×${n}`;
          }).join(" · ") || "—";
        const last = u.lastVote ? new Date(u.lastVote).toLocaleString() : "—";
        return `<tr><td><strong>${escapeHtml(u.name)}</strong></td><td>${u.spent}/${POINTS_BUDGET}</td><td class="small">${picks}</td><td class="small">${last}</td></tr>`;
      }).join("")
    }</tbody></table>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ---------- Form success/init ----------

// This function will run when the page loads
(async ()=>{
  const urlParams = new URLSearchParams(window.location.search);
  const successPage = (window.location.hash || "").substring(1);

  if (urlParams.has('form-success') && (successPage === 'volunteer' || successPage === 'subscribe')) {
    // Find the right success message to show
    const successDiv = document.querySelector(`#page-${successPage} .success`);
    const formEl = document.querySelector(`#page-${successPage} form`);
    if (successDiv && formEl) {
      formEl.style.display = 'none'; // Hide the form
      successDiv.style.display = 'block'; // Show the success message
    }
  }

  await loadResults();
  await loadMyVotes();
  showPage(routeFromHash());
  // Periodically refresh totals while on vote page
  setInterval(async ()=>{
    if(document.getElementById("page-vote").classList.contains("active")){
      await loadResults();
      renderSchedule();
    }
  }, 15000);
})();

document.querySelectorAll('form.vol').forEach(form => {
  form.addEventListener('submit', (e) => {
    // Validation for the subscribe form
    if (form.id === 'subscribe-form') {
      const email = form.querySelector('[name=email]').value.trim();
      const phone = form.querySelector('[name=phone]').value.trim();
      if (!email && !phone) {
        alert('Please provide either an email or a phone number so we can reach you.');
        e.preventDefault(); // IMPORTANT: Stop the form from submitting
        return;
      }
    }
  });
});
