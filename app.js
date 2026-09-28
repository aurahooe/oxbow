const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const views = { wall: $("view-wall"), desk: $("view-desk"), gate: $("view-gate") };
let session = null;
let profile = null;
function hourKey(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.toISOString().slice(0, 13) + ":00Z";
}
function show(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("is-on", k === name));
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("is-on", b.dataset.go === name));
  if (name === "desk") loadMine();
}
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));
function tick() {
  const now = new Date();
  $("clock-time").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  const ms = next - now;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  $("clock-left").textContent = `${m}m ${String(s).padStart(2, "0")}s to the next hour`;
}
setInterval(tick, 1000);
tick();
function escapeHtml(s) {
  return String(s ?? "").replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">");
}
async function loadHour() {
  const key = hourKey();
  $("hour-key").textContent = key;
  const { data } = await sb.from("oxbow_hours").select("headline, blurb, slip_id, hour_key").eq("hour_key", key).maybeSingle();
  const hour = data || { headline: "The river is between turns", blurb: "A new dispatch prints at the top of every hour. Public slips stay on the wall below.", slip_id: null };
  $("hour-headline").textContent = hour.headline;
  $("hour-blurb").textContent = hour.blurb;
  const box = $("hour-featured");
  if (hour.slip_id) {
    const { data: slip } = await sb.from("oxbow_slips").select("title, body, author_id").eq("id", hour.slip_id).maybeSingle();
    if (slip) {
      const { data: whoRow } = await sb.from("oxbow_profiles").select("handle, display_name").eq("id", slip.author_id).maybeSingle();
      box.hidden = false;
      const who = whoRow?.display_name || whoRow?.handle || "someone";
      box.innerHTML = `<p class="who">Featured slip · ${escapeHtml(who)}</p><h3>${escapeHtml(slip.title)}</h3><p>${escapeHtml(slip.body)}</p>`;
      return;
    }
  }
  box.hidden = true;
}
async function loadWall() {
  const { data } = await sb.from("oxbow_slips").select("id, title, body, created_at, author_id").eq("is_public", true).order("created_at", { ascending: false }).limit(60);
  const ids = [...new Set((data || []).map((s) => s.author_id))];
  let names = {};
  if (ids.length) {
    const { data: profs } = await sb.from("oxbow_profiles").select("id, handle, display_name").in("id", ids);
    (profs || []).forEach((p) => { names[p.id] = p.display_name || p.handle; });
  }
  const wall = $("wall");
  if (!data?.length) {
    wall.innerHTML = `<p class="empty">The wall is empty. Sign in, write a slip, and pin it public.</p>`;
    return;
  }
  wall.innerHTML = data.map((s, i) => `<article class="card" style="animation-delay:${i * 40}ms"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p><div class="meta">${escapeHtml(names[s.author_id] || "anon")} · ${new Date(s.created_at).toLocaleString()}</div></article>`).join("");
}
async function loadMine() {
  if (!session) {
    $("desk-who").textContent = "Sign in to keep a drawer.";
    $("slip-form").hidden = true;
    $("mine").innerHTML = "";
    return;
  }
  $("slip-form").hidden = false;
  $("desk-who").textContent = profile ? `Writing as ${profile.display_name} (@${profile.handle})` : session.user.email;
  const { data } = await sb.from("oxbow_slips").select("*").eq("author_id", session.user.id).order("created_at", { ascending: false });
  const mine = $("mine");
  if (!data?.length) {
    mine.innerHTML = `<p class="empty">Nothing in the drawer yet.</p>`;
    return;
  }
  mine.innerHTML = data.map((s) => `<article class="card"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p><div class="meta">${s.is_public ? "on the wall" : "private"} · ${new Date(s.created_at).toLocaleString()}</div><div class="slip-actions"><button type="button" data-toggle="${s.id}" data-public="${s.is_public}">${s.is_public ? "Make private" : "Pin public"}</button><button type="button" data-del="${s.id}">Delete</button></div></article>`).join("");
  mine.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      const next = b.dataset.public !== "true";
      await sb.from("oxbow_slips").update({ is_public: next, updated_at: new Date().toISOString() }).eq("id", b.dataset.toggle);
      await Promise.all([loadMine(), loadWall()]);
    };
  });
  mine.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      await sb.from("oxbow_slips").delete().eq("id", b.dataset.del);
      await Promise.all([loadMine(), loadWall()]);
    };
  });
}
$("slip-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const { error } = await sb.from("oxbow_slips").insert({ author_id: session.user.id, title: String(fd.get("title")).trim(), body: String(fd.get("body")).trim(), is_public: fd.get("is_public") === "on" });
  if (error) { alert(error.message); return; }
  e.target.reset();
  await Promise.all([loadMine(), loadWall()]);
});
async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  profile = null;
  if (session) {
    const { data: p } = await sb.from("oxbow_profiles").select("*").eq("id", session.user.id).maybeSingle();
    profile = p;
    $("nav-auth").textContent = profile?.handle ? `@${profile.handle}` : "Account";
    $("gate-title").textContent = "You're in";
    $("auth-form").hidden = true;
    $("signout").hidden = false;
  } else {
    $("nav-auth").textContent = "Sign in";
    $("gate-title").textContent = "Come in";
    $("auth-form").hidden = false;
    $("signout").hidden = true;
  }
}
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  $("auth-msg").textContent = error ? error.message : "";
  if (!error) { await refreshAuth(); show("desk"); }
});
$("signup").addEventListener("click", async () => {
  const fd = new FormData($("auth-form"));
  const { error } = await sb.auth.signUp({ email: String(fd.get("email")), password: String(fd.get("password")) });
  $("auth-msg").textContent = error ? error.message : "Account created. If email confirmation is on, check your inbox — then sign in.";
  if (!error) await refreshAuth();
});
$("signout").addEventListener("click", async () => {
  await sb.auth.signOut();
  await refreshAuth();
  show("wall");
});
sb.auth.onAuthStateChange(async () => { await refreshAuth(); loadMine(); });
(async function init() {
  await refreshAuth();
  await Promise.all([loadHour(), loadWall()]);
  setInterval(loadHour, 30000);
})();
