const RU=['Главная информация текста','Средства связи предложений','Стилистический анализ','Орфоэпия — ударение','Лексические нормы — паронимы','Лексические нормы','Морфологические нормы','Синтаксические нормы','Правописание корней','Правописание приставок','Суффиксы существительных и прилагательных','Личные окончания и суффиксы глаголов','НЕ с разными частями речи','Слитно, раздельно, через дефис','Н и НН','Пунктуация в ССП','Знаки при обособленных членах','Знаки при вводных и обращении','Пунктуация в СПП','Сложные предложения с разными связями','Пунктуационный анализ','Текст — соответствия утверждениям','Типы речи','Лексический анализ','Средства связи в тексте','Средства выразительности','Сочинение'];
const MA=['Планиметрия — простая','Векторы','Стереометрия — простая','Теория вероятностей','Теория вероятностей — сложная','Уравнение','Преобразования выражений','Производная — анализ графика','Прикладная задача','Текстовая задача','Функции и графики','Уравнение — повышенной сложности','Стереометрия с доказательством','Неравенство','Финансовая математика','Планиметрия с доказательством','Параметр','Числа и их свойства','Олимпиадная задача'];
const IN=['Анализ графа','Таблицы истинности','Базы данных','Кодирование, префиксы','Алгоритм исполнителя','Чертёжник, Робот','Кодирование звука и изображения','Комбинаторика на словах','Электронные таблицы — Excel','Поиск в Word','Объём информации','Исполнитель Редактор','Сети — маски IP','Системы счисления','Логика и множества','Рекурсивные алгоритмы','Обработка данных из файла','Динамическое программирование','Теория игр — выигрышная позиция','Теория игр — два хода','Теория игр — стратегия','Параллельные процессы','Поиск путей в графе','Обработка строк','Делители и простые числа','Алгоритмы с массивами','Сложная задача обработки данных'];
const SUBJ={russian:{name:'Русский язык',short:'Рус',count:27,titles:RU,color:'russian',max:56},math:{name:'Математика',short:'Мат',count:19,titles:MA,color:'math',max:32},informatics:{name:'Информатика',short:'Инф',count:27,titles:IN,color:'informatics',max:30}};
const SEED={informatics:{1:['только код'],15:['кодом','руками'],24:['регулярки','двойной цикл','указатели']}};
const MS=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MG=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WD=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const WDF=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function pYmd(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function today(){return ymd(new Date())}
function addD(s,n){const d=pYmd(s);d.setDate(d.getDate()+n);return ymd(d)}
function dBetween(a,b){return Math.round((pYmd(b).setHours(0,0,0,0)-pYmd(a).setHours(0,0,0,0))/86400000)}
function plural(n,f){n=Math.abs(n)%100;const n1=n%10;if(n>10&&n<20)return f[2];if(n1>1&&n1<5)return f[1];if(n1==1)return f[0];return f[2]}
function fmtL(s){const d=pYmd(s);return d.getDate()+' '+MG[d.getMonth()]+' '+d.getFullYear()}
function fmtW(s){return WDF[pYmd(s).getDay()]}
function fmtDur(min){if(!min||min<1)return'';const h=Math.floor(min/60),m=min%60;if(h&&m)return h+' ч '+m+' м';if(h)return h+' ч';return m+' м'}

async function api(method,path,body){
  const o={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
  if(body!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body)}
  const r=await fetch(path,o);let d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){const e=new Error(d&&d.error||'HTTP '+r.status);e.status=r.status;throw e}
  return d;
}

let me=null,state=null,mocks=[],view='today',subj='russian',calRef=new Date(),calSel=null,saveT=null;

function toast(m,t){const e=document.createElement('div');e.className='toast'+(t==='error'?' error':'');e.textContent=m;document.body.appendChild(e);setTimeout(()=>e.remove(),2200)}

function defaultState(){
  const tasks={};
  for(const s of Object.keys(SUBJ)){
    tasks[s]={};
    for(let i=1;i<=SUBJ[s].count;i++){
      const seed=SEED[s]&&SEED[s][i]?SEED[s][i]:[];
      tasks[s][i]={title:SUBJ[s].titles[i-1]||('Задание '+i),status:'todo',methods:seed.map(t=>({id:uid(),text:t,mastered:false})),notes:'',timeMin:0};
    }
  }
  return{version:2,meta:{startDate:today(),examDates:{russian:'2026-06-04',math:'2026-06-08',informatics:'2026-06-18'}},events:[],tasks,todos:[],problems:{russian:[],math:[],informatics:[]},goals:[]};
}

function normalize(d){
  const def=defaultState();
  if(!d||typeof d!=='object')return def;
  if(!d.meta)d.meta=def.meta;
  if(!d.meta.examDates)d.meta.examDates=def.meta.examDates;
  if(d.meta.examDates.russian===d.meta.examDates.math&&d.meta.examDates.math===d.meta.examDates.informatics)d.meta.examDates=def.meta.examDates;
  if(!d.meta.startDate)d.meta.startDate=def.meta.startDate;
  if(!d.tasks||!Object.keys(d.tasks).length)d.tasks=def.tasks;
  for(const s of Object.keys(SUBJ)){
    if(!d.tasks[s])d.tasks[s]=def.tasks[s];
    for(let i=1;i<=SUBJ[s].count;i++){
      if(!d.tasks[s][i])d.tasks[s][i]=def.tasks[s][i];
      const t=d.tasks[s][i];
      if(!t.methods)t.methods=[];
      if(t.timeMin==null)t.timeMin=t.timeMinutes||0;
      if(!t.notes)t.notes='';
      if(!t.status)t.status='todo';
    }
  }
  if(!d.events)d.events=[];
  if(!d.todos)d.todos=[];
  if(!d.problems)d.problems={russian:[],math:[],informatics:[]};
  for(const s of Object.keys(SUBJ))if(!d.problems[s])d.problems[s]=[];
  if(!d.goals)d.goals=[];
  return d;
}

function scheduleSave(){if(saveT)clearTimeout(saveT);saveT=setTimeout(saveState,600)}
async function saveState(){try{await api('PUT','/api/state',{data:state})}catch(e){toast('Не сохранилось: '+e.message,'error')}}

function applyTheme(){document.documentElement.classList.toggle('light',localStorage.getItem('marathon-theme')==='light')}
function toggleTheme(){const l=document.documentElement.classList.toggle('light');localStorage.setItem('marathon-theme',l?'light':'dark')}

function showAuth(){const a=document.getElementById('auth-screen'),b=document.getElementById('app');a.hidden=false;a.style.display='flex';b.hidden=true;b.style.display='none'}
function showApp(){const a=document.getElementById('auth-screen'),b=document.getElementById('app');a.hidden=true;a.style.display='none';b.hidden=false;b.style.display='grid'}

let authMode='login';
function setAuthMode(m){
  authMode=m;
  document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  document.getElementById('f-display').style.display=m==='register'?'flex':'none';
  document.getElementById('auth-submit').textContent=m==='register'?'Создать аккаунт':'Войти';
  document.getElementById('auth-err').hidden=true;
}

async function handleAuth(e){
  e.preventDefault();
  const btn=document.getElementById('auth-submit'),err=document.getElementById('auth-err');
  err.hidden=true;btn.disabled=true;btn.textContent='…';
  try{
    const username=document.getElementById('i-username').value.trim();
    const password=document.getElementById('i-password').value;
    if(authMode==='register'){
      const displayName=document.getElementById('i-display').value.trim()||username;
      const r=await api('POST','/api/register',{username,password,displayName});
      me=r.user;
    }else{
      const r=await api('POST','/api/login',{username,password});
      me=r.user;
    }
    await loadAndShow();
  }catch(ex){err.textContent=ex.message||'Ошибка';err.hidden=false}
  finally{btn.disabled=false;btn.textContent=authMode==='register'?'Создать аккаунт':'Войти'}
}

async function loadAndShow(){
  const r=await api('GET','/api/me');
  me=r.user;state=normalize(r.state);mocks=r.mocks||[];
  document.getElementById('un').textContent=me.displayName;
  document.getElementById('uh').textContent='@'+me.username;
  document.getElementById('ua').textContent=(me.displayName||me.username).charAt(0).toUpperCase();
  showApp();renderAll();
}

async function doLogout(){try{await api('POST','/api/logout')}catch(e){}me=null;state=null;mocks=[];showAuth();setAuthMode('login');document.getElementById('auth-form').reset()}

function setView(n){
  view=n;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  (document.getElementById('view-'+n)||document.getElementById('view-today')).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===n));
  const m={today:['Обзор','Сегодня'],calendar:['Обзор','Календарь'],tasks:['Обзор','Задачи'],russian:['Предмет','Русский язык'],math:['Предмет','Математика'],informatics:['Предмет','Информатика'],mocks:['Подготовка','Пробники'],problems:['Подготовка','Проблемы'],goals:['Подготовка','Цели'],community:['Сообщество','Топ-лист'],profile:['Аккаунт','Профиль'],admin:['Аккаунт','Настройки'],user:['Сообщество','Профиль пользователя']};
  const[c,t]=m[n]||['',''];
  document.getElementById('crumb').textContent=c;
  document.getElementById('ttitle').textContent=t;
  if(n==='russian'||n==='math'||n==='informatics'){subj=n;renderSubject()}else renderView(n);
  window.scrollTo({top:0});
}

function nearestExam(){
  const t=today();let near=null;
  for(const s of Object.keys(SUBJ)){const d=state.meta.examDates[s];if(d>=t&&(!near||d<near.date))near={subject:s,date:d}}
  if(!near){let last=null;for(const s of Object.keys(SUBJ)){const d=state.meta.examDates[s];if(!last||d>last.date)last={subject:s,date:d}}return{subject:last.subject,date:last.date,past:true}}
  return near;
}

function renderHeader(){
  const t=new Date();
  document.getElementById('date-pill').textContent=WDF[t.getDay()]+', '+t.getDate()+' '+MG[t.getMonth()];
  const n=nearestExam();const num=document.getElementById('cd-num'),unit=document.getElementById('cd-unit'),lab=document.getElementById('cd-label');
  if(n.past){num.textContent='—';unit.textContent='экзамены прошли';lab.textContent='—'}
  else{const d=dBetween(today(),n.date);
    if(d===0){num.textContent='0';unit.textContent=SUBJ[n.subject].name.toLowerCase()+' — сегодня';lab.textContent='Экзамен'}
    else{num.textContent=d;unit.textContent=SUBJ[n.subject].name.toLowerCase()+' · '+plural(d,['день','дня','дней']);lab.textContent='До ближайшего экзамена'}
  }
}

function progressFor(s){const t=state.tasks[s];const tot=Object.keys(t).length;const done=Object.values(t).filter(x=>x.status==='done').length;const wip=Object.values(t).filter(x=>x.status==='wip').length;return{done,wip,total:tot,pct:tot?Math.round(done*100/tot):0}}
function remainingMin(s){return Object.values(state.tasks[s]).filter(x=>x.status!=='done').reduce((a,x)=>a+(x.timeMin||0),0)}
function eventsOn(d){return state.events.filter(e=>e.date===d).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''))}
function todosOn(d){return state.todos.filter(t=>t.date===d).sort((a,b)=>(a.done?1:0)-(b.done?1:0))}
function findMock(id){return mocks.find(m=>m.id===id)}
function findProblem(id){for(const s of Object.keys(SUBJ)){const p=state.problems[s].find(x=>x.id===id);if(p)return{...p,subject:s}}return null}

function renderView(n){if(n==='today')renderToday();else if(n==='calendar')renderCalendar();else if(n==='tasks')renderTasksView();else if(n==='mocks')renderMocks();else if(n==='problems')renderProblems();else if(n==='goals')renderGoals();else if(n==='community')renderCommunity();else if(n==='profile')renderProfile();else if(n==='admin')renderAdmin()}
function renderAll(){renderHeader();renderToday();if(view!=='today')renderView(view)}

function todoAddRow(date){
  const opts='<option value="">без предмета</option>'+Object.keys(SUBJ).map(k=>'<option value="'+k+'">'+SUBJ[k].name+'</option>').join('');
  return '<div class="todo-add-row"><input type="text" id="ti-'+date+'" placeholder="+ что нужно сделать..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();addTodoQ(\''+date+'\')}"><select id="ts-'+date+'">'+opts+'</select><button class="btn btn-primary btn-sm" onclick="addTodoQ(\''+date+'\')"><i class="ti ti-plus"></i> Добавить</button></div>';
}
function todoItem(t){
  const sT=t.subject?'<span class="event-tag '+t.subject+'">'+SUBJ[t.subject].short+'</span>':'';
  const lm=t.mockId?findMock(t.mockId):null;
  const ml=lm?'<span class="chip">пробник '+lm.score+'/'+lm.maxScore+'</span>':'';
  return '<div class="todo-item"><span class="checkbox'+(t.done?' on':'')+'" onclick="toggleTodo(\''+t.id+'\')"></span><span class="todo-text'+(t.done?' done':'')+'">'+esc(t.text)+'</span><span style="display:flex;gap:6px;align-items:center">'+sT+ml+'</span><button class="todo-rm" onclick="deleteTodo(\''+t.id+'\')"><i class="ti ti-x"></i></button></div>';
}
function addTodoQ(date){const i=document.getElementById('ti-'+date),s=document.getElementById('ts-'+date);const txt=i.value.trim();if(!txt)return;state.todos.push({id:uid(),date,text:txt,subject:s.value||null,done:false});i.value='';scheduleSave();renderView(view)}
function toggleTodo(id){const t=state.todos.find(x=>x.id===id);if(t){t.done=!t.done;scheduleSave();renderView(view)}}
function deleteTodo(id){state.todos=state.todos.filter(x=>x.id!==id);scheduleSave();renderView(view)}

function eventCard(e){
  const st={planned:'запланировано',confirmed:'подтверждено',done:'выполнено',missed:'пропущено'}[e.status||'planned'];
  const sn=e.subject?SUBJ[e.subject].name:'';
  const tasks=(e.taskNumbers||[]).map(n=>parseInt(n,10)).filter(n=>n>0);
  const probs=(e.problemIds||[]).map(findProblem).filter(Boolean);
  const lm=(e.mockIds||[]).map(findMock).filter(Boolean);
  let body='';
  if(e.subject&&tasks.length){
    body+='<div><div class="event-block-label">Задания ('+tasks.length+')</div><div class="event-task-list">';
    tasks.forEach(n=>{const t=state.tasks[e.subject]&&state.tasks[e.subject][n];if(!t)return;
      const mt=(t.methods||[]).map(m=>m.text).join(' · ');
      body+='<div class="event-task-item"><span class="event-task-num">№ '+n+'</span><div><div class="event-task-name">'+esc(t.title)+'</div>'+(mt?'<div class="event-task-methods">'+esc(mt)+'</div>':'')+'</div></div>';
    });body+='</div></div>';
  }
  if(probs.length){body+='<div><div class="event-block-label">Проблемы ('+probs.length+')</div><div class="event-problem-list">';probs.forEach(p=>{body+='<div class="event-problem-item'+(p.status==='solved'?' solved':'')+'">'+esc(p.text)+(p.area?' <span style="color:var(--text-dim);font-size:12px">— '+esc(p.area)+'</span>':'')+'</div>'});body+='</div></div>'}
  if(lm.length){body+='<div><div class="event-block-label">Пробники ('+lm.length+')</div><div class="event-mock-list">';lm.forEach(m=>{const p=Math.round(m.score/m.maxScore*100);body+='<div class="event-mock-item"><span>'+esc(m.title||SUBJ[m.subject].name)+' · '+esc(fmtL(m.date))+'</span><span class="event-mock-score">'+m.score+'/'+m.maxScore+' · '+p+'%</span></div>'});body+='</div></div>'}
  if(e.notes)body+='<div><div class="event-block-label">Заметка</div><div class="event-note">'+esc(e.notes)+'</div></div>';
  return '<div class="event-card '+(e.subject||'')+'"><div class="event-top" onclick="openEventModal(\''+e.id+'\')"><div class="event-time"><div class="event-time-main">'+(e.startTime||'весь день')+'</div>'+(e.endTime?'<div>до '+esc(e.endTime)+'</div>':'')+'</div><div class="event-info"><div class="event-tags">'+(e.subject?'<span class="event-tag '+e.subject+'">'+sn+'</span>':'')+'<span class="event-status '+(e.status||'planned')+'">'+st+'</span></div><div class="event-title-big">'+esc(e.title||'Без названия')+'</div></div><button class="event-edit" onclick="event.stopPropagation();openEventModal(\''+e.id+'\')"><i class="ti ti-edit"></i></button></div>'+(body?'<div class="event-body">'+body+'</div>':'')+'</div>';
}

function renderToday(){
  const t=today(),tom=addD(t,1);
  const ev=eventsOn(t),td=todosOn(t),tTd=todosOn(tom),tEv=eventsOn(tom);
  const dM=Math.max(1,dBetween(state.meta.startDate,t)+1);
  let totDone=0,totAll=0;for(const s of Object.keys(SUBJ)){const p=progressFor(s);totDone+=p.done;totAll+=p.total}
  const pct=totAll?Math.round(totDone*100/totAll):0;const dn=td.filter(x=>x.done).length;
  let h='<div class="view-head"><div><h1><i class="ti ti-sun" style="color:var(--accent)"></i> Сегодня</h1><div class="subtitle">'+esc(fmtW(t))+', '+esc(fmtL(t))+' · день '+dM+' марафона</div></div><div class="view-actions"><button class="btn btn-primary" onclick="openEventModal(null,\''+t+'\')"><i class="ti ti-plus"></i> Событие</button></div></div>';
  h+='<div class="stats"><div class="stat-card"><div class="stat-label">Общий прогресс</div><div class="stat-value">'+pct+'%</div><div class="stat-foot">'+totDone+' из '+totAll+' заданий</div><div class="stat-bar"><div class="stat-bar-fill" style="width:'+pct+'%;background:var(--accent)"></div></div></div>';
  h+='<div class="stat-card"><div class="stat-label">Событий сегодня</div><div class="stat-value">'+ev.length+'</div><div class="stat-foot">'+ev.filter(e=>e.status==='done').length+' выполнено</div></div>';
  h+='<div class="stat-card"><div class="stat-label">Задачи дня</div><div class="stat-value">'+dn+' / '+td.length+'</div><div class="stat-foot">'+(td.length?Math.round(dn*100/td.length)+'% готово':'пока пусто')+'</div></div>';
  h+='<div class="stat-card"><div class="stat-label">Пробников всего</div><div class="stat-value">'+mocks.length+'</div><div class="stat-foot">'+(mocks[0]?'последний '+fmtL(mocks[0].date):'ещё не сдавал')+'</div></div></div>';
  h+='<div class="todo-section"><div class="card-head" style="margin-bottom:14px"><div class="card-title"><i class="ti ti-checklist"></i> Задачи на сегодня</div><div class="card-meta">'+dn+' из '+td.length+' выполнено</div></div>'+todoAddRow(t)+'<div class="todo-list">';
  if(!td.length)h+='<div class="empty-state"><i class="ti ti-list"></i>Запиши, что хочешь успеть сегодня</div>';else td.forEach(x=>{h+=todoItem(x)});
  h+='</div></div>';
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-clock"></i> Расписание на сегодня</div><div class="card-meta">'+ev.length+' событий</div></div>';
  if(!ev.length)h+='<div class="empty-state"><i class="ti ti-calendar-plus"></i>На сегодня ничего не запланировано<div style="margin-top:10px"><button class="btn btn-sm" onclick="openEventModal(null,\''+t+'\')">Запланировать</button></div></div>';else ev.forEach(x=>{h+=eventCard(x)});
  h+='</div>';
  if(tTd.length||tEv.length){
    h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-arrow-right"></i> Завтра — '+esc(fmtL(tom))+'</div></div>';
    if(tTd.length){h+='<div class="event-block-label">Задачи ('+tTd.length+')</div><div class="todo-list" style="margin-bottom:14px">';tTd.forEach(x=>{h+=todoItem(x)});h+='</div>'}
    if(tEv.length){h+='<div class="event-block-label">События ('+tEv.length+')</div>';tEv.forEach(x=>{h+=eventCard(x)})}
    h+='</div>';
  }
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-chart-bar"></i> Прогресс по предметам</div></div>';
  for(const s of ['russian','math','informatics']){const p=progressFor(s),d=dBetween(t,state.meta.examDates[s]);h+='<div class="progress-row"><div class="label" style="color:var(--'+SUBJ[s].color+')">'+SUBJ[s].name+'<span style="color:var(--text-dim);font-weight:400;font-size:11px;display:block;font-family:var(--fm)">'+(d>=0?d+' '+plural(d,['день','дня','дней']):'прошёл')+'</span></div><div class="progress-track"><div class="progress-fill" style="width:'+p.pct+'%;background:var(--'+SUBJ[s].color+')"></div></div><div class="progress-pct">'+p.done+'/'+p.total+'</div></div>'}
  h+='</div>';
  if(mocks.length){h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-target-arrow"></i> Последние пробники</div><button class="btn btn-ghost btn-sm" onclick="setView(\'mocks\')">Все →</button></div>';mocks.slice(0,3).forEach(m=>{h+=mockRow(m,true)});h+='</div>'}
  document.getElementById('view-today').innerHTML=h;
}

function renderCalendar(){
  const ref=new Date(calRef.getFullYear(),calRef.getMonth(),1);
  const fw=(ref.getDay()+6)%7,dim=new Date(ref.getFullYear(),ref.getMonth()+1,0).getDate(),prev=new Date(ref.getFullYear(),ref.getMonth(),0).getDate();
  const cells=[];
  for(let i=fw;i>0;i--)cells.push({day:prev-i+1,month:ref.getMonth()-1,year:ref.getFullYear(),dim:true});
  for(let d=1;d<=dim;d++)cells.push({day:d,month:ref.getMonth(),year:ref.getFullYear(),dim:false});
  while(cells.length<42){const l=cells[cells.length-1],nd=new Date(l.year,l.month,l.day+1);cells.push({day:nd.getDate(),month:nd.getMonth(),year:nd.getFullYear(),dim:true})}
  let h='<div class="view-head"><div><h1><i class="ti ti-calendar"></i> Календарь</h1><div class="subtitle">Кликни день — увидишь и добавишь события и задачи.</div></div><div class="view-actions"><button class="btn btn-ghost btn-sm" onclick="goToday()"><i class="ti ti-target"></i> Сегодня</button><button class="btn btn-primary" onclick="openEventModal()"><i class="ti ti-plus"></i> Событие</button></div></div>';
  h+='<div class="legend"><span><span class="legend-dot" style="background:var(--russian)"></span>Русский · '+fmtL(state.meta.examDates.russian).split(' ').slice(0,2).join(' ')+'</span><span><span class="legend-dot" style="background:var(--math)"></span>Математика · '+fmtL(state.meta.examDates.math).split(' ').slice(0,2).join(' ')+'</span><span><span class="legend-dot" style="background:var(--informatics)"></span>Информатика · '+fmtL(state.meta.examDates.informatics).split(' ').slice(0,2).join(' ')+'</span></div>';
  h+='<div class="cal-wrap"><div class="cal-head"><div class="cal-month">'+MS[ref.getMonth()]+' '+ref.getFullYear()+'</div><div class="cal-controls"><button class="icon-btn" onclick="navMonth(-1)"><i class="ti ti-chevron-left"></i></button><button class="icon-btn" onclick="navMonth(1)"><i class="ti ti-chevron-right"></i></button></div></div>';
  h+='<div class="cal-weekdays">'+WD.map((w,i)=>'<div class="cal-weekday'+(i>=5?' weekend':'')+'">'+w+'</div>').join('')+'</div><div class="cal-grid">';
  const t=today();
  cells.forEach(c=>{
    const dStr=c.year+'-'+String(c.month+1).padStart(2,'0')+'-'+String(c.day).padStart(2,'0');
    const ev=eventsOn(dStr),td=todosOn(dStr);
    let exS=null;for(const s of Object.keys(SUBJ)){if(state.meta.examDates[s]===dStr){exS=s;break}}
    let cls='cal-cell';if(c.dim)cls+=' dim';if(dStr===t)cls+=' today';if(dStr===calSel)cls+=' selected';if(exS)cls+=' exam';
    let eh='';
    ev.slice(0,2).forEach(e=>{eh+='<div class="cal-evt '+(e.subject||'')+'">'+esc(e.title||'·')+'</div>'});
    if(td.length)eh+='<div class="cal-evt-more">📝 '+td.length+' '+plural(td.length,['задача','задачи','задач'])+'</div>';
    if(ev.length>2)eh+='<div class="cal-evt-more">+'+(ev.length-2)+' ещё</div>';
    if(exS)eh+='<div class="cal-exam-mark">ЭКЗАМЕН · '+SUBJ[exS].short+'</div>';
    h+='<div class="'+cls+'" onclick="selectDay(\''+dStr+'\')"><div class="cal-day-num">'+c.day+'</div><div class="cal-events">'+eh+'</div></div>';
  });
  h+='</div></div>';
  if(calSel){
    const ev=eventsOn(calSel),td=todosOn(calSel);
    h+='<div class="day-panel"><div class="day-head"><div><h3>'+esc(fmtW(calSel))+', '+esc(fmtL(calSel))+'</h3><div style="color:var(--text-dim);font-size:12px;margin-top:2px">'+ev.length+' событий · '+td.length+' задач</div></div><div><button class="btn btn-primary btn-sm" onclick="openEventModal(null,\''+calSel+'\')"><i class="ti ti-plus"></i> Событие</button></div></div>';
    h+=todoAddRow(calSel);
    if(td.length){h+='<div style="margin:14px 0"><div class="event-block-label">Задачи</div><div class="todo-list">';td.forEach(x=>{h+=todoItem(x)});h+='</div></div>'}
    if(ev.length){h+='<div style="margin-top:14px"><div class="event-block-label">События</div>';ev.forEach(x=>{h+=eventCard(x)});h+='</div>'}
    if(!ev.length&&!td.length)h+='<div class="empty-state" style="margin-top:14px"><i class="ti ti-calendar-off"></i>На этот день ничего нет</div>';
    h+='</div>';
  }
  document.getElementById('view-calendar').innerHTML=h;
}
function navMonth(d){calRef=new Date(calRef.getFullYear(),calRef.getMonth()+d,1);renderCalendar()}
function goToday(){calRef=new Date();calSel=today();renderCalendar()}
function selectDay(d){calSel=d;renderCalendar()}

function renderTasksView(){
  const t=today();
  let h='<div class="view-head"><div><h1><i class="ti ti-checklist"></i> Задачи дня</h1><div class="subtitle">Личный план на каждый день.</div></div></div>';
  const labels=['Сегодня','Завтра'];let shown=0;
  for(let i=0;i<14;i++){
    const date=addD(t,i);const td=todosOn(date),ev=eventsOn(date);
    if(i>2&&!td.length&&!ev.length)continue;shown++;
    const lbl=i<2?labels[i]:WDF[pYmd(date).getDay()];
    const dn=td.filter(x=>x.done).length;
    h+='<div class="tasks-day"><div class="tasks-day-head"><div class="tasks-day-date">'+esc(lbl)+'<span class="wd"> · '+esc(fmtL(date))+'</span></div><div class="tasks-day-stat">'+dn+'/'+td.length+' выполнено'+(ev.length?' · '+ev.length+' '+plural(ev.length,['событие','события','событий']):'')+'</div></div>'+todoAddRow(date)+'<div class="todo-list">';
    if(!td.length)h+='<div style="color:var(--text-faint);font-size:12px;padding:6px 4px">— пусто —</div>';else td.forEach(x=>{h+=todoItem(x)});
    h+='</div></div>';
  }
  if(!shown)h+='<div class="empty-state"><i class="ti ti-list-check"></i>Пока нет ни одной задачи</div>';
  document.getElementById('view-tasks').innerHTML=h;
}

function renderSubject(){
  const s=subj,meta=SUBJ[s],p=progressFor(s);
  const d=dBetween(today(),state.meta.examDates[s]);
  const ex=d<0?'прошёл':d===0?'сегодня':d+' '+plural(d,['день','дня','дней']);
  const rmin=remainingMin(s);const sMocks=mocks.filter(m=>m.subject===s);const lastM=sMocks[0];
  const op=state.problems[s].filter(x=>x.status==='open').length;
  let h='<div class="subject-hero '+s+'"><div><h1>'+esc(meta.name)+'</h1><div class="subject-hero-sub">Экзамен '+esc(fmtL(state.meta.examDates[s]))+' · '+esc(fmtW(state.meta.examDates[s]))+'</div></div><div class="subject-hero-count"><div class="subject-hero-num">'+(d<0?'—':d)+'</div><div class="subject-hero-unit">'+ex+' до экзамена</div></div></div>';
  h+='<div class="subj-tabs">';
  for(const k of ['russian','math','informatics'])h+='<button class="subj-tab '+(k===s?'active '+SUBJ[k].color:'')+'" onclick="setView(\''+k+'\')">'+esc(SUBJ[k].name)+'</button>';
  h+='</div>';
  h+='<div class="stats"><div class="stat-card"><div class="stat-label">Готово</div><div class="stat-value" style="color:var(--'+meta.color+')">'+p.done+'<span style="color:var(--text-dim);font-size:18px"> / '+p.total+'</span></div><div class="stat-bar"><div class="stat-bar-fill" style="width:'+p.pct+'%;background:var(--'+meta.color+')"></div></div></div>';
  h+='<div class="stat-card"><div class="stat-label">В работе</div><div class="stat-value">'+p.wip+'</div><div class="stat-foot">'+(p.total-p.done-p.wip)+' ещё не начато</div></div>';
  h+='<div class="stat-card"><div class="stat-label">Осталось времени</div><div class="stat-value">'+(rmin>0?fmtDur(rmin):'—')+'</div><div class="stat-foot">по оценкам на темы</div></div>';
  h+='<div class="stat-card"><div class="stat-label">Последний пробник</div><div class="stat-value">'+(lastM?lastM.score+'<span style="color:var(--text-dim);font-size:18px"> / '+lastM.maxScore+'</span>':'—')+'</div><div class="stat-foot">'+(lastM?fmtL(lastM.date):'ещё не сдавал')+'</div></div>';
  h+='<div class="stat-card"><div class="stat-label">Проблем открыто</div><div class="stat-value">'+op+'</div><div class="stat-foot">по предмету</div></div></div>';
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-list-check"></i> Задания</div><div class="card-meta">кликни задание — раскроется панель</div></div>';
  for(let i=1;i<=meta.count;i++){
    const t=state.tasks[s][i];
    const mp=(t.methods||[]).slice(0,4).map(m=>'<span class="method-tag'+(m.mastered?' mastered':'')+'">'+(m.mastered?'<i class="ti ti-check"></i>':'')+esc(m.text)+'</span>').join('');
    const more=(t.methods||[]).length>4?'<span class="chip">+'+((t.methods||[]).length-4)+'</span>':'';
    const sl={todo:'не начато',wip:'в работе',done:'готово'}[t.status];
    const tc=t.timeMin>0?'<span class="time-chip"><i class="ti ti-clock"></i> '+fmtDur(t.timeMin)+'</span>':'';
    h+='<div class="task-row" onclick="toggleExpand(\''+s+'\','+i+')"><div class="task-num">№<strong>'+i+'</strong></div><div class="task-content"><div class="task-title">'+esc(t.title)+'</div><div class="task-meta">'+(mp||'<span style="color:var(--text-faint)">нет методов</span>')+more+tc+'</div></div><div class="status-pill '+t.status+'" onclick="event.stopPropagation();cycleStatus(\''+s+'\','+i+')">'+sl+'</div></div>';
    h+='<div class="task-expand" id="exp-'+s+'-'+i+'">';
    h+='<div class="task-expand-row"><div class="task-expand-label">Методы решения</div><div class="method-list">'+((t.methods||[]).length?(t.methods||[]).map(m=>'<span class="method-tag'+(m.mastered?' mastered':'')+'" onclick="event.stopPropagation();toggleMaster(\''+s+'\','+i+',\''+m.id+'\')">'+(m.mastered?'<i class="ti ti-check"></i>':'<i class="ti ti-circle"></i>')+esc(m.text)+'<span class="rm" onclick="event.stopPropagation();rmMethod(\''+s+'\','+i+',\''+m.id+'\')"><i class="ti ti-x"></i></span></span>').join(''):'<span style="color:var(--text-faint);font-size:12px">пока пусто</span>')+'</div><div class="method-add" onclick="event.stopPropagation()"><input type="text" id="nm-'+s+'-'+i+'" placeholder="например: кодом / руками / регулярка"><button class="btn btn-sm btn-primary" onclick="addMethod(\''+s+'\','+i+')"><i class="ti ti-plus"></i></button></div></div>';
    h+='<div class="task-expand-row" onclick="event.stopPropagation()"><div class="task-expand-label">Оценка времени на тему (минут)</div><input type="number" min="0" max="9999" value="'+(t.timeMin||0)+'" onchange="saveTime(\''+s+'\','+i+',this.value)" style="max-width:140px"></div>';
    h+='<div class="task-expand-row" onclick="event.stopPropagation()"><div class="task-expand-label">Заметки</div><textarea onblur="saveNotes(\''+s+'\','+i+',this.value)" placeholder="ключевые формулы, ловушки, типовые ошибки…">'+esc(t.notes||'')+'</textarea></div>';
    h+='<div class="task-expand-row" style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" onclick="event.stopPropagation();editTitle(\''+s+'\','+i+')"><i class="ti ti-edit"></i> Название</button></div></div>';
  }
  h+='</div>';
  const left=Object.entries(state.tasks[s]).filter(([_,t])=>t.status!=='done').map(([n,t])=>({n:parseInt(n,10),...t}));
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-flag"></i> Что осталось пройти</div><div class="card-meta">'+left.length+' тем</div></div>';
  if(!left.length)h+='<div class="empty-state"><i class="ti ti-trophy"></i>Все темы пройдены!</div>';
  else{h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';left.forEach(t=>{h+='<div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border-soft);border-radius:8px;font-size:13px"><span style="color:var(--text-dim);font-family:var(--fm);font-size:11px">№ '+t.n+'</span> '+esc(t.title)+(t.timeMin>0?' <span class="time-chip" style="margin-left:6px">'+fmtDur(t.timeMin)+'</span>':'')+'</div>'});h+='</div>'}
  h+='</div>';
  document.getElementById('view-'+s).innerHTML=h;
}
function toggleExpand(s,i){const e=document.getElementById('exp-'+s+'-'+i);if(e)e.classList.toggle('open')}
function cycleStatus(s,i){const c=state.tasks[s][i].status;state.tasks[s][i].status={todo:'wip',wip:'done',done:'todo'}[c];scheduleSave();renderSubject();renderHeader()}
function addMethod(s,i){const inp=document.getElementById('nm-'+s+'-'+i);const t=inp.value.trim();if(!t)return;state.tasks[s][i].methods.push({id:uid(),text:t,mastered:false});scheduleSave();renderSubject();setTimeout(()=>document.getElementById('exp-'+s+'-'+i).classList.add('open'),0)}
function rmMethod(s,i,mid){state.tasks[s][i].methods=state.tasks[s][i].methods.filter(m=>m.id!==mid);scheduleSave();renderSubject();setTimeout(()=>document.getElementById('exp-'+s+'-'+i).classList.add('open'),0)}
function toggleMaster(s,i,mid){const m=state.tasks[s][i].methods.find(x=>x.id===mid);if(m){m.mastered=!m.mastered;scheduleSave();renderSubject();setTimeout(()=>document.getElementById('exp-'+s+'-'+i).classList.add('open'),0)}}
function saveTime(s,i,v){state.tasks[s][i].timeMin=Math.max(0,parseInt(v,10)||0);scheduleSave()}
function saveNotes(s,i,v){state.tasks[s][i].notes=v;scheduleSave()}
function editTitle(s,i){const n=prompt('Название задания №'+i,state.tasks[s][i].title);if(n!=null&&n.trim()){state.tasks[s][i].title=n.trim();scheduleSave();renderSubject()}}

function mockRow(m,compact){
  const p=Math.round(m.score/m.maxScore*100);
  const c=p>=80?'var(--success)':p>=60?'var(--accent)':p>=40?'var(--warn)':'var(--danger)';
  return '<div class="mock-item"><div class="mock-top"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="event-tag '+m.subject+'">'+SUBJ[m.subject].short+'</span><span style="font-weight:500">'+esc(m.title||'Пробник')+'</span><span class="row-meta">'+esc(fmtL(m.date))+'</span></div><div style="display:flex;align-items:center;gap:10px"><span class="mock-score">'+m.score+' / '+m.maxScore+'</span><span class="chip" style="color:'+c+';background:transparent;border:1px solid '+c+'33">'+p+'%</span>'+(compact?'':'<div class="row-actions"><button onclick="openMockModal(\''+m.id+'\')"><i class="ti ti-edit"></i></button><button onclick="deleteMock(\''+m.id+'\')"><i class="ti ti-trash"></i></button></div>')+'</div></div>'+(m.weakTasks&&m.weakTasks.length?'<div class="row-meta" style="margin-top:6px">Слабые задания: <span style="color:var(--text-mute)">'+esc(m.weakTasks.join(', '))+'</span></div>':'')+(m.notes&&!compact?'<div class="row-meta" style="margin-top:4px">'+esc(m.notes)+'</div>':'')+'<div class="score-bar"><div class="score-fill" style="width:'+p+'%;background:'+c+'"></div></div></div>';
}

function renderMocks(){
  let h='<div class="view-head"><div><h1><i class="ti ti-chart-line"></i> Пробники</h1><div class="subtitle">Привязывай к событиям. Лучший результат — в общий топ-лист.</div></div><div class="view-actions"><button class="btn btn-primary" onclick="openMockModal()"><i class="ti ti-plus"></i> Добавить пробник</button></div></div>';
  for(const s of ['russian','math','informatics']){
    const ms=mocks.filter(m=>m.subject===s).sort((a,b)=>b.date.localeCompare(a.date));
    const avg=ms.length?Math.round(ms.reduce((sum,m)=>sum+m.score/m.maxScore*100,0)/ms.length):0;
    const best=ms.reduce((b,m)=>(m.score/m.maxScore>(b?b.score/b.maxScore:0)?m:b),null);
    h+='<div class="card"><div class="card-head"><div class="card-title"><span class="legend-dot" style="background:var(--'+SUBJ[s].color+');width:10px;height:10px"></span>'+esc(SUBJ[s].name)+'</div><div class="card-meta">'+ms.length+' пробников · среднее '+avg+'%'+(best?' · лучший '+best.score+'/'+best.maxScore:'')+'</div></div>';
    if(!ms.length)h+='<div class="empty-state"><i class="ti ti-clipboard-list"></i>По этому предмету ещё нет пробников</div>';else ms.forEach(m=>{h+=mockRow(m,false)});
    h+='</div>';
  }
  document.getElementById('view-mocks').innerHTML=h;
}

function renderProblems(){
  let h='<div class="view-head"><div><h1><i class="ti ti-alert-triangle"></i> Проблемы</h1><div class="subtitle">В чём ещё надо разобраться.</div></div><div class="view-actions"><button class="btn btn-primary" onclick="openProblemModal()"><i class="ti ti-plus"></i> Записать проблему</button></div></div>';
  for(const s of ['russian','math','informatics']){
    const items=state.problems[s];const op=items.filter(p=>p.status==='open').length;
    h+='<div class="card"><div class="card-head"><div class="card-title"><span class="legend-dot" style="background:var(--'+SUBJ[s].color+');width:10px;height:10px"></span>'+esc(SUBJ[s].name)+'</div><div class="card-meta">'+op+' открыто · '+(items.length-op)+' решено</div></div>';
    if(!items.length)h+='<div class="empty-state"><i class="ti ti-mood-smile"></i>Пока без проблем</div>';
    else{const sorted=items.slice().sort((a,b)=>(a.status==='open'?-1:1)-(b.status==='open'?-1:1));
      sorted.forEach(p=>{h+='<div class="problem-item"><div style="display:flex;align-items:flex-start;gap:10px"><span class="checkbox'+(p.status==='solved'?' on':'')+'" onclick="toggleProblem(\''+s+'\',\''+p.id+'\')"></span><div style="flex:1;min-width:0"><div class="problem-text'+(p.status==='solved'?' done':'')+'">'+esc(p.text)+'</div>'+(p.area?'<div class="row-meta">'+esc(p.area)+'</div>':'')+'</div><div class="row-actions"><button onclick="openProblemModal(\''+s+'\',\''+p.id+'\')"><i class="ti ti-edit"></i></button><button onclick="deleteProblem(\''+s+'\',\''+p.id+'\')"><i class="ti ti-trash"></i></button></div></div></div>'});
    }
    h+='</div>';
  }
  document.getElementById('view-problems').innerHTML=h;
}
function toggleProblem(s,id){const p=state.problems[s].find(x=>x.id===id);if(p){p.status=p.status==='solved'?'open':'solved';scheduleSave();renderProblems()}}
function deleteProblem(s,id){if(!confirm('Удалить?'))return;state.problems[s]=state.problems[s].filter(x=>x.id!==id);scheduleSave();renderProblems()}

function renderGoals(){
  const t=today();
  let h='<div class="view-head"><div><h1><i class="ti ti-target"></i> Цели</h1><div class="subtitle">Цели с конкретными датами.</div></div><div class="view-actions"><button class="btn btn-primary" onclick="openGoalModal()"><i class="ti ti-plus"></i> Поставить цель</button></div></div>';
  const gs=state.goals.slice().sort((a,b)=>(a.done?1:-1)-(b.done?1:-1)||a.dueDate.localeCompare(b.dueDate));
  h+='<div class="card">';
  if(!gs.length)h+='<div class="empty-state"><i class="ti ti-flag"></i>Целей пока нет</div>';
  else gs.forEach(g=>{
    const d=dBetween(t,g.dueDate);
    let chip='';if(g.done)chip='<span class="chip success">выполнено</span>';else if(d<0)chip='<span class="chip danger">'+Math.abs(d)+' дн. просрочено</span>';else if(d===0)chip='<span class="chip warn">сегодня</span>';else if(d<=3)chip='<span class="chip warn">'+d+' дн.</span>';else chip='<span class="chip">'+d+' дн.</span>';
    h+='<div class="problem-item"><div style="display:flex;align-items:flex-start;gap:10px"><span class="checkbox'+(g.done?' on':'')+'" onclick="toggleGoal(\''+g.id+'\')"></span><div style="flex:1"><div class="problem-text'+(g.done?' done':'')+'">'+esc(g.text)+'</div><div class="row-meta">'+(g.subject?'<span class="event-tag '+g.subject+'">'+SUBJ[g.subject].short+'</span>':'')+'<span>'+esc(fmtL(g.dueDate))+'</span>'+chip+'</div></div><div class="row-actions"><button onclick="openGoalModal(\''+g.id+'\')"><i class="ti ti-edit"></i></button><button onclick="deleteGoal(\''+g.id+'\')"><i class="ti ti-trash"></i></button></div></div></div>';
  });
  h+='</div>';
  document.getElementById('view-goals').innerHTML=h;
}
function toggleGoal(id){const g=state.goals.find(x=>x.id===id);if(g){g.done=!g.done;scheduleSave();renderGoals()}}
function deleteGoal(id){if(!confirm('Удалить?'))return;state.goals=state.goals.filter(x=>x.id!==id);scheduleSave();renderGoals()}

let commSubj='overall';
async function renderCommunity(){
  document.getElementById('view-community').innerHTML='<div class="view-head"><div><h1><i class="ti ti-users"></i> Топ-лист</h1></div></div><div class="card"><div style="text-align:center;color:var(--text-dim);padding:20px">Загружаю…</div></div>';
  try{
    const [board,users]=await Promise.all([api('GET','/api/leaderboard?subject='+commSubj),api('GET','/api/users')]);
    let h='<div class="view-head"><div><h1><i class="ti ti-users"></i> Топ-лист</h1><div class="subtitle">Лидеры по пробникам. Кликни на пользователя.</div></div></div>';
    h+='<div class="subj-tabs">';
    const tabs=[['overall','Общий'],['russian','Русский'],['math','Математика'],['informatics','Информатика']];
    for(const[k,n]of tabs)h+='<button class="subj-tab '+(k===commSubj?'active'+(k!=='overall'?' '+k:''):'')+'" onclick="commSubj=\''+k+'\';renderCommunity()">'+esc(n)+'</button>';
    h+='</div>';
    h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-trophy"></i> Лидеры'+(commSubj!=='overall'?' · '+SUBJ[commSubj].name:'')+'</div><div class="card-meta">'+board.length+' '+plural(board.length,['участник','участника','участников'])+'</div></div>';
    if(!board.length)h+='<div class="empty-state"><i class="ti ti-mood-empty"></i>Пока никто не загрузил пробники</div>';
    else{
      h+='<table class="leader"><thead><tr><th>Место</th><th>Пользователь</th><th>Лучший</th><th>Средний</th><th>Пробников</th></tr></thead><tbody>';
      board.forEach((r,i)=>{
        const rk=i===0?'gold':i===1?'silver':i===2?'bronze':'';
        h+='<tr onclick="viewUser(\''+esc(r.username)+'\')"><td class="leader-rank '+rk+'">#'+(i+1)+'</td><td><div class="leader-user"><div class="user-tile-av" style="width:32px;height:32px;font-size:13px">'+esc((r.displayName||r.username).charAt(0).toUpperCase())+'</div><div><div class="leader-name">'+esc(r.displayName)+'</div><div class="leader-handle">@'+esc(r.username)+'</div></div></div></td><td class="leader-pct">'+r.bestPct+'%</td><td class="leader-pct" style="color:var(--text-mute)">'+r.avgPct+'%</td><td class="leader-pct" style="color:var(--text-mute)">'+r.count+'</td></tr>';
      });
      h+='</tbody></table>';
    }
    h+='</div>';
    h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-user-search"></i> Все участники</div><div class="card-meta">'+users.length+'</div></div>';
    if(!users.length)h+='<div class="empty-state"><i class="ti ti-users-group"></i>Пока никого нет</div>';
    else{
      h+='<div class="user-grid">';
      users.forEach(u=>{h+='<div class="user-tile" onclick="viewUser(\''+esc(u.username)+'\')"><div class="user-tile-head"><div class="user-tile-av">'+esc((u.displayName||u.username).charAt(0).toUpperCase())+'</div><div><div style="font-weight:500">'+esc(u.displayName)+'</div><div class="leader-handle">@'+esc(u.username)+'</div></div></div>'+(u.bio?'<div class="user-tile-bio">'+esc(u.bio)+'</div>':'')+'<div class="user-tile-stats"><div class="user-tile-stat"><strong>'+u.mockCount+'</strong>пробников</div>'+(u.avgPct!==null?'<div class="user-tile-stat"><strong>'+u.avgPct+'%</strong>средний</div>':'')+'</div></div>'});
      h+='</div>';
    }
    h+='</div>';
    document.getElementById('view-community').innerHTML=h;
  }catch(e){document.getElementById('view-community').innerHTML='<div class="empty-state"><i class="ti ti-alert-circle"></i>Не удалось загрузить: '+esc(e.message)+'</div>'}
}

async function viewUser(username){
  setView('user');
  document.getElementById('view-user').innerHTML='<div style="text-align:center;color:var(--text-dim);padding:40px">Загружаю…</div>';
  try{
    const r=await api('GET','/api/users/'+encodeURIComponent(username));
    let h='<div class="view-head"><div><h1><i class="ti ti-user"></i> @'+esc(r.user.username)+'</h1><div class="subtitle"><button class="btn btn-ghost btn-sm" onclick="setView(\'community\')"><i class="ti ti-arrow-left"></i> К топ-листу</button></div></div></div>';
    h+='<div class="profile-hero"><div class="profile-av">'+esc((r.user.displayName||r.user.username).charAt(0).toUpperCase())+'</div><div><div class="profile-name">'+esc(r.user.displayName)+'</div><div class="profile-handle">@'+esc(r.user.username)+'</div>'+(r.user.bio?'<div class="profile-bio">'+esc(r.user.bio)+'</div>':'')+'</div></div>';
    const total=r.mocks.length;const avg=total?Math.round(r.mocks.reduce((s,m)=>s+m.score/m.maxScore*100,0)/total):0;const best=r.mocks.reduce((b,m)=>(m.score/m.maxScore>(b?b.score/b.maxScore:0)?m:b),null);const bestPct=best?Math.round(best.score/best.maxScore*100):0;
    h+='<div class="stats"><div class="stat-card"><div class="stat-label">Пробников</div><div class="stat-value">'+total+'</div></div><div class="stat-card"><div class="stat-label">Средний %</div><div class="stat-value">'+avg+'%</div></div><div class="stat-card"><div class="stat-label">Лучший %</div><div class="stat-value">'+bestPct+'%</div></div></div>';
    h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-chart-bar"></i> Прогресс по темам</div></div>';
    for(const s of ['russian','math','informatics']){const p=r.taskProgress[s]||{done:0,total:0};const pct=p.total?Math.round(p.done*100/p.total):0;h+='<div class="progress-row"><div class="label" style="color:var(--'+SUBJ[s].color+')">'+SUBJ[s].name+'</div><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--'+SUBJ[s].color+')"></div></div><div class="progress-pct">'+p.done+'/'+p.total+'</div></div>'}
    h+='</div>';
    h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-chart-line"></i> Пробники</div></div>';
    if(!r.mocks.length)h+='<div class="empty-state"><i class="ti ti-clipboard-list"></i>Пользователь ещё не загружал пробники</div>';
    else r.mocks.slice(0,20).forEach(m=>{h+=mockRow(m,true)});
    h+='</div>';
    document.getElementById('view-user').innerHTML=h;
  }catch(e){document.getElementById('view-user').innerHTML='<div class="empty-state"><i class="ti ti-alert-circle"></i>'+esc(e.message)+'</div>'}
}

function renderProfile(){
  let h='<div class="view-head"><div><h1><i class="ti ti-user"></i> Профиль</h1><div class="subtitle">Как тебя видят другие в топ-листе.</div></div></div>';
  h+='<div class="profile-hero"><div class="profile-av">'+esc((me.displayName||me.username).charAt(0).toUpperCase())+'</div><div><div class="profile-name">'+esc(me.displayName)+'</div><div class="profile-handle">@'+esc(me.username)+'</div>'+(me.bio?'<div class="profile-bio">'+esc(me.bio)+'</div>':'')+'</div></div>';
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-edit"></i> Редактирование</div></div>';
  h+='<div style="display:flex;flex-direction:column;gap:14px"><label class="field">Отображаемое имя<input type="text" id="pf-name" value="'+esc(me.displayName)+'" maxlength="40"></label>';
  h+='<label class="field">О себе (видно другим)<textarea id="pf-bio" maxlength="200" placeholder="несколько слов о цели, школе, городе…">'+esc(me.bio||'')+'</textarea></label>';
  h+='<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="pf-pub" '+(me.isPublic?'checked':'')+' style="width:auto"> Публичный профиль (показывать в топ-листе)</label>';
  h+='<div><button class="btn btn-primary" onclick="saveProfile()"><i class="ti ti-device-floppy"></i> Сохранить</button></div></div></div>';
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-key"></i> Смена пароля</div></div>';
  h+='<div style="display:flex;flex-direction:column;gap:12px;max-width:360px"><label class="field">Текущий пароль<input type="password" id="pw-cur"></label><label class="field">Новый пароль<input type="password" id="pw-new" minlength="6"></label><div><button class="btn" onclick="changePass()">Сменить пароль</button></div></div></div>';
  document.getElementById('view-profile').innerHTML=h;
}
async function saveProfile(){try{await api('PUT','/api/profile',{displayName:document.getElementById('pf-name').value,bio:document.getElementById('pf-bio').value,isPublic:document.getElementById('pf-pub').checked});me.displayName=document.getElementById('pf-name').value;me.bio=document.getElementById('pf-bio').value;me.isPublic=document.getElementById('pf-pub').checked;document.getElementById('un').textContent=me.displayName;toast('Сохранено');renderProfile()}catch(e){toast(e.message,'error')}}
async function changePass(){const cur=document.getElementById('pw-cur').value,nw=document.getElementById('pw-new').value;if(!cur||!nw)return;try{await api('POST','/api/password',{current:cur,next:nw});document.getElementById('pw-cur').value='';document.getElementById('pw-new').value='';toast('Пароль изменён')}catch(e){toast(e.message,'error')}}

function renderAdmin(){
  let h='<div class="view-head"><div><h1><i class="ti ti-settings"></i> Настройки</h1><div class="subtitle">Даты экзаменов и названия заданий.</div></div></div>';
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-flag"></i> Даты</div></div>';
  h+='<div class="field-row"><label class="field">Старт марафона<input type="date" value="'+esc(state.meta.startDate)+'" onchange="state.meta.startDate=this.value;scheduleSave();renderHeader();toast(\'Сохранено\')"></label>';
  h+='<label class="field">Русский язык<input type="date" value="'+esc(state.meta.examDates.russian)+'" onchange="state.meta.examDates.russian=this.value;scheduleSave();renderHeader();renderAll();toast(\'Сохранено\')"></label>';
  h+='<label class="field">Математика<input type="date" value="'+esc(state.meta.examDates.math)+'" onchange="state.meta.examDates.math=this.value;scheduleSave();renderHeader();renderAll();toast(\'Сохранено\')"></label>';
  h+='<label class="field">Информатика<input type="date" value="'+esc(state.meta.examDates.informatics)+'" onchange="state.meta.examDates.informatics=this.value;scheduleSave();renderHeader();renderAll();toast(\'Сохранено\')"></label></div></div>';
  h+='<div class="card"><div class="card-head"><div class="card-title"><i class="ti ti-list"></i> Названия заданий</div></div><div class="subj-tabs">';
  for(const s of ['russian','math','informatics'])h+='<button class="subj-tab '+(s===subj?'active '+SUBJ[s].color:'')+'" onclick="subj=\''+s+'\';renderAdmin()">'+esc(SUBJ[s].name)+'</button>';
  h+='</div>';
  for(let i=1;i<=SUBJ[subj].count;i++)h+='<div style="display:grid;grid-template-columns:50px 1fr;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft)"><span style="font-family:var(--fm);color:var(--text-dim);font-size:12px">№'+i+'</span><input type="text" value="'+esc(state.tasks[subj][i].title)+'" onchange="state.tasks[\''+subj+'\']['+i+'].title=this.value;scheduleSave();toast(\'Сохранено\')"></div>';
  h+='</div>';
  document.getElementById('view-admin').innerHTML=h;
}

function openModal(t,b){document.getElementById('modal-title').textContent=t;document.getElementById('modal-body').innerHTML=b;document.getElementById('modal').hidden=false}
function closeModal(){document.getElementById('modal').hidden=true}

function openEventModal(id,preDate){
  const isE=!!id;const e=isE?state.events.find(x=>x.id===id):{id:'',date:preDate||today(),startTime:'',endTime:'',subject:'',title:'',taskNumbers:[],problemIds:[],mockIds:[],notes:'',status:'planned'};
  if(!e)return;
  const sOpts='<option value="">— без предмета —</option>'+Object.keys(SUBJ).map(k=>'<option value="'+k+'"'+(e.subject===k?' selected':'')+'>'+SUBJ[k].name+'</option>').join('');
  const sts=[['planned','запланировано'],['confirmed','подтверждено'],['done','выполнено'],['missed','пропущено']].map(([v,l])=>'<option value="'+v+'"'+((e.status||'planned')===v?' selected':'')+'>'+l+'</option>').join('');
  let probHtml='';for(const s of Object.keys(SUBJ)){state.problems[s].filter(p=>p.status==='open').forEach(p=>{probHtml+='<label><input type="checkbox" name="prob" value="'+p.id+'"'+((e.problemIds||[]).includes(p.id)?' checked':'')+'><span class="event-tag '+s+'">'+SUBJ[s].short+'</span>'+esc(p.text)+'</label>'})}
  if(!probHtml)probHtml='<div style="color:var(--text-faint);font-size:12px;padding:8px">— нет открытых проблем —</div>';
  let mockHtml='';mocks.forEach(m=>{mockHtml+='<label><input type="checkbox" name="mock" value="'+m.id+'"'+((e.mockIds||[]).includes(m.id)?' checked':'')+'><span class="event-tag '+m.subject+'">'+SUBJ[m.subject].short+'</span>'+esc(m.title||'Пробник')+' '+m.score+'/'+m.maxScore+' · '+esc(fmtL(m.date))+'</label>'});
  if(!mockHtml)mockHtml='<div style="color:var(--text-faint);font-size:12px;padding:8px">— нет пробников —</div>';
  const body='<label class="field">Название<input type="text" id="ev-title" value="'+esc(e.title)+'" placeholder="например: Разбор задания 24"></label><div class="field-row"><label class="field">Дата<input type="date" id="ev-date" value="'+esc(e.date)+'"></label><label class="field">Начало<input type="time" id="ev-start" value="'+esc(e.startTime)+'"></label><label class="field">Конец<input type="time" id="ev-end" value="'+esc(e.endTime)+'"></label></div><div class="field-row"><label class="field">Предмет<select id="ev-subj">'+sOpts+'</select></label><label class="field">Статус<select id="ev-status">'+sts+'</select></label></div><label class="field">Номера заданий через запятую<input type="text" id="ev-tasks" value="'+esc((e.taskNumbers||[]).join(', '))+'" placeholder="например: 1, 15, 24"></label><label class="field">Связанные проблемы<div class="checklist">'+probHtml+'</div></label><label class="field">Связанные пробники<div class="checklist">'+mockHtml+'</div></label><label class="field">Заметка<textarea id="ev-notes" placeholder="что именно делать, источник…">'+esc(e.notes||'')+'</textarea></label><div class="form-actions">'+(isE?'<button class="btn btn-danger" onclick="deleteEvent(\''+e.id+'\')"><i class="ti ti-trash"></i> Удалить</button>':'')+'<button class="btn" onclick="closeModal()">Отмена</button><button class="btn btn-primary" onclick="saveEvent(\''+(e.id||'')+'\')"><i class="ti ti-device-floppy"></i> Сохранить</button></div>';
  openModal(isE?'Событие':'Новое событие',body);
}
function saveEvent(id){
  const probs=Array.from(document.querySelectorAll('input[name=prob]:checked')).map(x=>x.value);
  const mks=Array.from(document.querySelectorAll('input[name=mock]:checked')).map(x=>x.value);
  const obj={id:id||uid(),title:document.getElementById('ev-title').value.trim()||'Без названия',date:document.getElementById('ev-date').value||today(),startTime:document.getElementById('ev-start').value,endTime:document.getElementById('ev-end').value,subject:document.getElementById('ev-subj').value,status:document.getElementById('ev-status').value,taskNumbers:document.getElementById('ev-tasks').value.split(',').map(x=>x.trim()).filter(Boolean),problemIds:probs,mockIds:mks,notes:document.getElementById('ev-notes').value.trim()};
  if(id)state.events=state.events.map(e=>e.id===id?obj:e);else state.events.push(obj);
  scheduleSave();closeModal();renderView(view);toast('Сохранено');
}
function deleteEvent(id){if(!confirm('Удалить событие?'))return;state.events=state.events.filter(e=>e.id!==id);scheduleSave();closeModal();renderView(view)}

function openMockModal(id){
  const isE=!!id;const m=isE?mocks.find(x=>x.id===id):{id:'',date:today(),subject:'russian',score:0,maxScore:SUBJ.russian.max,title:'',weakTasks:[],notes:''};
  if(!m)return;
  const sOpts=Object.keys(SUBJ).map(k=>'<option value="'+k+'"'+(m.subject===k?' selected':'')+'>'+SUBJ[k].name+'</option>').join('');
  const body='<div class="field-row"><label class="field">Предмет<select id="mk-subj" onchange="document.getElementById(\'mk-max\').value=({russian:'+SUBJ.russian.max+',math:'+SUBJ.math.max+',informatics:'+SUBJ.informatics.max+'})[this.value]">'+sOpts+'</select></label><label class="field">Дата<input type="date" id="mk-date" value="'+esc(m.date)+'"></label></div><label class="field">Название<input type="text" id="mk-title" value="'+esc(m.title||'')+'" placeholder="например: ФИПИ вариант 8"></label><div class="field-row"><label class="field">Баллы<input type="number" id="mk-score" value="'+m.score+'" min="0"></label><label class="field">Из<input type="number" id="mk-max" value="'+m.maxScore+'" min="1"></label></div><label class="field">Слабые задания через запятую<input type="text" id="mk-weak" value="'+esc((m.weakTasks||[]).join(', '))+'" placeholder="например: 9, 15, 24"></label><label class="field">Анализ ошибок<textarea id="mk-notes">'+esc(m.notes||'')+'</textarea></label><div class="form-actions">'+(isE?'<button class="btn btn-danger" onclick="deleteMock(\''+m.id+'\');closeModal()"><i class="ti ti-trash"></i> Удалить</button>':'')+'<button class="btn" onclick="closeModal()">Отмена</button><button class="btn btn-primary" onclick="saveMock(\''+(m.id||'')+'\')"><i class="ti ti-device-floppy"></i> Сохранить</button></div>';
  openModal(isE?'Пробник':'Новый пробник',body);
}
async function saveMock(id){
  const payload={date:document.getElementById('mk-date').value||today(),subject:document.getElementById('mk-subj').value,title:document.getElementById('mk-title').value.trim(),score:Math.max(0,parseInt(document.getElementById('mk-score').value||'0',10)),maxScore:Math.max(1,parseInt(document.getElementById('mk-max').value||'1',10)),weakTasks:document.getElementById('mk-weak').value.split(',').map(x=>x.trim()).filter(Boolean),notes:document.getElementById('mk-notes').value.trim()};
  try{
    if(id){await api('PUT','/api/mocks/'+id,payload);const idx=mocks.findIndex(m=>m.id===id);if(idx>=0)mocks[idx]={...mocks[idx],...payload}}
    else{const r=await api('POST','/api/mocks',payload);mocks.unshift(r)}
    mocks.sort((a,b)=>b.date.localeCompare(a.date));
    closeModal();renderView(view);toast('Сохранено');
  }catch(e){toast(e.message,'error')}
}
async function deleteMock(id){if(!confirm('Удалить пробник?'))return;try{await api('DELETE','/api/mocks/'+id);mocks=mocks.filter(m=>m.id!==id);state.events.forEach(e=>{if(e.mockIds)e.mockIds=e.mockIds.filter(x=>x!==id)});scheduleSave();renderView(view)}catch(e){toast(e.message,'error')}}

function openProblemModal(s,id){
  const isE=!!id;const p=isE?state.problems[s].find(x=>x.id===id):{id:'',text:'',area:'',status:'open'};
  if(!p)return;
  const sOpts=Object.keys(SUBJ).map(k=>'<option value="'+k+'"'+((s||'russian')===k?' selected':'')+'>'+SUBJ[k].name+'</option>').join('');
  const body='<label class="field">Предмет<select id="pr-subj">'+sOpts+'</select></label><label class="field">Описание<textarea id="pr-text">'+esc(p.text)+'</textarea></label><label class="field">Тема/задание<input type="text" id="pr-area" value="'+esc(p.area||'')+'" placeholder="например: задание 12"></label><div class="form-actions">'+(isE?'<button class="btn btn-danger" onclick="deleteProblem(\''+s+'\',\''+p.id+'\');closeModal()"><i class="ti ti-trash"></i> Удалить</button>':'')+'<button class="btn" onclick="closeModal()">Отмена</button><button class="btn btn-primary" onclick="saveProblem(\''+(s||'')+'\',\''+(p.id||'')+'\')"><i class="ti ti-device-floppy"></i> Сохранить</button></div>';
  openModal(isE?'Проблема':'Новая проблема',body);
}
function saveProblem(oldS,id){
  const newS=document.getElementById('pr-subj').value;
  const old=id&&oldS?state.problems[oldS].find(x=>x.id===id):null;
  const obj={id:id||uid(),text:document.getElementById('pr-text').value.trim()||'Без описания',area:document.getElementById('pr-area').value.trim(),status:old?old.status:'open',addedAt:old?old.addedAt:today()};
  if(id&&oldS&&oldS!==newS){state.problems[oldS]=state.problems[oldS].filter(x=>x.id!==id);state.problems[newS].push(obj)}
  else if(id){state.problems[newS]=state.problems[newS].map(x=>x.id===id?obj:x)}
  else state.problems[newS].push(obj);
  scheduleSave();closeModal();renderProblems();toast('Сохранено');
}

function openGoalModal(id){
  const isE=!!id;const g=isE?state.goals.find(x=>x.id===id):{id:'',dueDate:today(),subject:'',text:'',done:false};
  if(!g)return;
  const sOpts='<option value="">— общая —</option>'+Object.keys(SUBJ).map(k=>'<option value="'+k+'"'+(g.subject===k?' selected':'')+'>'+SUBJ[k].name+'</option>').join('');
  const body='<label class="field">Что должно быть готово<textarea id="gl-text">'+esc(g.text)+'</textarea></label><div class="field-row"><label class="field">Дедлайн<input type="date" id="gl-date" value="'+esc(g.dueDate)+'"></label><label class="field">Предмет<select id="gl-subj">'+sOpts+'</select></label></div><div class="form-actions">'+(isE?'<button class="btn btn-danger" onclick="deleteGoal(\''+g.id+'\');closeModal()"><i class="ti ti-trash"></i> Удалить</button>':'')+'<button class="btn" onclick="closeModal()">Отмена</button><button class="btn btn-primary" onclick="saveGoal(\''+(g.id||'')+'\')"><i class="ti ti-device-floppy"></i> Сохранить</button></div>';
  openModal(isE?'Цель':'Новая цель',body);
}
function saveGoal(id){
  const old=id?state.goals.find(x=>x.id===id):null;
  const obj={id:id||uid(),text:document.getElementById('gl-text').value.trim()||'Без описания',dueDate:document.getElementById('gl-date').value||today(),subject:document.getElementById('gl-subj').value,done:old?old.done:false};
  if(id)state.goals=state.goals.map(g=>g.id===id?obj:g);else state.goals.push(obj);
  scheduleSave();closeModal();renderGoals();toast('Сохранено');
}

document.addEventListener('DOMContentLoaded',async()=>{
  applyTheme();
  document.querySelectorAll('.auth-tab').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.mode)));
  document.getElementById('auth-form').addEventListener('submit',handleAuth);
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.getElementById('qa').addEventListener('click',()=>openEventModal());
  document.getElementById('theme-btn').addEventListener('click',toggleTheme);
  document.getElementById('logout-btn').addEventListener('click',doLogout);
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeModal));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
  calSel=today();
  try{await loadAndShow()}
  catch(e){if(e.status===401)showAuth();else{showAuth();toast('Сервер недоступен: '+e.message,'error')}}
});
