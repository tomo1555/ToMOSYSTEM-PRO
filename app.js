// 【オフライン・ネットワーク安全ガード (5秒タイムアウト制御)】
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js?v=1.15').catch(function() {
    console.log('ServiceWorker 登録スキップ（オフライン動作）');
  });
}

// 【IndexedDB データベース初期化・管理】
var db = null;
const DB_NAME = "ToMO_System_DB";
const DB_VERSION = 1;
const STORE_NAME = "history_store";

function initDB(callback) {
  if (db) {
    if (callback) callback();
    return;
  }
  var request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = function(event) {
    console.error("IndexedDB 接続エラー", event);
  };
  request.onsuccess = function(event) {
    db = event.target.result;
    if (callback) callback();
  };
  request.onupgradeneeded = function(event) {
    var database = event.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "mode" });
    }
  };
}

function saveToDB(mode, dataList, callback) {
  initDB(function() {
    var transaction = db.transaction([STORE_NAME], "readwrite");
    var store = transaction.objectStore(STORE_NAME);
    store.put({ mode: mode, items: dataList });
    transaction.oncomplete = function() {
      if (callback) callback();
    };
  });
}

function loadFromDB(mode, callback) {
  initDB(function() {
    var transaction = db.transaction([STORE_NAME], "readonly");
    var store = transaction.objectStore(STORE_NAME);
    var request = store.get(mode);
    request.onsuccess = function(event) {
      var result = event.target.result;
      callback(result ? result.items : null);
    };
    request.onerror = function() {
      callback(null);
    };
  });
}

// 【カラーテーマ切り替え＆保存】
function setTheme(themeName, skipVibe) {
  if (!skipVibe) vibe();
  if (themeName === 'cyber') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeName);
  }
  localStorage.setItem('tomo_theme', themeName);
  var selector = document.getElementById('theme-selector');
  if (selector) selector.value = themeName;
}

(function() {
  var savedTheme = localStorage.getItem('tomo_theme') || 'cyber';
  if (savedTheme !== 'cyber') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
})();

var serverOffset = 0, isSynced = false, isLate = true, currentGengo = 'reiwa';
var masterYear = 2026;
var hist = { err: [], calc: [] };
var lastPeriodVal = 8; 

var spinTimer = null;
var spinInterval = null;
var isCalcLocked = true;

// 【バックグラウンド経過時間計測用】
var lastHiddenTime = null;
const AUTO_RESET_TIME_MS = 5 * 60 * 1000; // 5分 (ミリ秒)

window.onload = function(){ 
  var savedTheme = localStorage.getItem('tomo_theme') || 'cyber';
  setTheme(savedTheme, true);

  syncTime();
  setInterval(upd, 1000); 
  initTime();
  
  setTimeout(function() {
    var info = document.getElementById("live-info");
    if (info && info.innerText.includes("起動中")) {
      info.innerText = "オフライン準備完了";
    }
  }, 5000);
  
  var hasKeep = localStorage.getItem("tomo_v195_keep");
  if(hasKeep) {
    loadInputs();
    lastPeriodVal = parseInt(document.getElementById("shared-days").value) || 8;
  } else {
    var n = new Date();
    n.setDate(n.getDate() - 7);
    var targetStr = n.getFullYear() + "-" + pad(n.getMonth()+1) + "-" + pad(n.getDate());
    
    document.getElementById("shared-name").value = "";
    document.getElementById("shared-addr").value = "";
    document.getElementById("shared-note").value = "";
    document.getElementById("shared-start-date").value = targetStr;
    document.getElementById("shared-days").value = "8";
    lastPeriodVal = 8;
    keepInputs();
  }
  
  var initBirth = "1975-02-18";
  document.getElementById("birth-date").value = initBirth;
  syncFromCalendar(initBirth);
  
  // IndexedDBから履歴を読み込んでレンダリング
  initDB(function() {
    loadFromDB("err", function(items) {
      hist.err = items || JSON.parse(localStorage.getItem("tomo_v195_hist_err")) || [];
      render("err");
    });
    loadFromDB("calc", function(items) {
      hist.calc = items || JSON.parse(localStorage.getItem("tomo_v195_hist_calc")) || [];
      render("calc");
    });
  });

  applyCalcLockUI();
  renderAgeChart(); 

  // 起動時のタブ復帰判定（5分以上経過していれば強制的に 'err' にする）
  var activeTab = localStorage.getItem("tomo_active_tab") || "err";
  var lastActiveTimestamp = parseInt(localStorage.getItem("tomo_last_active_time") || Date.now());
  if (Date.now() - lastActiveTimestamp > AUTO_RESET_TIME_MS) {
    activeTab = "err";
  }
  switchTab(activeTab);

  // 画面の表示/非表示（バックグラウンド・スリープ）検知リスナー
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      lastHiddenTime = Date.now();
    } else {
      if (lastHiddenTime && (Date.now() - lastHiddenTime > AUTO_RESET_TIME_MS)) {
        switchTab('err'); // 5分以上経過していたら誤差タブへ強制復帰
      }
      lastHiddenTime = null;
    }
    localStorage.setItem("tomo_last_active_time", Date.now());
  });

  window.addEventListener('mouseup', stopSpin);
  window.addEventListener('touchend', stopSpin);
  window.addEventListener('touchcancel', stopSpin);
};

function initTime(){ 
  var n = new Date(); 
  document.getElementById("e-h").value=pad(n.getHours()); document.getElementById("e-m").value=pad(n.getMinutes()); document.getElementById("e-s").value="00";
  document.getElementById("c-h").value=pad(n.getHours()); document.getElementById("c-m").value=pad(n.getMinutes()); document.getElementById("c-s").value="00";
  document.getElementById("a-h").value="00"; document.getElementById("a-m").value="00"; document.getElementById("a-s").value="00";
  document.getElementById("current-h").value=pad(n.getHours()); document.getElementById("current-m").value=pad(n.getMinutes()); document.getElementById("current-s").value=pad(n.getSeconds());
  
  document.getElementById("e-yy").value=n.getFullYear(); document.getElementById("e-mm").value=pad(n.getMonth()+1); document.getElementById("e-dd").value=pad(n.getDate());
  document.getElementById("c-yy").value=n.getFullYear(); document.getElementById("c-mm").value=pad(n.getMonth()+1); document.getElementById("c-dd").value=pad(n.getDate());
  document.getElementById("a-yy").value=n.getFullYear(); document.getElementById("a-mm").value=pad(n.getMonth()+1); document.getElementById("a-dd").value=pad(n.getDate());
}

function syncTime(){ 
  serverOffset = 0; 
  isSynced = true; 
}

function upd(){ 
  if(!isSynced) return;
  var n = new Date(Date.now() + serverOffset); 
  var weeks = ["日", "月", "火", "水", "木", "金", "土"];
  var wStr = weeks[n.getDay()];
  
  document.getElementById("live-info").innerText = "令和" + (n.getFullYear()-2018) + "年" + (n.getMonth()+1) + "月" + n.getDate() + "日(" + wStr + ") " + pad(n.getHours()) + ":" + pad(n.getMinutes()) + ":" + pad(n.getSeconds());
  
  if(!document.getElementById("toggle-change-std").checked){
    document.getElementById("current-h").value = pad(n.getHours());
    document.getElementById("current-m").value = pad(n.getMinutes());
    document.getElementById("current-s").value = pad(n.getSeconds());
  }
}

function pad(n){ return ("0"+n).slice(-2); }
function vibe(){ if(navigator.vibrate) navigator.vibrate(40); }

function startSpin(id, v, m) {
  if (event && event.cancelable) event.preventDefault();
  stopSpin();
  spin(id, v, m); 
  spinTimer = setTimeout(function() {
    var intervalSpeed = id.endsWith('-s') ? 80 : 120;
    spinInterval = setInterval(function() { spin(id, v, m); }, intervalSpeed);
  }, 450);
}

function stopSpin() {
  if (spinTimer) { clearTimeout(spinTimer); spinTimer = null; }
  if (spinInterval) { clearInterval(spinInterval); spinInterval = null; }
}

function spin(id, v, m){ 
  vibe(); 
  var e = document.getElementById(id);
  var step = v;
  if (id === 'e-s') step = v * 10;
  var c = parseInt(e.value) + step;
  
  if(id.endsWith('yy')){ 
    if(c > 2100) c = 2020; 
    else if(c < 2020) c = 2100; 
    e.value = c; 
    return;
  } 
  if(c>m) c=0; else if(c<0) { c = (id === 'e-s') ? 50 : m; }
  e.value=pad(c); 
}

function startSpinGengo(v) {
  if (event && event.cancelable) event.preventDefault();
  stopSpin();
  spinGengo(v);
  spinTimer = setTimeout(function() {
    spinInterval = setInterval(function() { spinGengo(v); }, 120);
  }, 450);
}

function toggleArea(id){ vibe(); var e = document.getElementById(id); e.style.display = (e.style.display==="block")?"none":"block"; }

function toggleStdTimeStepper(checked) {
  var container = document.getElementById("std-time-stepper-container");
  if(checked) {
    container.style.display = "grid"; 
    document.getElementById("current-s").value = "00";
  } else {
    container.style.display = "none"; 
    var n = new Date(Date.now() + serverOffset);
    document.getElementById("current-h").value = pad(n.getHours());
    document.getElementById("current-m").value = pad(n.getMinutes());
    document.getElementById("current-s").value = pad(n.getSeconds());
  }
}

function toggleCalcLock() { vibe(); isCalcLocked = !isCalcLocked; applyCalcLockUI(); }

function applyCalcLockUI() {
  var btn = document.getElementById("calc-lock-btn");
  var elements = document.querySelectorAll(".stepper.calc-lock");
  var stateBtn = document.getElementById("c-state-toggle");
  var badge = document.getElementById("state-lock-badge");

  if(isCalcLocked) {
    btn.innerText = "🔒";
    btn.className = "lock-btn locked";
    elements.forEach(function(el) { el.classList.add("disabled"); });
    if(stateBtn) stateBtn.disabled = true;
    if(badge) badge.style.display = "inline-block";
  } else {
    btn.innerText = "🔓";
    btn.className = "lock-btn unlocked";
    elements.forEach(function(el) { el.classList.remove("disabled"); });
    if(stateBtn) stateBtn.disabled = false;
    if(badge) badge.style.display = "none";
  }
}

function toggleDateStepper(tab, checked) {
  var area = document.getElementById("date-stepper-area-" + tab);
  if(area) area.style.display = checked ? "grid" : "none";
  if (tab === 'err') {
    document.getElementById("toggle-date-err").checked = checked;
  } else if (tab === 'calc') {
    document.getElementById("toggle-date-calc").checked = checked;
    document.getElementById("calc-err-date-container").style.display = checked ? "grid" : "none";
  }
}

function handlePeriodInput(val) {
  var nextDays = parseInt(val);
  if (isNaN(nextDays) || nextDays < 1) {
    document.getElementById("shared-days").value = 1;
    nextDays = 1;
  }
  var diffDays = nextDays - lastPeriodVal;
  if (diffDays !== 0) {
    var dateInput = document.getElementById("shared-start-date");
    var d = new Date(dateInput.value);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() - diffDays);
      dateInput.value = d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
    }
  }
  lastPeriodVal = nextDays;
}

function syncDaysFromCalendar(sStr){
  var s = new Date(sStr); s.setHours(0,0,0,0);
  var t = new Date(); t.setHours(0,0,0,0);
  var diff = Math.floor((t-s)/(24*3600*1000)) + 1;
  var finalDays = (diff>0) ? diff : 1;
  document.getElementById("shared-days").value = finalDays;
  lastPeriodVal = finalDays;
  keepInputs(); 
}

function scrollToHist(){
  setTimeout(function(){
    document.getElementById("hist-anchor").scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function setLateStatus(status) {
  isLate = status;
  var b = document.getElementById("c-state-toggle");
  if(b){
    b.innerText = isLate ? "遅れ" : "進み";
    b.style.color = isLate ? "var(--accent)" : "var(--ok)";
    b.style.borderColor = isLate ? "var(--accent)" : "var(--ok)";
    b.style.background = isLate ? "rgba(255,75,92,0.1)" : "rgba(0,255,136,0.1)";
  }
}

function toggleState(){ vibe(); if(!isCalcLocked) setLateStatus(!isLate); }

function switchTab(t){ 
  vibe(); 
  localStorage.setItem("tomo_active_tab", t);
  localStorage.setItem("tomo_last_active_time", Date.now());

  document.getElementById("view-err").hidden = (t !== "err"); 
  document.getElementById("view-calc").hidden = (t !== "calc"); 
  document.getElementById("view-tool").hidden = (t !== "tool");
  document.getElementById("view-chart").hidden = (t !== "chart");

  var isToolOrChart = (t === "tool" || t === "chart");
  document.getElementById("common-inputs").hidden = isToolOrChart; 
  document.getElementById("hist-group").hidden = isToolOrChart; 
  
  document.getElementById("hist-area-err").hidden = (t !== "err"); 
  document.getElementById("hist-area-calc").hidden = (t !== "calc"); 

  document.getElementById("t-err").classList.toggle("active", t === "err"); 
  document.getElementById("t-calc").classList.toggle("active", t === "calc"); 
  
  document.getElementById("t-tool").classList.toggle("tool-active", t === "tool");
  document.getElementById("t-chart").classList.toggle("chart-active", t === "chart");

  if(t === 'calc') {
    var n = new Date(Date.now() + serverOffset);
    if(!document.getElementById("toggle-date-calc").checked) {
      document.getElementById("c-yy").value = n.getFullYear();
      document.getElementById("c-mm").value = pad(n.getMonth()+1);
      document.getElementById("c-dd").value = pad(n.getDate());
    }
  }

  if(t === 'chart') {
    setTimeout(function() {
      scrollToAge(18);
    }, 50);
  }
}

function setGengo(g) { 
  vibe(); currentGengo = g;
  ['sw','h','r','s'].forEach(id => document.getElementById('btn-'+id).classList.remove('active')); 
  document.getElementById('btn-'+(g==='showa'?'sw':g==='heisei'?'h':g==='reiwa'?'r':'s')).classList.add('active'); 
  document.getElementById('gengo-label').innerText = {showa:'昭和', heisei:'平成', reiwa:'令和', seireki:'西暦'}[g];
  
  var birthInputVal = document.getElementById("birth-date").value;
  var bDate = birthInputVal ? new Date(birthInputVal) : new Date(1975, 1, 18);
  if (!isNaN(bDate.getTime())) {
    masterYear = bDate.getFullYear();
  }
  refreshGengoYearDisplay(); 
  updateToolFromMaster();
}

function refreshGengoYearDisplay() { 
  var e = document.getElementById("gengo-year"); 
  if(!e) return;
  if(currentGengo==='reiwa') e.value = masterYear - 2018;
  else if(currentGengo==='heisei') e.value = masterYear - 1988; 
  else if(currentGengo==='showa') e.value = masterYear - 1925; 
  else e.value = masterYear;
}

function startSpinGengo(v) { 
  vibe(); 
  masterYear += v; 
  if(masterYear >= 2019 && currentGengo !== 'reiwa' && currentGengo !== 'seireki') currentGengo = 'reiwa';
  else if(masterYear >= 1989 && masterYear < 2019 && currentGengo !== 'heisei' && currentGengo !== 'seireki') currentGengo = 'heisei';
  else if(masterYear >= 1926 && masterYear < 1989 && currentGengo !== 'showa' && currentGengo !== 'seireki') currentGengo = 'showa'; 
  
  ['sw','h','r','s'].forEach(id => document.getElementById('btn-'+id).classList.remove('active'));
  var activeId = (currentGengo==='showa'?'sw':currentGengo==='heisei'?'h':currentGengo==='reiwa'?'r':'s');
  var btn = document.getElementById('btn-'+activeId);
  if(btn) btn.classList.add('active');
  
  var gLabel = document.getElementById('gengo-label');
  if(gLabel) gLabel.innerText = {showa:'昭和', heisei:'平成', reiwa:'令和', seireki:'西暦'}[currentGengo];

  refreshGengoYearDisplay(); 
  
  var birthInputVal = document.getElementById("birth-date").value || "1975-02-18";
  var parts = birthInputVal.split("-");
  var mStr = parts.length > 1 ? parts[1] : "02";
  var dStr = parts.length > 2 ? parts[2] : "18";
  document.getElementById("birth-date").value = masterYear + "-" + mStr + "-" + dStr;
  
  updateToolFromMaster(); 
}

function syncFromGengoInput() { 
  var y = parseInt(document.getElementById("gengo-year").value); 
  if(isNaN(y)) return; 
  masterYear = (currentGengo==='showa')?y+1925:(currentGengo==='heisei')?y+1988:(currentGengo==='reiwa')?y+2018:y; 
  
  var birthInputVal = document.getElementById("birth-date").value || "1975-02-18";
  var parts = birthInputVal.split("-");
  var mStr = parts.length > 1 ? parts[1] : "02";
  var dStr = parts.length > 2 ? parts[2] : "18";
  document.getElementById("birth-date").value = masterYear + "-" + mStr + "-" + dStr;

  updateToolFromMaster(); 
}

function syncFromCalendar(val) { 
  if(!val) return;
  document.getElementById("birth-date").value = val; 
  var d = new Date(val); 
  if(!isNaN(d.getTime())) {
    masterYear = d.getFullYear(); 
    var g = (masterYear>=2019)?'reiwa':(masterYear>=1989)?'heisei':(masterYear>=1926)?'showa':'seireki';
    if(currentGengo !== 'seireki') {
      currentGengo = g;
    }
    setGengo(currentGengo);
  } else {
    updateToolFromMaster();
  }
}

function updateToolFromMaster() { 
  var birthInputVal = document.getElementById("birth-date").value;
  var b = birthInputVal ? new Date(birthInputVal) : new Date(1975, 1, 18);
  
  if(!isNaN(b.getTime())) {
    masterYear = b.getFullYear();
    refreshGengoYearDisplay();
  }

  var today = new Date(2026, 9, 11); 
  var age = today.getFullYear() - b.getFullYear();
  var mDiff = today.getMonth() - b.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < b.getDate())) {
    age--;
  }
  
  document.getElementById("res-age").innerText = age + " 歳"; 
  document.getElementById("res-eto").innerText = ["申","酉","戌","亥","子","丑","寅","卯","辰","巳","午","未"][b.getFullYear()%12] + "年"; 
  
  var base = (b.getMonth()<3 || (b.getMonth()===3 && b.getDate()<=1)) ? b.getFullYear() : b.getFullYear()+1; 
  var h = ""; 
  [{n:"小学校",s:6,e:12},{n:"中学校",s:12,e:15},{n:"高 校",s:15,e:18},{n:"大 学",s:18,e:22}].forEach(x => { 
    h += "<tr><td>"+x.n+"</td><td>"+getGStrCombo(base+x.s)+"</td><td>"+getGStrCombo(base+x.e)+"</td></tr>"; 
  }); 
  document.getElementById("edu-body").innerHTML = h; 
}

function getGStrCombo(y){ 
  var gStr = ""; 
  if(y>=2019) gStr = "令和" + (y-2018) + "年"; 
  else if(y>=1989) gStr = "平成" + (y-1988) + "年"; 
  else if(y>=1926) gStr = "昭和" + (y-1925) + "年"; 
  else gStr = y + "年"; 
  return gStr + " (" + y + ")"; 
}

function renderAgeChart() {
  var target = document.getElementById("age-chart-body");
  if (!target) return;
  var currentYear = 2026; 
  var h = "";
  var etos = ["申","酉","戌","亥","子","丑","寅","卯","辰","巳","午","未"];
  
  for (var age = 0; age <= 100; age++) {
    var birthYear = currentYear - age;
    var gengoStr = "";
    
    if (birthYear >= 2019) { 
      gengoStr = "令和" + (birthYear === 2019 ? "元" : (birthYear - 2018)) + "年"; 
    } else if (birthYear >= 1989) { 
      gengoStr = "平成" + (birthYear === 1989 ? "元" : (birthYear - 1988)) + "年"; 
    } else if (birthYear >= 1926) { 
      gengoStr = "昭和" + (birthYear === 1926 ? "元" : (birthYear - 1925)) + "年"; 
    } else {
      gengoStr = "西暦表記";
    }

    var eto = etos[birthYear % 12] + "年";

    h += '<tr id="yr-' + birthYear + '">' +
         "<td style='font-weight:bold; color:var(--clock); font-size:18px;'>" + age + " 歳</td>" +
         "<td>" + birthYear + "年 (" + gengoStr + ")</td>" +
         "<td style='color:var(--text);'>" + eto + "</td>" +
         "</tr>";
  }
  target.innerHTML = h;
}

function jumpToAgeYear(key) {
  vibe();
  var age = 18;
  if (key === 'h10') age = 28;
  else if (key === 's60') age = 41;
  else if (key === 's50') age = 51;
  else if (key === 's40') age = 61;
  else if (key === 's30') age = 71;
  scrollToAge(age);
}

function scrollToAge(age) {
  var targetYear = 2026 - age;
  var targetEl = document.getElementById("yr-" + targetYear);
  var container = document.getElementById("age-chart-scroll-box");
  
  if (targetEl && container) {
    var thEl = container.querySelector("th");
    var headerHeight = thEl ? thEl.offsetHeight : 38;
    var targetScrollTop = targetEl.offsetTop - headerHeight;
    container.scrollTop = targetScrollTop;
  }
}

function runMeasure(){
  vibe();
  var btn = document.getElementById("main-measure-btn");
  if(btn.disabled) return;
  btn.disabled = true;
  var n = new Date(Date.now()+serverOffset);
  if(document.getElementById("toggle-change-std").checked) {
    n.setHours(
      parseInt(document.getElementById("current-h").value),
      parseInt(document.getElementById("current-m").value),
      parseInt(document.getElementById("current-s").value)
    );
  }
  
  var t = new Date(n);
  var hasDateErr = document.getElementById("toggle-date-err").checked;
  var stdTimeStr = n.getFullYear() + "/" + pad(n.getMonth()+1) + "/" + pad(n.getDate()) + " " + pad(n.getHours()) + ":" + pad(n.getMinutes()) + ":" + pad(n.getSeconds());
  var camTimeStr = "";
  
  var h = parseInt(document.getElementById("e-h").value);
  var m = parseInt(document.getElementById("e-m").value);
  var s = parseInt(document.getElementById("e-s").value);
  var yy = n.getFullYear(), mm = n.getMonth(), dd = n.getDate();
  
  if (hasDateErr) {
    yy = parseInt(document.getElementById("e-yy").value);
    mm = parseInt(document.getElementById("e-mm").value) - 1;
    dd = parseInt(document.getElementById("e-dd").value);
    t = new Date(yy, mm, dd, h, m, s);
    camTimeStr = yy + "/" + pad(mm+1) + "/" + pad(dd) + " " + pad(h) + ":" + pad(m) + ":" + pad(s);
  } else {
    t.setHours(h, m, s);
    camTimeStr = n.getFullYear() + "/" + pad(n.getMonth()+1) + "/" + pad(n.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()) + ":" + pad(t.getSeconds());
  }

  var diff = Math.floor((n-t)/1000); 
  var st = (diff>=0)?"遅れ":"進み"; 
  var a = Math.abs(diff);
  
  var ddDiff = Math.floor(a/(3600*24));
  var hhDiff = Math.floor((a%(3600*24))/3600); 
  var mmDiff = Math.floor((a%3600)/60); 
  var ssDiff = a%60;
  
  var resStr = (ddDiff > 0 ? ddDiff+"日" : "") + hhDiff+"時"+mmDiff+"分"+ssDiff+"秒";
  
  document.getElementById("a-yy").value = yy;
  document.getElementById("a-mm").value = pad(mm + 1);
  document.getElementById("a-dd").value = pad(dd);
  document.getElementById("a-h").value = pad(hhDiff); 
  document.getElementById("a-m").value = pad(mmDiff);
  document.getElementById("a-s").value = pad(ssDiff);
  
  toggleDateStepper('calc', hasDateErr);
  setLateStatus(diff>=0);
  
  saveToHist("err", "err", stdTimeStr, camTimeStr, resStr, st, {yy:yy, mm:mm+1, dd:dd, h:hhDiff, m:mmDiff, s:ssDiff, hasDate:hasDateErr});

  scrollToHist();
  setTimeout(function(){ btn.disabled = false; }, 600);
}

function runCalc(mode){
  vibe(); 
  var hasDateCalc = document.getElementById("toggle-date-calc").checked;
  
  var base = new Date();
  var cyy = parseInt(document.getElementById("c-yy").value);
  var cmm = parseInt(document.getElementById("c-mm").value) - 1;
  var cdd = parseInt(document.getElementById("c-dd").value);
  var ch = parseInt(document.getElementById("c-h").value);
  var cm = parseInt(document.getElementById("c-m").value);
  var cs = parseInt(document.getElementById("c-s").value);
  
  if (hasDateCalc) {
    base = new Date(cyy, cmm, cdd, ch, cm, cs);
  } else {
    base.setHours(ch, cm, cs);
    cyy = base.getFullYear();
    cmm = base.getMonth();
    cdd = base.getDate();
  }

  var offset = 0;
  var ah = parseInt(document.getElementById("a-h").value)||0;
  var am = parseInt(document.getElementById("a-m").value)||0;
  var as = parseInt(document.getElementById("a-s").value)||0;
  
  var ayy = parseInt(document.getElementById("a-yy").value);
  var amm = parseInt(document.getElementById("a-mm").value) - 1;
  var add = parseInt(document.getElementById("a-dd").value);

  if (hasDateCalc) {
    var targetDate = new Date(ayy, amm, add, ah, am, as);
    var baseDateOnly = new Date(cyy, cmm, cdd, ah, am, as);
    var dayDiffSeconds = Math.floor((baseDateOnly - targetDate) / 1000);
    var timeSeconds = (ah * 3600) + (am * 60) + as;
    offset = Math.abs(dayDiffSeconds * 1000) + (timeSeconds * 1000);
  } else {
    offset = ((ah * 3600) + (am * 60) + as) * 1000;
  }
  
  var std, cam;
  if(mode === "std"){ 
    std = new Date(base.getTime() + (isLate ? offset : -offset));
    cam = base; 
  } else { 
    std = base;
    cam = new Date(base.getTime() + (isLate ? -offset : offset));
  }
  
  var stdTimeStr = std.getFullYear() + "/" + pad(std.getMonth()+1) + "/" + pad(std.getDate()) + " " + pad(std.getHours()) + ":" + pad(std.getMinutes()) + ":" + pad(std.getSeconds());
  var camTimeStr = cam.getFullYear() + "/" + pad(cam.getMonth()+1) + "/" + pad(cam.getDate()) + " " + pad(cam.getHours()) + ":" + pad(cam.getMinutes()) + ":" + pad(cam.getSeconds());
  
  var resStr = "";
  if (hasDateCalc) {
    var diffSecTotal = Math.floor(offset / 1000);
    var dD = Math.floor(diffSecTotal / (3600 * 24));
    var hD = Math.floor((diffSecTotal % (3600 * 24)) / 3600);
    var mD = Math.floor((diffSecTotal % 3600) / 60);
    var sD = diffSecTotal % 60;
    resStr = (dD > 0 ? dD + "日" : "") + hD + "時" + mD + "分" + sD + "秒";
  } else {
    resStr = ah + "時" + am + "分" + as + "秒";
  }

  saveToHist("calc", mode, stdTimeStr, camTimeStr, resStr, isLate?"遅れ":"進み", {
    yy: ayy, mm: amm + 1, dd: add, h: ah, m: am, s: as, hasDate: hasDateCalc
  });
  scrollToHist();
}

function saveToHist(m, type, v2Str, v3Str, str, st, raw){
  var d = {
    type: type, 
    name: document.getElementById("shared-name").value || (hist[m].length+1),
    addr: document.getElementById("shared-addr").value, 
    note: document.getElementById("shared-note").value,
    start: document.getElementById("shared-start-date").value, 
    days: document.getElementById("shared-days").value,
    v2: v2Str, 
    v3: v3Str, 
    str: str, 
    st: st, 
    raw: raw, 
    ts: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
  };
  hist[m].unshift(d); 
  save(m); 
  render(m);
}

function render(m){
  var target = document.getElementById("hist-area-"+m); if(!target) return;
  var h = "";
  hist[m].forEach((it, i) => {
    var col = it.st==="遅れ"?"var(--accent)":"var(--ok)";
    var labelTimeName = (m === "calc") ? "補正時刻" : "現在時刻";
    
    h += '<div class="hist-item" style="border-left-color:'+col+'">' +
         '<div class="hist-title-row">' +
           '<span class="edit-val" contenteditable="true" onblur="updHist(\''+m+'\','+i+',\'name\',this.innerText)">'+it.name+'</span>' +
           '<button class="apply-btn" onclick="applyHist(\''+m+'\','+i+')">反映</button>' +
         '</div>' +
         '<div style="background:'+col+'26; border:1px solid '+col+'; color:'+col+'; padding:8px; border-radius:8px; text-align:center; font-size:18px; margin-bottom:10px; font-weight:bold;">誤差: <span style="color:var(--val-text);">'+it.str+'</span> '+it.st+'</div>' +
         '<div class="hist-data-line '+(it.type==='err'||it.type==='std'?'highlight-blue':'')+'"><span class="label-hist">'+labelTimeName+'</span><span>'+it.v2+'</span></div>' +
         '<div class="hist-data-line '+(it.type==='err'||it.type==='cam'?'highlight-yellow':'')+'"><span class="label-hist">カメラ時刻</span><span>'+it.v3+'</span></div>' +
         '<div class="hist-data-line"><span class="label-hist">住所</span><span class="edit-val" contenteditable="true" onblur="updHist(\''+m+'\','+i+',\'addr\',this.innerText)">'+(it.addr||"-")+'</span></div>' +
         '<div class="hist-data-line"><span class="label-hist">備考</span><span class="edit-val" contenteditable="true" onblur="updHist(\''+m+'\','+i+',\'note\',this.innerText)">'+(it.note||"-")+'</span></div>' +
         '<div class="hist-data-line" style="gap:2px;">' +
           '<span class="save-start-label" style="min-width:55px;">保存<br>開始日</span>' +
           '<input type="date" value="'+(it.start||"")+'" class="edit-val" style="border:1px solid var(--input-border); min-width:130px; flex:none; padding:2px;" onchange="recalcPeriod(\''+m+'\','+i+',this.value)">' +
           '<span class="label-hist" style="min-width:60px; margin-left:4px; color:var(--clock); font-size:13px; text-align:right;">保存期間</span>' +
           '<input type="number" value="'+(it.days||"1")+'" class="edit-val" style="color:var(--clock); width:40px; text-align:right; flex:none; font-weight:bold;" oninput="updHist(\''+m+'\','+i+',\'days\',this.value)"><span>日</span>' +
         '</div>' +
         '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;"><button style="background:none; border:1px solid var(--accent); color:var(--accent); padding:4px 12px; border-radius:6px; font-size:13px; font-weight:bold;" onclick="del(\''+m+'\','+i+')">削除</button><span style="color:var(--text); font-size:13px;">'+it.ts+'</span></div></div>';
  });
  target.innerHTML = h + '<div style="margin-top:20px; display:flex; gap:10px;"><button class="side-btn" style="flex:1;" onclick="exportHist(\''+m+'\')">コピー</button><button class="side-btn" style="flex:1; color:var(--accent);" onclick="resetHist(\''+m+'\')">全消去</button></div>';
}

function keepInputs(){ 
  var d = { 
    name: document.getElementById("shared-name").value, 
    addr: document.getElementById("shared-addr").value, 
    note: document.getElementById("shared-note").value, 
    start: document.getElementById("shared-start-date").value, 
    days: document.getElementById("shared-days").value 
  }; 
  localStorage.setItem("tomo_v195_keep", JSON.stringify(d)); 
}

function loadInputs(){ 
  var d = JSON.parse(localStorage.getItem("tomo_v195_keep")); 
  if(!d) return; 
  document.getElementById("shared-name").value = d.name||""; 
  document.getElementById("shared-addr").value = d.addr||""; 
  document.getElementById("shared-note").value = d.note||""; 
  document.getElementById("shared-start-date").value = d.start||""; 
  document.getElementById("shared-days").value = d.days||"8"; 
}

function recalcPeriod(m, i, sStr){ 
  var s = new Date(sStr); s.setHours(0,0,0,0); 
  var logDate = new Date(hist[m][i].ts.split(' ')[0]); logDate.setHours(0,0,0,0);
  var diff = Math.floor((logDate-s)/(24*3600*1000)) + 1; 
  hist[m][i].start = sStr; 
  hist[m][i].days = (diff>0)?diff:1; 
  save(m); 
  render(m); 
}

function updHist(m,i,k,v){ 
  if(hist[m][i]){ 
    hist[m][i][k]=v; 
    save(m); 
  } 
}

function save(m){ 
  localStorage.setItem("tomo_v195_hist_" + m, JSON.stringify(hist[m]));
  saveToDB(m, hist[m]);
}

function del(m,i){ 
  if(confirm("消去？")){ 
    hist[m].splice(i,1); 
    save(m); 
    render(m); 
  } 
}

function resetHist(m){ 
  if(confirm("全消去？")){ 
    hist[m]=[]; 
    save(m); 
    render(m); 
  } 
}

function applyHist(m, i){ 
  vibe();
  var it = hist[m][i]; 
  document.getElementById("shared-name").value = it.name; 
  document.getElementById("shared-start-date").value = it.start;
  
  var targetDays = parseInt(it.days) || 1;
  document.getElementById("shared-days").value = targetDays;
  lastPeriodVal = targetDays;
  
  document.getElementById("shared-addr").value = it.addr || "";
  document.getElementById("shared-note").value = it.note || "";
  keepInputs();
  
  if(it.raw) {
    setLateStatus(it.st === "遅れ");
    document.getElementById("a-h").value = pad(it.raw.h || 0);
    document.getElementById("a-m").value = pad(it.raw.m || 0);
    document.getElementById("a-s").value = pad(it.raw.s || 0);

    var hasDate = !!it.raw.hasDate;
    toggleDateStepper('calc', hasDate);
    if(hasDate) {
      document.getElementById("a-yy").value = it.raw.yy || 2026;
      document.getElementById("a-mm").value = pad(it.raw.mm || 1);
      document.getElementById("a-dd").value = pad(it.raw.dd || 1);

      if(it.v3 && it.v3 !== "-") {
        var parts = it.v3.split(" ");
        if(parts[0]) {
          var dParts = parts[0].split("/");
          if(dParts.length === 3) {
            document.getElementById("c-yy").value = dParts[0];
            document.getElementById("c-mm").value = pad(dParts[1]);
            document.getElementById("c-dd").value = pad(dParts[2]);
          }
        }
      }
    }

    if(it.v3 && it.v3 !== "-") {
      var parts = it.v3.split(" ");
      var timePart = parts[1] || parts[0]; 
      if(timePart) {
        var tParts = timePart.split(":");
        if(tParts.length === 3) {
          document.getElementById("c-h").value = pad(tParts[0]);
          document.getElementById("c-m").value = pad(tParts[1]);
          document.getElementById("c-s").value = pad(tParts[2]);
        }
      }
    }
  }
  
  isCalcLocked = true;
  applyCalcLockUI();
  switchTab('calc'); 

  setTimeout(function() {
    var targetInput = document.getElementById("shared-name");
    if (targetInput) {
      targetInput.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
  }, 300);
}

function exportHist(m){ 
  vibe(); 
  var t="【履歴】\n"; 
  hist[m].forEach(it=>t+="\n#"+it.name+"\n誤差:"+it.str+" "+it.st+"\ncenter:"+it.v2+"\nカメラ:"+it.v3+"\n---"); 
  var a=document.createElement("textarea"); 
  a.value=t; 
  document.body.appendChild(a); 
  a.select(); 
  document.execCommand("copy"); 
  document.body.removeChild(a); 
  alert("コピーしました"); 
}
