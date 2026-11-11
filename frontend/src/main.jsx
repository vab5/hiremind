import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, BarChart3, Check, ChevronDown, Clock3, Code2, Flame, Lightbulb, Mic, MicOff, Play, RotateCcw, Send, Sparkles, Trophy, Volume2, VolumeX, WandSparkles, X } from 'lucide-react';
import './styles.css';
import { HomeV2, InterviewV2 } from './v2';
import { AchievementsView, ProblemSetsView, TipsView } from './libraryViews';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const topics = [
  { name: 'Arrays & Hashing', icon: '▦', color: 'coral', done: 68, meta: '12 sessions' },
  { name: 'Two Pointers', icon: '↔', color: 'blue', done: 42, meta: '8 sessions' },
  { name: 'Graphs', icon: '⌘', color: 'purple', done: 25, meta: '5 sessions' },
  { name: 'Dynamic Programming', icon: '∿', color: 'amber', done: 16, meta: '3 sessions' },
];

const starterCode = `function firstDuplicate(nums) {
  // talk through your approach, then implement it here
  
}`;

function App() {
  const [screen, setScreen] = useState('home');
  const [topic, setTopic] = useState('Arrays & Hashing');
  const [difficulty, setDifficulty] = useState('Medium');
  const [mode, setMode] = useState('guided');
  const [progress, setProgress] = useState({ total: 0, average: 0, topicScores: [] });
  const [problem, setProblem] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [code, setCode] = useState(starterCode);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [hints, setHints] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const recognition = useRef(null);
  useEffect(() => { fetch(`${API}/progress`).then(r => r.json()).then(setProgress).catch(() => {}); }, []);

  const speak = (text) => {
    if (!speaking || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const startInterview = async () => {
    setLoading(true); setEvaluation(null); setCode(starterCode);
    try {
      const res = await fetch(`${API}/start`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ topic, difficulty, mode }) });
      const data = await res.json();
      if (!res.ok || !data?.problem || typeof data.problem !== 'object') throw new Error(data?.detail || 'Invalid interview response');
      const textValue = (value, fallback='') => typeof value === 'string' ? value : value == null ? fallback : JSON.stringify(value);
      const safeData = { ...data, problem: { title: textValue(data.problem.title, `${topic} interview problem`), statement: textValue(data.problem.statement, 'Talk through a solution to the problem presented by the interviewer.'), examples: Array.isArray(data.problem.examples) ? data.problem.examples.map(item=>textValue(item)) : [], constraints: Array.isArray(data.problem.constraints) ? data.problem.constraints.map(item=>textValue(item)) : [] }, question: textValue(data.question, 'Take a moment to restate the problem, then talk me through your first approach.') };
      setProblem(safeData); setMessages([{ role:'assistant', content:safeData.question }]); setScreen('interview'); speak(safeData.question);
    } catch { setProblem({ problem: { title:'First Duplicate', statement:'Given an array of integers, return the first value that appears twice. If no value repeats, return -1.', examples:['[2, 1, 3, 5, 3] → 3','[1, 2, 3] → -1'], constraints:['1 ≤ nums.length ≤ 100,000','Values fit in a 32-bit signed integer'] }, question:'Welcome in. Take a minute to restate the problem, then talk me through the approach you’d try first.', estimatedMinutes:25 }); setMessages([{role:'assistant',content:'Welcome in. Take a minute to restate the problem, then talk me through the approach you’d try first.'}]); setScreen('interview'); }
    setLoading(false);
  };

  const sendMessage = async (value = draft) => {
    if (!value.trim() || loading) return;
    const next = [...messages, { role:'user', content:value.trim() }]; setMessages(next); setDraft(''); setLoading(true);
    try { const res = await fetch(`${API}/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topic,difficulty,mode,messages, user_message:value.trim()}) }); const data = await res.json(); setMessages([...next, {role:'assistant',content:data.reply}]); speak(data.reply); } catch { const reply=mode==='behavioral'?'You mentioned an important challenge. What was your specific contribution, and what changed as a result?':'You mentioned a useful direction. What edge case or tradeoff would you validate next?'; setMessages([...next,{role:'assistant',content:reply}]); speak(reply); }
    setLoading(false);
  };

  const toggleListening = () => {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setDraft('Voice input is not supported in this browser. I’ll use the text box instead.'); return; }
    const existingDraft = draft.trim();
    const rec = new SpeechRecognition(); recognition.current = rec; rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
    rec.onstart = () => setListening(true); rec.onend = () => setListening(false); rec.onerror = () => setListening(false); rec.onresult = (e) => {
      const spoken = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      setDraft([existingDraft, spoken].filter(Boolean).join(' '));
    };
    rec.start();
  };

  const finish = async () => {
    setLoading(true);
    try { const res = await fetch(`${API}/evaluate`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topic,difficulty,mode,transcript:messages,code,hints})}); const result = await res.json(); setEvaluation(result); fetch(`${API}/sessions`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({topic,difficulty,mode,transcript:messages,code,hints,feedback:result})}).then(()=>fetch(`${API}/progress`).then(r=>r.json()).then(setProgress)); } catch { setEvaluation({score:74,verdict:'Promising signal',summary:'You communicated a workable direction and showed good instinct for choosing a linear-time approach.',strengths:['Explained the main tradeoff clearly','Stayed engaged with the follow-up'],improvements:['State the invariant before writing code','Walk through one edge case'],rubric:[{name:'Problem solving',score:82,note:'A solid approach.'},{name:'Communication',score:78,note:'Easy to follow.'},{name:'Correctness',score:68,note:'Validate edge cases.'},{name:'Complexity',score:72,note:'Name costs precisely.'}],nextStep:'Try one more Arrays & Hashing problem.'}); }
    setScreen('debrief'); setLoading(false);
  };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><span>hiremind</span></div><div className="profile"><div className="avatar">VB</div><div><strong>Varun Bussa</strong><span>Interview prep</span></div><ChevronDown size={15}/></div><nav><p className="nav-label">WORKSPACE</p><button className={screen==='home'?'active':''} onClick={()=>setScreen('home')}><BarChart3 size={17}/>Overview</button><button className={screen==='interview'||screen==='debrief'?'active':''} onClick={()=>setScreen(problem?'interview':'home')}><Mic size={17}/>Practice room<span className="nav-dot"/></button><button className={screen==='achievements'?'active':''} onClick={()=>setScreen('achievements')}><Trophy size={17}/>Achievements</button><p className="nav-label spaced">LIBRARY</p><button className={screen==='problemsets'?'active':''} onClick={()=>setScreen('problemsets')}><Code2 size={17}/>Problem sets</button><button className={screen==='tips'?'active':''} onClick={()=>setScreen('tips')}><Lightbulb size={17}/>Interview tips</button></nav><div className="sidebar-bottom"><div className="streak"><Flame size={17}/><div><b>4 day streak</b><span>Keep it going</span></div><ArrowRight size={15}/></div><div className="upgrade"><span>PROGRESS THIS WEEK</span><b>3 <small>/ 5 sessions</small></b><div className="mini-progress"><i/></div></div></div></aside>
    <main className="main-content">{screen==='home' && <HomeV2 topic={topic} setTopic={setTopic} difficulty={difficulty} setDifficulty={setDifficulty} mode={mode} setMode={setMode} progress={progress} start={startInterview} loading={loading}/>} {screen==='interview' && problem && <InterviewV2 problem={problem} messages={messages} draft={draft} setDraft={setDraft} send={sendMessage} code={code} setCode={setCode} listening={listening} toggleListening={toggleListening} speaking={speaking} setSpeaking={setSpeaking} finish={finish} loading={loading} mode={mode} hints={hints} setHints={setHints} runResult={runResult} setRunResult={setRunResult}/>} {screen==='debrief' && <Debrief evaluation={evaluation} topic={topic} restart={()=>{setScreen('home');setProblem(null)}}/>} {screen==='achievements' && <AchievementsView progress={progress}/>} {screen==='problemsets' && <ProblemSetsView topic={topic} setTopic={setTopic} setDifficulty={setDifficulty} setMode={setMode} start={startInterview} loading={loading}/>} {screen==='tips' && <TipsView/>}</main>
  </div>;
}

function Home({topic,setTopic,difficulty,setDifficulty,start,loading}) { return <div className="page home-page"><header className="topbar"><div><span className="eyebrow">MONDAY, OCTOBER 11, 2026</span><h1>Ready when you are, Varun.</h1><p>Build the skill that makes every technical interview feel more like a conversation.</p></div><div className="header-actions"><button className="icon-btn"><span className="notification"/>◌</button><div className="tiny-avatar">VB</div></div></header><section className="hero-card"><div className="hero-copy"><div className="pill"><span/>VOICE-FIRST PRACTICE</div><h2>Think out loud.<br/><em>Get interview-ready.</em></h2><p>Practice the part most platforms miss: explaining your thinking clearly while solving real problems.</p><button className="primary large" onClick={start} disabled={loading}>{loading?'Building your session…':'Start a practice session'} <ArrowRight size={17}/></button><div className="hero-meta"><span><Clock3 size={14}/> 20–30 min</span><span><Mic size={14}/> Voice enabled</span><span><Check size={14}/> Guided feedback</span></div></div><div className="hero-art"><div className="orb orb-a"/><div className="orb orb-b"/><div className="wave"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="art-card"><div className="art-icon"><Mic size={17}/></div><div><b>Live interviewer</b><span>Listening carefully…</span></div><div className="live-dot"/></div></div></section><section className="section-heading"><div><span className="eyebrow">YOUR PRACTICE PLAN</span><h2>Choose your next rep</h2></div><button className="text-btn">View all topics <ArrowRight size={15}/></button></section><div className="topic-grid">{topics.map(t=><button className={`topic-card ${topic===t.name?'selected':''}`} key={t.name} onClick={()=>setTopic(t.name)}><div className={`topic-icon ${t.color}`}>{t.icon}</div><div className="topic-info"><b>{t.name}</b><span>{t.meta}</span><div className="topic-progress"><i style={{width:`${t.done}%`}}/></div></div><strong>{t.done}%</strong></button>)}</div><section className="bottom-grid"><div className="insight-card"><div className="card-head"><div><span className="eyebrow">WEEKLY INSIGHT</span><h3>Your consistency is compounding</h3></div><div className="sparkline"><i/><i/><i/><i/><i/><i/><i/><i/></div></div><p>You’re most confident in arrays. A few more graph reps could lift your overall readiness fastest.</p><div className="insight-foot"><span><span className="green-dot"/> Trending up</span><b>+12% this week</b></div></div><div className="setup-card"><div className="eyebrow">QUICK SETUP</div><h3>Make it your interview.</h3><label>TOPIC <select value={topic} onChange={e=>setTopic(e.target.value)}>{topics.map(t=><option key={t.name}>{t.name}</option>)}</select></label><label>DIFFICULTY <div className="segmented">{['Easy','Medium','Hard'].map(d=><button className={difficulty===d?'on':''} onClick={()=>setDifficulty(d)} key={d}>{d}</button>)}</div></label></div></section></div> }

function Interview({problem,messages,draft,setDraft,send,code,setCode,listening,toggleListening,speaking,setSpeaking,finish,loading}) { return <div className="page interview-page"><header className="interview-top"><button className="back-btn" onClick={()=>location.reload()}>← <span>Exit session</span></button><div className="session-title"><span className="live-pill"><i/> LIVE SESSION</span><b>{problem.problem.title}</b><span>· Medium · Arrays & Hashing</span></div><div className="interview-tools"><span><Clock3 size={15}/> 18:42</span><button className="sound-btn" onClick={()=>setSpeaking(!speaking)}>{speaking?<Volume2 size={17}/>:<VolumeX size={17}/>}</button></div></header><div className="interview-body"><section className="problem-pane"><div className="pane-label"><span>THE PROBLEM</span><button className="hint-btn"><Lightbulb size={14}/> Ask for a hint</button></div><h1>{problem.problem.title}</h1><p className="problem-statement">{problem.problem.statement}</p><div className="example-block"><span>EXAMPLES</span>{problem.problem.examples?.map((e,i)=><div className="example" key={i}><b>{i+1}</b><code>{e}</code></div>)}</div><div className="constraints"><span>CONSTRAINTS</span><ul>{problem.problem.constraints?.map(c=><li key={c}>{c}</li>)}</ul></div><div className="approach-note"><WandSparkles size={17}/><div><b>Interview mindset</b><span>There’s no rush. Narrate your assumptions before you reach for the keyboard.</span></div></div></section><section className="conversation-pane"><div className="pane-label"><span>CONVERSATION</span><span className="listening-label"><i/> {listening?'Listening…':'Interviewer is listening'}</span></div><div className="messages">{messages.map((m,i)=><div className={`message-row ${m.role}`} key={i}>{m.role==='assistant'&&<div className="bot-avatar"><Sparkles size={14}/></div>}<div className="message"><span className="message-name">{m.role==='assistant'?'Maya · Interviewer':'You'}</span><p>{m.content}</p>{m.role==='assistant'&&i===0&&<button className="replay" onClick={()=>speechSynthesis?.speak(new SpeechSynthesisUtterance(m.content))}><Volume2 size={13}/> Replay</button>}</div></div>)}{loading&&<div className="typing"><i/><i/><i/></div>}</div><div className="composer"><div className="composer-top"><span className="voice-status"><span className={listening?'pulse':''}><Mic size={18}/></span>{listening?'Listening — speak naturally':'Talk through your approach'}</span><button className={`mic-button ${listening?'recording':''}`} onClick={toggleListening}>{listening?<MicOff size={18}/>:<Mic size={18}/>}</button></div><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Or type what you would say in the room…"/><div className="composer-foot"><span>Press Enter to send · Shift + Enter for a new line</span><button className="send-btn" onClick={()=>send()} disabled={!draft.trim()}><Send size={15}/></button></div></div></section></div><div className="editor-dock"><div className="editor-head"><div><Code2 size={16}/><b>Solution workspace</b><span>JavaScript</span></div><div><button className="run-btn"><Play size={13}/> Run tests</button><button className="finish-btn" onClick={finish}>Finish & get feedback <ArrowRight size={14}/></button></div></div><textarea className="code-editor" spellCheck="false" value={code} onChange={e=>setCode(e.target.value)}/></div></div> }

function Debrief({evaluation,topic,restart}) { return <div className="page debrief-page"><header className="topbar"><div><span className="eyebrow">SESSION DEBRIEF · JUST NOW</span><h1>Nice work staying in the room.</h1><p>Here’s the signal from your {topic} practice.</p></div><button className="secondary" onClick={restart}><RotateCcw size={15}/> New session</button></header>{evaluation&&<><section className="score-hero"><div className="score-ring"><strong>{evaluation.score}</strong><span>/ 100</span></div><div><span className="pill soft">{evaluation.verdict}</span><h2>{evaluation.summary}</h2><div className="score-meta"><span><Check size={14}/> Completed</span><span><Clock3 size={14}/> 24 min</span><span><Mic size={14}/> Voice transcript</span></div></div></section><div className="debrief-grid"><section className="rubric-card"><div className="card-head"><div><span className="eyebrow">SIGNAL BREAKDOWN</span><h3>How you showed up</h3></div><BarChart3 size={19}/></div>{evaluation.rubric?.map(r=><div className="rubric" key={r.name}><div className="rubric-title"><b>{r.name}</b><strong>{r.score}</strong></div><div className="rubric-bar"><i style={{width:`${r.score}%`}}/></div><span>{r.note}</span></div>)}</section><section className="feedback-column"><div className="feedback-card green"><span className="feedback-icon"><Check size={17}/></span><div><span className="eyebrow">WHAT WORKED</span><h3>Your strengths</h3>{evaluation.strengths?.map(s=><p key={s}>↗ {s}</p>)}</div></div><div className="feedback-card coral"><span className="feedback-icon"><Lightbulb size={17}/></span><div><span className="eyebrow">ONE THING TO TUNE</span><h3>Make your reasoning sharper</h3>{evaluation.improvements?.map(s=><p key={s}>→ {s}</p>)}</div></div><div className="next-card"><div className="next-icon"><ArrowRight size={16}/></div><div><span className="eyebrow">YOUR NEXT REP</span><h3>{evaluation.nextStep}</h3></div></div></section></div></>}</div> }

createRoot(document.getElementById('root')).render(<App/>);

