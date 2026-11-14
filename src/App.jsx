import React, { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, BarChart3, Check, ChevronRight, CirclePlus, Clock3, LayoutDashboard, LogOut, Plus, Search, Ticket, Trash2, Users, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const api = async (url, options = {}) => {
  const token = localStorage.getItem("qf_token");
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};
const initials = name => (name || "Q").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("qf_token", data.token); onLogin(data.user);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="auth-wrap"><div className="auth-card">
    <div className="brand-mark"><Ticket size={22}/></div><p className="eyebrow">QUEUEFLOW MANAGER</p>
    <h1>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
    <p className="muted">Keep every line moving, one token at a time.</p>
    <form onSubmit={submit} className="auth-form">
      {mode === "register" && <label>Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name"/></label>}
      <label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label>
      <label>Password<input required minLength="6" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="At least 6 characters"/></label>
      {error && <div className="error">{error}</div>}
      <button className="primary full" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"} <ChevronRight size={17}/></button>
    </form>
    <p className="switch-auth">{mode === "login" ? "New to QueueFlow?" : "Already have an account?"} <button onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"Create account":"Sign in"}</button></p>
  </div><div className="auth-note">SIMPLE QUEUE MANAGEMENT · BUILT FOR BUSY TEAMS</div></div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [queues, setQueues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [analytics, setAnalytics] = useState({ totals: {}, trend: [], queueStats: [] });
  const [page, setPage] = useState("queue");
  const [person, setPerson] = useState("");
  const [queueName, setQueueName] = useState("");
  const [showQueueForm, setShowQueueForm] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const notify = msg => { setNotice(msg); setTimeout(()=>setNotice(""), 2600); };
  const refreshQueues = async (keep = true) => {
    const data = await api("/queues"); setQueues(data);
    if (data.length && (!keep || !data.some(q=>q.id===selected))) setSelected(data[0].id);
    if (!data.length) { setSelected(null); setTokens([]); }
  };
  const refreshTokens = async () => { if (selected) setTokens(await api(`/queues/${selected}/tokens`)); else setTokens([]); };
  const refreshAnalytics = async () => setAnalytics(await api("/analytics"));
  useEffect(() => {
    api("/me").then(({user})=>setUser(user)).catch(()=>{localStorage.removeItem("qf_token");setUser(null)});
  }, []);
  useEffect(() => { if (user) { refreshQueues(false).catch(e=>notify(e.message)); refreshAnalytics().catch(()=>{}); } }, [user]);
  useEffect(() => { if (selected) refreshTokens().catch(e=>notify(e.message)); }, [selected]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(()=>{refreshQueues().catch(()=>{});refreshTokens().catch(()=>{});refreshAnalytics().catch(()=>{});}, 12000);
    return ()=>clearInterval(timer);
  }, [user, selected]);

  const act = async fn => { setLoading(true); try { await fn(); await Promise.all([refreshQueues(),refreshTokens(),refreshAnalytics()]); } catch(e) { notify(e.message); } finally { setLoading(false); } };
  const createQueue = e => { e.preventDefault(); if (!queueName.trim()) return; act(async()=>{await api("/queues",{method:"POST",body:JSON.stringify({name:queueName})});setQueueName("");setShowQueueForm(false);notify("Queue created successfully.");}); };
  const addPerson = e => { e.preventDefault(); if (!person.trim() || !selected) return; act(async()=>{const t=await api(`/queues/${selected}/tokens`,{method:"POST",body:JSON.stringify({personName:person})});setPerson("");notify(`Token #${t.token_number} created.`);}); };
  const move = (id,direction) => act(()=>api(`/tokens/${id}/move`,{method:"PATCH",body:JSON.stringify({direction})}));
  const cancel = id => act(async()=>{await api(`/tokens/${id}/cancel`,{method:"POST"});notify("Token cancelled.");});
  const serve = () => act(async()=>{const t=await api(`/queues/${selected}/serve-next`,{method:"POST"});notify(`Now serving token #${t.token_number}.`);});
  const complete = id => act(async()=>{await api(`/tokens/${id}/complete`,{method:"POST"});notify("Service completed.");});
  const deleteQueue = () => { if (!selected || !confirm("Delete this queue and all its tokens?")) return; act(async()=>{await api(`/queues/${selected}`,{method:"DELETE"});setSelected(null);notify("Queue deleted.");}); };
  const logout = () => { localStorage.removeItem("qf_token");setUser(null);setQueues([]);setTokens([]); };
  const activeQueue = queues.find(q=>q.id===selected);
  const waiting = tokens.filter(t=>t.status==="waiting");
  const serving = tokens.find(t=>t.status==="serving");
  const filtered = waiting.filter(t=>t.person_name.toLowerCase().includes(search.toLowerCase()) || String(t.token_number).includes(search));
  const avg = analytics.totals?.avgWait || 0;

  if (!user) return <Auth onLogin={setUser}/>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="logo"><span className="logo-icon"><Ticket size={20}/></span><span>queue<span className="logo-light">flow</span></span></div>
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-link ${page==="queue"?"active":""}`} onClick={()=>setPage("queue")}><LayoutDashboard size={18}/> Queue manager</button>
      <button className={`nav-link ${page==="analytics"?"active":""}`} onClick={()=>setPage("analytics")}><BarChart3 size={18}/> Analytics</button>
      <div className="side-divider"/>
      <div className="queue-head"><span className="side-label">YOUR QUEUES</span><button className="icon-btn light" onClick={()=>setShowQueueForm(true)} title="Create queue"><Plus size={17}/></button></div>
      <div className="queue-list">{queues.map(q=><button key={q.id} className={`queue-link ${selected===q.id?"chosen":""}`} onClick={()=>{setSelected(q.id);setPage("queue")}}><span className="queue-dot"/><span className="queue-link-name">{q.name}</span><span className="queue-count">{q.waiting}</span></button>)}
        {!queues.length && <p className="empty-side">No queues yet. Create one to get started.</p>}</div>
      <div className="sidebar-bottom"><div className="user-avatar">{initials(user.name)}</div><div className="user-meta"><b>{user.name}</b><span>Queue manager</span></div><button className="icon-btn light" onClick={logout} title="Sign out"><LogOut size={17}/></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">WORKSPACE / {page==="queue"?"QUEUE MANAGER":"ANALYTICS"}</p><h2>{page==="queue"?"Manage your queues":"Performance overview"}</h2></div><div className="top-right"><span className="live-dot"/> Live updates <span className="top-date">{new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span></div></header>
      {page==="queue" ? <div className="content">
        {!queues.length ? <div className="welcome-panel"><div className="welcome-icon"><Ticket size={27}/></div><h2>Your queue starts here</h2><p>Create your first queue, then add people and manage their tokens from one place.</p><button className="primary" onClick={()=>setShowQueueForm(true)}><Plus size={17}/> Create your first queue</button></div> :
        <>
          <div className="queue-title-row"><div><div className="queue-kicker"><span className="green-pill">ACTIVE QUEUE</span><span className="muted small">Queue ID #{selected}</span></div><h1>{activeQueue?.name}</h1><p className="muted">Manage people, call the next token, and keep the line moving.</p></div><button className="outline danger-outline" onClick={deleteQueue}><Trash2 size={16}/> Delete queue</button></div>
          <div className="stats-grid">
            <Stat icon={<Users/>} label="Waiting" value={waiting.length} tone="blue"/>
            <Stat icon={<Activity/>} label="Now serving" value={serving?`#${serving.token_number}`:"—"} tone="purple"/>
            <Stat icon={<Clock3/>} label="Avg. wait time" value={`${avg} min`} tone="orange"/>
            <Stat icon={<Check/>} label="Completed today" value={analytics.totals?.completed||0} tone="green"/>
          </div>
          <div className="queue-layout">
            <section className="panel queue-panel">
              <div className="panel-heading"><div><h3>Waiting list <span className="count-badge">{waiting.length}</span></h3><p>Move tokens to adjust their order.</p></div><div className="searchbox"><Search size={15}/><input placeholder="Search name or token" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
              {serving && <div className="serving-card"><div className="serving-tag"><span className="pulse"/> NOW SERVING</div><div className="serving-info"><div className="token-number serving-number">#{serving.token_number}</div><div><b>{serving.person_name}</b><span>Called for service</span></div></div><button className="complete-btn" onClick={()=>complete(serving.id)}><Check size={16}/> Complete</button></div>}
              <div className="token-list">
                {filtered.map((t,i)=><div className="token-row" key={t.id}><div className="drag-num">{String(i+1).padStart(2,"0")}</div><div className="token-number">#{t.token_number}</div><div className="person-info"><b>{t.person_name}</b><span>Added {new Date(t.created_at+"Z").toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div><span className="waiting-tag">Waiting</span><div className="row-actions"><button className="icon-btn" disabled={i===0} onClick={()=>move(t.id,"up")} title="Move up"><ArrowUp size={16}/></button><button className="icon-btn" disabled={i===filtered.length-1} onClick={()=>move(t.id,"down")} title="Move down"><ArrowDown size={16}/></button><button className="icon-btn cancel-icon" onClick={()=>cancel(t.id)} title="Cancel token"><X size={16}/></button></div></div>)}
                {!filtered.length && <div className="empty-list"><div className="empty-icon"><Users size={22}/></div><b>{search?"No matching tokens":"No one waiting right now"}</b><span>{search?"Try another name or token number.":"Add a person below to create the first token."}</span></div>}
              </div>
              <div className="panel-footer"><span>Showing {filtered.length} of {waiting.length} waiting</span><span>Updated automatically</span></div>
            </section>
            <section className="right-column">
              <div className="panel add-panel"><div className="panel-heading"><div><h3><CirclePlus size={18}/> Add a person</h3><p>A new token is generated automatically.</p></div></div><form onSubmit={addPerson}><label>Person's name</label><input className="text-input" value={person} onChange={e=>setPerson(e.target.value)} placeholder="Enter full name" required/><button className="primary full" disabled={loading}><Plus size={17}/> Add to queue</button></form></div>
              <div className="call-card"><div className="call-card-top"><div className="call-icon"><Activity size={19}/></div><span>QUICK ACTION</span></div><h3>Ready for the next person?</h3><p>Call the first person in line with one click.</p><button className="call-button" disabled={!waiting.length||!!serving||loading} onClick={serve}>Call next token <ChevronRight size={18}/></button>{serving&&<small>Complete the current service before calling next.</small>}</div>
            </section>
          </div>
        </>}
      </div> : <Analytics data={analytics}/>}
    </main>
    {showQueueForm && <div className="modal-backdrop" onClick={()=>setShowQueueForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowQueueForm(false)}><X size={18}/></button><div className="welcome-icon"><Ticket size={22}/></div><h2>Create a queue</h2><p className="muted">Give your queue a clear name, like Reception or Billing.</p><form onSubmit={createQueue}><label>Queue name</label><input autoFocus className="text-input" value={queueName} onChange={e=>setQueueName(e.target.value)} placeholder="e.g. Customer Support" required/><div className="modal-actions"><button type="button" className="outline" onClick={()=>setShowQueueForm(false)}>Cancel</button><button className="primary"><Plus size={16}/> Create queue</button></div></form></div></div>}
    {notice && <div className="toast"><Check size={17}/>{notice}</div>}
  </div>;
}
function Stat({icon,label,value,tone}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }
function Analytics({data}) {
  const totals=data.totals||{};
  const chartData=useMemo(()=>{
    const map=Object.fromEntries((data.trend||[]).map(x=>[x.day,x.count]));
    return Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;return {day:d.toLocaleDateString("en-US",{weekday:"short"}),tokens:map[key]||0};});
  },[data.trend]);
  return <div className="content analytics-content"><div className="queue-title-row"><div><div className="queue-kicker"><span className="green-pill">LIVE OVERVIEW</span></div><h1>Queue analytics</h1><p className="muted">A quick look at your queue activity and service performance.</p></div></div>
    <div className="stats-grid"><Stat icon={<Users/>} label="People waiting" value={totals.waiting||0} tone="blue"/><Stat icon={<Activity/>} label="Currently serving" value={totals.serving||0} tone="purple"/><Stat icon={<Check/>} label="Completed" value={totals.completed||0} tone="green"/><Stat icon={<Clock3/>} label="Average wait" value={`${totals.avgWait||0} min`} tone="orange"/></div>
    <div className="analytics-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h3>Queue length trend</h3><p>New tokens created over the last 7 days</p></div><span className="chart-legend"><i/> Tokens</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:12,right:8,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f5"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:"#929bad",fontSize:12}}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:"#929bad",fontSize:12}}/><Tooltip cursor={{fill:"#f4f6fb"}}/><Bar dataKey="tokens" fill="#5b6df6" radius={[6,6,0,0]} maxBarSize={42}/></BarChart></ResponsiveContainer></div></section>
    <section className="panel breakdown-panel"><div className="panel-heading"><div><h3>Queue breakdown</h3><p>Current status by queue</p></div></div>{(data.queueStats||[]).map((q,i)=><div className="break-row" key={q.name}><div className="break-name"><span className="queue-dot"/><b>{q.name}</b></div><div className="break-numbers"><span>{q.waiting} waiting</span><span>{q.completed} done</span></div><div className="progress"><i style={{width:`${Math.min(100,(q.waiting/(q.waiting+q.completed+q.serving||1))*100)}%`}}/></div></div>)}{!data.queueStats?.length&&<div className="empty-list"><b>No queue data yet</b><span>Create a queue and add tokens to see analytics.</span></div>}</section></div>
    <p className="analytics-footnote">Average wait is calculated from token creation to the time it is called. Analytics refresh automatically.</p>
  </div>;
}
