import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, CalendarDays, LogOut, Users, UserCog, BarChart3, Plane, Settings } from 'lucide-react';
import { supabase } from './supabase';
import { STATUS, ROLE_LABELS, fullName, roleClass, isBlockedDay, italianHolidayName } from './constants';
import './styles.css';

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('calendar');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session?.user) loadProfile(); else setProfile(null); }, [session?.user?.id]);

  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    setProfile(data || null);
  }

  if (loading) return <div className="center">Caricamento...</div>;
  if (!session) return <Auth />;
  if (!profile) return <div className="center">Profilo non trovato.</div>;
  if (!profile.approved) return <div className="center"><h2>Utenza in attesa di abilitazione</h2><button onClick={() => supabase.auth.signOut()}>Esci</button></div>;

  return <Shell profile={profile} page={page} setPage={setPage}>
    {page === 'calendar' && <CalendarPage profile={profile} />}
    {page === 'profile' && <ProfilePage profile={profile} />}
    {page === 'people' && <PeoplePage profile={profile} />}
    {page === 'reports' && <ReportsPage profile={profile} />}
    {page === 'plan' && <VacationPlanPage profile={profile} />}
    {page === 'admin' && <AdminPage profile={profile} />}
  </Shell>;
}

function Auth() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email:'', password:'', first_name:'', last_name:'', matricola:'', sector_id:'', c01:0, c02:0 });
  const [sectors, setSectors] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { supabase.from('sectors').select('*').order('name').then(({ data }) => setSectors(data || [])); }, []);

  async function login() {
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    if (error) setMsg(error.message);
  }

  async function register() {
    setMsg('');
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (error) return setMsg(error.message);
    const userId = data.user?.id;
    if (!userId) return setMsg('Registrazione inviata. Controlla la mail se richiesta.');
    const { error: pe } = await supabase.from('profiles').insert({
      id: userId, email: form.email, first_name: form.first_name, last_name: form.last_name,
      matricola: form.matricola, sector_id: form.sector_id, role: 'employee',
      c01: Number(form.c01 || 0), c02: Number(form.c02 || 0), approved: false
    });
    if (pe) return setMsg(pe.message);
    await supabase.from('notifications').insert({ recipient_role:'admin', title:'Nuova registrazione', body:`${form.first_name} ${form.last_name} chiede abilitazione` });
    setMsg('Registrazione inviata. Il gestore dovrà abilitarla.');
  }

  async function forgotPassword() {
    if (!form.email) return setMsg('Inserisci email.');
    const { data: prof } = await supabase.from('profiles').select('id,first_name,last_name').eq('email', form.email).maybeSingle();
    if (!prof) return setMsg('Utente non trovato.');
    await supabase.from('password_requests').insert({ user_id: prof.id, status:'pending' });
    await supabase.from('notifications').insert({ recipient_role:'admin', title:'Password dimenticata', body:`${prof.first_name} ${prof.last_name} chiede reset password` });
    setMsg('Richiesta inviata al gestore.');
  }

  return <div className="login"><div className="loginBox">
    <div className="logo">📅</div><h1>UfficioFlex</h1><p className="muted">Gestionale ferie e smart working</p>
    <input placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
    <input placeholder="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
    {mode === 'register' && <>
      <div className="row"><input placeholder="Nome" value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/><input placeholder="Cognome" value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></div>
      <input placeholder="Matricola" value={form.matricola} onChange={e=>setForm({...form,matricola:e.target.value})}/>
      <select value={form.sector_id} onChange={e=>setForm({...form,sector_id:e.target.value})}><option value="">Scegli settore</option>{sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <div className="row"><input placeholder="C02 anno precedente" type="number" value={form.c02} onChange={e=>setForm({...form,c02:e.target.value})}/><input placeholder="C01 anno corrente" type="number" value={form.c01} onChange={e=>setForm({...form,c01:e.target.value})}/></div>
    </>}
    <button onClick={mode === 'login' ? login : register}>{mode === 'login' ? 'Entra' : 'Invia registrazione'}</button>
    <button className="secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Registrati' : 'Torna al login'}</button>
    {mode === 'login' && <button className="link" onClick={forgotPassword}>Password dimenticata?</button>}
    {msg && <p className="message">{msg}</p>}
  </div></div>;
}

function Shell({ profile, page, setPage, children }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    loadCount();
    const ch = supabase.channel('notifications-count').on('postgres_changes', { event:'*', schema:'public', table:'notifications' }, loadCount).subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile.id]);

  async function loadCount() {
    if (profile.role === 'viewer') return setCount(0);
    let q = supabase.from('notifications').select('id', { count:'exact', head:true }).is('read_at', null);
    if (profile.role === 'admin') q = q.eq('recipient_role','admin'); else q = q.eq('sector_id', profile.sector_id);
    const { count } = await q; setCount(count || 0);
  }

  const nav = [['calendar',CalendarDays,'Calendario'],['profile',UserCog,'Dati personali'],['plan',Plane,'Piano ferie'],['reports',BarChart3,'Report']];
  if (profile.role === 'admin') nav.splice(2,0,['people',Users,'Dipendenti'],['admin',Settings,'Admin']);
  if (profile.role === 'sector_manager') nav.splice(2,0,['people',Users,'Dipendenti']);

  return <div className="app"><aside><h2>UfficioFlex</h2><p className="muted">{ROLE_LABELS[profile.role]}</p>
    {nav.map(([id,Icon,label]) => <button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><Icon size={18}/>{label}</button>)}
    <button className="bell" onClick={()=>setPage('reports')}><Bell size={18}/>{count>0 && <span>{count}</span>}</button>
    <button className="logout" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/>Esci</button>
  </aside><main>{children}</main></div>;
}

function useSectors(profile) {
  const [sectors, setSectors] = useState([]);
  const [selectedSector, setSelectedSector] = useState(profile.sector_id);
  useEffect(() => { load(); }, [profile.id]);
  async function load() {
    if (profile.role === 'admin') {
      const { data } = await supabase.from('sectors').select('*').order('name');
      setSectors(data || []); setSelectedSector(data?.[0]?.id || '');
    } else if (profile.role === 'viewer') {
      const { data } = await supabase.from('viewer_sectors').select('sector:sectors(*)').eq('viewer_id', profile.id);
      const s = (data || []).map(x => x.sector);
      setSectors(s); setSelectedSector(s?.[0]?.id || profile.sector_id);
    } else {
      const { data } = await supabase.from('sectors').select('*').eq('id', profile.sector_id).single();
      setSectors(data ? [data] : []); setSelectedSector(profile.sector_id);
    }
  }
  return { sectors, selectedSector, setSelectedSector };
}

function CalendarPage({ profile }) {
  const { sectors, selectedSector, setSelectedSector } = useSectors(profile);
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [selectedDay, setSelectedDay] = useState('');

  useEffect(() => {
    if (!selectedSector) return;
    load();
    const ch = supabase.channel('calendar-live').on('postgres_changes', { event:'*', schema:'public', table:'leave_events' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, [selectedSector, month]);

  async function load() {
    const first = `${month}-01`, last = `${month}-${new Date(Number(month.slice(0,4)), Number(month.slice(5)), 0).getDate()}`;
    const [{ data: ev }, { data: pp }] = await Promise.all([
      supabase.from('leave_events').select('*, profile:profiles(first_name,last_name)').eq('sector_id', selectedSector).gte('day', first).lte('day', last),
      supabase.from('profiles').select('*').eq('sector_id', selectedSector).eq('approved', true).in('role', ['employee','sector_manager'])
    ]);
    setEvents(ev || []); setPeople(pp || []);
  }

  const sectorName = sectors.find(s => s.id === selectedSector)?.name || '';
  async function saveEvent(userId, type) {
    if (!selectedDay || isBlockedDay(selectedDay)) return alert('Giorno non utilizzabile.');
    const user = people.find(p => p.id === userId);
    if (!user) return;
    if (type === 'present') await supabase.from('leave_events').delete().eq('user_id', userId).eq('day', selectedDay);
    else await supabase.from('leave_events').upsert({ user_id:userId, sector_id:user.sector_id, day:selectedDay, type, updated_by:profile.id, created_by:profile.id }, { onConflict:'user_id,day' });
    await supabase.from('notifications').insert({ sector_id:user.sector_id, title:'Modifica calendario', body:`${fullName(profile)} ha modificato ${type} per ${fullName(user)} il ${selectedDay}`, created_by:profile.id });
    load();
  }

  return <><div className="top"><h1>GESTIONALE - {sectorName}</h1>{(profile.role==='admin'||profile.role==='viewer') && <select value={selectedSector} onChange={e=>setSelectedSector(e.target.value)}>{sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}</div>
    <div className="monthbar"><button onClick={()=>setMonth(shiftMonth(month,-1))}>← Mese precedente</button><strong>{month}</strong><button onClick={()=>setMonth(shiftMonth(month,1))}>Mese successivo →</button></div>
    <div className="calendarHead"><div>LUN</div><div>MAR</div><div>MER</div><div>GIO</div><div>VEN</div></div>
    <div className="calendar">{buildWorkdays(month).map((d,i)=>d.blank?<div className="day blank" key={i}>—</div>:<button key={d.date} className={`day ${italianHolidayName(d.date)?'holiday':''}`} onClick={()=>setSelectedDay(d.date)}><b>{Number(d.date.slice(8))}</b>{italianHolidayName(d.date)&&<small>{italianHolidayName(d.date)}</small>}<div className="dots">{events.filter(e=>e.day===d.date).map(e=><span key={e.id} className={e.type}>{STATUS[e.type]?.short}</span>)}</div></button>)}</div>
    {selectedDay && <div className="panel"><h2>Riepilogo {selectedDay}</h2>{isBlockedDay(selectedDay)?<p>Giorno non utilizzabile.</p>:people.map(p=>{const ev=events.find(e=>e.day===selectedDay&&e.user_id===p.id);const canEdit=profile.role==='admin'||profile.role==='sector_manager'||profile.id===p.id;return <div className="person" key={p.id}><b className={roleClass(p.role)}>{fullName(p)}</b><span>{ev?STATUS[ev.type].label:'In servizio'}</span>{canEdit&&<select defaultValue={ev?.type||'present'} onChange={e=>saveEvent(p.id,e.target.value)}><option value="present">In servizio</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>}</div>})}</div>}
  </>;
}

function PeoplePage({ profile }) {
  return <div className="panel"><h1>Dipendenti</h1><p>Gestione completa utenti, settori e ruoli pronta per collegamento Supabase.</p></div>;
}
function ProfilePage({ profile }) {
  return <div className="panel"><h1>Dati personali</h1><p>{fullName(profile)}</p><p>Email e matricola modificabili solo dal gestore.</p></div>;
}
function ReportsPage() {
  return <div className="panel"><h1>Report</h1><p>Report ferie, smart working, malattia e residui.</p></div>;
}
function VacationPlanPage() {
  return <div className="panel"><h1>Piano ferie</h1><p>Periodi gestiti: giugno-settembre, dicembre-gennaio, settimana di Pasqua.</p></div>;
}
function AdminPage() {
  return <div className="panel"><h1>Admin</h1><p>Abilitazioni, password, settori e utenti.</p></div>;
}

function buildWorkdays(month) {
  const y=Number(month.slice(0,4)), m=Number(month.slice(5))-1, total=new Date(y,m+1,0).getDate();
  const firstDow=(new Date(y,m,1).getDay()+6)%7;
  const blanks=Array.from({length:Math.min(firstDow,5)},()=>({blank:true}));
  const days=[];
  for(let d=1;d<=total;d++){const date=`${month}-${String(d).padStart(2,'0')}`;const dow=new Date(date+'T00:00:00').getDay();if(dow!==0&&dow!==6)days.push({date});}
  return [...blanks,...days];
}
function shiftMonth(month, delta) {
  const d=new Date(Number(month.slice(0,4)), Number(month.slice(5))-1+delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

createRoot(document.getElementById('root')).render(<App />);
