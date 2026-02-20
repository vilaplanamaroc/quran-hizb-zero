const TOTAL = 60;
const PROGRESS_KEY = "hizb_done_v1";
const API_BASE = "https://api.alquran.cloud/v1";

let hizbData = null;        // loaded from data/hizb.json
let selected = null;
let done = Array(TOTAL).fill(false);
const surahCache = new Map();

const el = (id) => document.getElementById(id);

function setStatus(msg){ el("status").textContent = msg; }

function loadProgress(){
  try{
    const raw = localStorage.getItem(PROGRESS_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(Array.isArray(s.done) && s.done.length===TOTAL) done = s.done;
  }catch{}
}
function saveProgress(){ localStorage.setItem(PROGRESS_KEY, JSON.stringify({done})); }

function renderGrid(){
  const g = el("grid");
  g.innerHTML = "";
  for(let i=1;i<=TOTAL;i++){
    const b = document.createElement("button");
    b.className = "hizbBtn";
    if(done[i-1]) b.classList.add("done");
    if(selected===i) b.classList.add("active");
    b.textContent = `حزب ${i}`;
    b.onclick = () => openHizb(i);
    g.appendChild(b);
  }
}

function setButtons(){
  const d = el("doneBtn"), u = el("undoBtn");
  if(!selected){ d.disabled = true; u.disabled = true; return; }
  d.disabled = done[selected-1];
  u.disabled = !done[selected-1];
}

function showError(msg){
  el("reader").innerHTML = `<div class="error">${msg}</div>`;
}

async function loadJSON(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return r.json();
}

async function fetchSurah(surahNumber){
  if(surahCache.has(surahNumber)) return surahCache.get(surahNumber);
  const url = `${API_BASE}/surah/${surahNumber}/quran-uthmani`;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`API error for surah ${surahNumber}`);
  const json = await r.json();
  const surah = json.data;
  surahCache.set(surahNumber, surah);
  return surah;
}

function parseRange(rangeStr){
  // "1-74"
  const [a,b] = String(rangeStr).split("-").map(x=>parseInt(x,10));
  return {from:a,to:b};
}

/**
 * Support 2 common hizb.json shapes:
 * 1) Object with keys "1".."60", each has verse_mapping (QUL).
 * 2) Array of 60 objects with {hizb, verse_mapping} or {start,end}.
 */
function getVerseMappingForHizb(n){
  if(!hizbData) return null;

  // Shape 1: { "1": { verse_mapping: {...} }, ... }
  const obj = hizbData[String(n)];
  if(obj && obj.verse_mapping) return obj.verse_mapping;

  // Shape 2: [ {...}, {...} ]
  if(Array.isArray(hizbData)){
    const rec = hizbData.find(x => Number(x.hizb) === n) || hizbData[n-1];
    if(rec && rec.verse_mapping) return rec.verse_mapping;
  }

  return null;
}

function renderHizb(title, blocks){
  el("hTitle").textContent = title;
  const reader = el("reader");
  reader.innerHTML = "";

  for(const block of blocks){
    const h = document.createElement("div");
    h.className = "suraHeader";
    h.textContent = `سورة ${block.surahName} (${block.surahNumber})`;
    reader.appendChild(h);

    for(const ay of block.ayahs){
      const line = document.createElement("div");
      line.className = "ayahLine";
      line.innerHTML = `<span>${ay.text}</span> <span class="ayahNum">﴿${ay.numberInSurah}﴾</span>`;
      reader.appendChild(line);
    }
  }
}

async function openHizb(n){
  selected = n;
  renderGrid();
  setButtons();

  el("hTitle").textContent = `حزب ${n}`;
  el("reader").innerHTML = `<div class="empty">تحميل نص الحزب...</div>`;

  const mapping = getVerseMappingForHizb(n);
  if(!mapping){
    showError(
      `ملف <b>data/hizb.json</b> ما متوافقش مع التطبيق.<br>` +
      `جرب تفتح هذا الرابط باش نتأكد: <b>/data/hizb.json</b> فـ GitHub Pages.<br>` +
      `ولا عطيني سطر/لقطة من بداية JSON (أول 30 سطر) ونصلحو مباشرة.`
    );
    return;
  }

  try{
    const surahNums = Object.keys(mapping).map(k=>parseInt(k,10)).sort((a,b)=>a-b);
    const blocks = [];

    for(const s of surahNums){
      const surah = await fetchSurah(s);
      const {from,to} = parseRange(mapping[String(s)]);
      const ayahs = surah.ayahs.filter(a => a.numberInSurah>=from && a.numberInSurah<=to);

      // alquran.cloud returns Arabic name in "name" and English in "englishName"
      const surahName = surah.name || surah.englishName || `#${s}`;
      blocks.push({surahNumber:s, surahName, ayahs});
    }

    renderHizb(`حزب ${n}`, blocks);
    setStatus(`جاهز. اختر حزباً واقرأ ثم اضغط "تمّ".`);
  }catch(e){
    showError(`وقع مشكل فجلب النص من الإنترنت. جرّب ريفريش.<br><small>${String(e.message || e)}</small>`);
  }
}

function markDone(){
  if(!selected) return;
  done[selected-1] = true;
  saveProgress();
  renderGrid();
  setButtons();
  setStatus(`تمّ تعليم حزب ${selected} كمقروء.`);
}
function undoDone(){
  if(!selected) return;
  done[selected-1] = false;
  saveProgress();
  renderGrid();
  setButtons();
  setStatus(`تمّ إلغاء تعليم حزب ${selected}.`);
}

async function init(){
  loadProgress();
  renderGrid();
  setButtons();

  el("doneBtn").onclick = markDone;
  el("undoBtn").onclick = undoDone;

  setStatus(`تحميل data/hizb.json...`);
  try{
    hizbData = await loadJSON("data/hizb.json");
    setStatus(`تم تحميل تقسيم الأحزاب. اختر حزباً.`);
  }catch(e){
    showError(
      `ما قدرناش نلقاو <b>data/hizb.json</b> على GitHub Pages.<br>` +
      `جرّب تفتح: <b>/data/hizb.json</b> وشوف واش كيعطيك JSON ولا 404.<br>` +
      `<small>${String(e.message || e)}</small>`
    );
    setStatus(`مشكل فـ hizb.json`);
  }
}
window.addEventListener("load", init);
