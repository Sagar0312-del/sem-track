/* =====================================================
   SEM TRACKER — sagar.js (SUPABASE CLOUD VERSION)
   ===================================================== */

(async function () {
  "use strict";

  let currentUser = null;
  let state = { subjects: [], exams: [], dailyLog: {}, activeSubjectId: null };

  const authOverlay = document.getElementById("authOverlay");
  const mainApp = document.getElementById("mainApp");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const authMessage = document.getElementById("authMessage");

  function showLoading(show) {
    if(loadingOverlay) loadingOverlay.style.display = show ? "flex" : "none";
  }

  // ===================== 1. AUTHENTICATION =====================
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      currentUser = session.user;
      authOverlay.style.display = "none";
      mainApp.style.display = "grid";
      const emailDisplay = document.getElementById("userEmailDisplay");
      if(emailDisplay) emailDisplay.textContent = currentUser.email;
      
      await loadDataFromSupabase();
      initUI();
    } else {
      currentUser = null;
      mainApp.style.display = "none";
      authOverlay.style.display = "flex";
    }
  });

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    if(!email || !password) return authMessage.textContent = "Email and Password required!";
    
    authMessage.textContent = "Logging in...";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) authMessage.textContent = error.message;
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    if(!email || !password) return authMessage.textContent = "Email and Password required!";

    authMessage.textContent = "Signing up...";
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) authMessage.textContent = error.message;
    else authMessage.textContent = "Check your email to confirm signup!";
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  document.getElementById("forgotPasswordBtn").addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value;
    if(!email) {
      authMessage.textContent = "Enter your email first.";
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    authMessage.textContent = error ? error.message : "Password reset link sent!";
  });

  // ===================== 2. DATA FETCHING (SUPABASE) =====================
  async function loadDataFromSupabase() {
    showLoading(true);
    state = { subjects: [], exams: [], dailyLog: {}, activeSubjectId: null };

    const [ 
      { data: subjects }, { data: chapters }, { data: topics }, 
      { data: exams }, { data: examTopics }, { data: logs } 
    ] = await Promise.all([
      supabase.from('subjects').select('*').order('created_at', { ascending: true }),
      supabase.from('chapters').select('*').order('order_number', { ascending: true }),
      supabase.from('topics').select('*').order('order_number', { ascending: true }),
      supabase.from('exams').select('*').order('exam_date', { ascending: true }),
      supabase.from('exam_topics').select('*'),
      supabase.from('daily_logs').select('*')
    ]);

    if (subjects) {
      subjects.forEach(sub => {
        const subject = { ...sub, chapters: [] };
        const subChaps = chapters ? chapters.filter(c => c.subject_id === sub.id) : [];
        
        subChaps.forEach(chap => {
          const chapter = { ...chap, topics: topics ? topics.filter(t => t.chapter_id === chap.id) : [] };
          chapter.topics.forEach(t => {
            t.done = t.is_done;
            t.doneDate = t.done_date;
          });
          subject.chapters.push(chapter);
        });
        state.subjects.push(subject);
      });
      if (state.subjects.length > 0) state.activeSubjectId = state.subjects[0].id;
    }

    if (exams) {
      exams.forEach(ex => {
        const linkedTopics = examTopics ? examTopics.filter(et => et.exam_id === ex.id).map(et => et.topic_id) : [];
        state.exams.push({ ...ex, topicIds: linkedTopics, date: ex.exam_date });
      });
    }

    if (logs) {
      logs.forEach(l => {
        state.dailyLog[l.log_date] = l.topics_completed;
      });
    }
    showLoading(false);
  }

  // ===================== 3. NAVIGATION & HELPERS =====================
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const navButtons = document.querySelectorAll(".nav-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const goToSubjects = () => document.querySelector('.nav-btn[data-tab="subjects"]').click();
      const heroStartBtn = document.getElementById("heroStartBtn");
      const finalStartBtn = document.getElementById("finalStartBtn");
      if (heroStartBtn) heroStartBtn.addEventListener("click", goToSubjects);
      if (finalStartBtn) finalStartBtn.addEventListener("click", goToSubjects);
      
      const tab = btn.dataset.tab;
      navButtons.forEach((b) => b.classList.toggle("active", b === btn));
      tabPanels.forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
      if (tab === "dashboard") updateChart();
    });
  });

  function allTopicsOfSubject(subject) { return subject.chapters.flatMap((c) => c.topics); }
  
  function subjectStats(subject) {
    const topics = allTopicsOfSubject(subject);
    const total = topics.length;
    const done = topics.filter((t) => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }
  
  function overallStats() {
    let total = 0, done = 0;
    state.subjects.forEach((s) => {
      const st = subjectStats(s);
      total += st.total; done += st.done;
    });
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }

  function findTopicById(topicId) {
    for (const s of state.subjects) {
      for (const c of s.chapters) {
        const t = c.topics.find((t) => t.id === topicId);
        if (t) return t;
      }
    }
    return null;
  }

  function statusClassFor(pct) {
    if (pct < 40) return "status-low";
    if (pct < 70) return "status-mid";
    return "status-high";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================== 4. DASHBOARD RENDER =====================
  const RING_RADIUS = 52;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  function renderDashboard() {
    const stats = overallStats();

    const ring = document.getElementById("overallRing");
    if(ring) {
      ring.style.strokeDasharray = RING_CIRCUMFERENCE.toFixed(1);
      const offset = RING_CIRCUMFERENCE - (stats.pct / 100) * RING_CIRCUMFERENCE;
      ring.style.strokeDashoffset = offset.toFixed(1);
    }

    const overallPctEl = document.getElementById("overallPercent");
    if(overallPctEl) overallPctEl.textContent = stats.pct + "%";
    const overallFracEl = document.getElementById("overallFraction");
    if(overallFracEl) overallFracEl.textContent = `${stats.done} / ${stats.total} topics`;

    const withTopics = state.subjects.filter((s) => allTopicsOfSubject(s).length > 0);
    const weakLine = document.getElementById("weakSubjectLine");
    if (withTopics.length === 0) {
      if(weakLine) weakLine.textContent = "Sabse peeche: — abhi data nahi hai.";
    } else {
      let weakest = withTopics[0];
      let weakestPct = subjectStats(weakest).pct;
      withTopics.forEach((s) => {
        const p = subjectStats(s).pct;
        if (p < weakestPct) { weakest = s; weakestPct = p; }
      });
      if(weakLine) weakLine.textContent = `Sabse peeche: ${weakest.name} — ${weakestPct}% complete.`;
    }

    const nextLine = document.getElementById("nextExamLine");
    const upcoming = state.exams
      .filter((e) => e.date)
      .map((e) => ({ ...e, daysLeft: daysUntil(e.date) }))
      .filter((e) => e.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    if (upcoming.length === 0) {
      if(nextLine) nextLine.textContent = "Agla exam: — set nahi kiya gaya.";
    } else {
      const e = upcoming[0];
      if(nextLine) nextLine.textContent = `Agla exam: ${e.name} — ${e.daysLeft} din baaki.`;
    }

    const grid = document.getElementById("subjectCardGrid");
    if(grid) {
      grid.innerHTML = "";
      if (state.subjects.length === 0) {
        grid.innerHTML = `<p class="empty-hint">Subjects tab mein jaake syllabus daalo, cards yahan dikhengi.</p>`;
      } else {
        state.subjects.forEach((s) => {
          const st = subjectStats(s);
          const card = document.createElement("div");
          card.className = `subject-card ${statusClassFor(st.pct)}`;
          card.innerHTML = `
            <h3>${escapeHtml(s.name)}</h3>
            <div class="bar-track"><div class="bar-fill" style="width:${st.pct}%"></div></div>
            <div class="card-stat">${st.done} / ${st.total} &middot; ${st.pct}%</div>
          `;
          grid.appendChild(card);
        });
      }
    }

    renderStreakStats();
    renderHeatmap();
    renderSubjectCompareChart();
  }

  function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + "T00:00:00");
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
  }

  // ===================== 5. SUBJECTS RENDER & CRUD =====================
  const subjectListEl = document.getElementById("subjectList");
  const subjectDetailEmpty = document.getElementById("subjectDetailEmpty");
  const subjectDetailContent = document.getElementById("subjectDetailContent");
  const chapterListEl = document.getElementById("chapterList");

  function renderSubjectsTab() {
    if(!subjectListEl) return;
    subjectListEl.innerHTML = "";

    if (state.subjects.length === 0) {
      if(subjectDetailEmpty) subjectDetailEmpty.hidden = false;
      if(subjectDetailContent) subjectDetailContent.hidden = true;
      return;
    }

    state.subjects.forEach((s) => {
      const st = subjectStats(s);
      const li = document.createElement("li");
      li.className = s.id === state.activeSubjectId ? "active" : "";
      li.innerHTML = `
        <span class="li-name">${escapeHtml(s.name)}</span>
        <span class="li-right">
          <span class="li-pct">${st.pct}%</span>
          <button class="li-delete-btn" title="Delete subject">&times;</button>
        </span>
      `;
      li.addEventListener("click", () => {
        state.activeSubjectId = s.id;
        renderSubjectsTab();
      });
      li.querySelector(".li-delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSubject(s.id, s.name);
      });
      subjectListEl.appendChild(li);
    });

    if (!state.activeSubjectId || !state.subjects.find((s) => s.id === state.activeSubjectId)) {
      state.activeSubjectId = state.subjects[0].id;
    }

    const activeSubject = state.subjects.find((s) => s.id === state.activeSubjectId);
    if(subjectDetailEmpty) subjectDetailEmpty.hidden = true;
    if(subjectDetailContent) subjectDetailContent.hidden = false;

    const st = subjectStats(activeSubject);
    document.getElementById("activeSubjectName").textContent = activeSubject.name;
    document.getElementById("activeSubjectBar").style.width = st.pct + "%";
    document.getElementById("activeSubjectStat").textContent = `${st.done} / ${st.total} \u00B7 ${st.pct}%`;

    chapterListEl.innerHTML = "";
    if (activeSubject.chapters.length === 0) {
      chapterListEl.innerHTML = `<p class="empty-hint">Abhi is subject mein koi chapter nahi hai. Upar se add karo.</p>`;
    } else {
      activeSubject.chapters.forEach((chapter) => {
        const total = chapter.topics.length;
        const done = chapter.topics.filter((t) => t.done).length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);

        const block = document.createElement("div");
        block.className = "chapter-block";

        const head = document.createElement("div");
        head.className = "chapter-block-head";
        head.innerHTML = `
          <h4>${escapeHtml(chapter.name)}</h4>
          <span class="chapter-head-right">
            <span class="chapter-pct">${done}/${total} &middot; ${pct}%</span>
            <button class="chapter-delete-btn" title="Delete chapter">&times;</button>
          </span>
        `;
        block.appendChild(head);
        
        head.querySelector(".chapter-delete-btn").addEventListener("click", () => {
          deleteChapter(activeSubject.id, chapter.id, chapter.name);
        });

        chapter.topics.forEach((topic) => {
          const row = document.createElement("div");
          row.className = "topic-row" + (topic.done ? " done" : "");
          const checkboxId = "topic-" + topic.id;
          row.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${topic.done ? "checked" : ""}>
            <label for="${checkboxId}">${escapeHtml(topic.name)}</label>
            <button class="topic-delete-btn" title="Delete topic">&times;</button>
          `;
          const checkbox = row.querySelector("input");
          checkbox.addEventListener("change", () => {
            toggleTopic(topic.id, checkbox.checked);
          });
          row.querySelector(".topic-delete-btn").addEventListener("click", () => {
            deleteTopic(topic.id, topic.name);
          });
          block.appendChild(row);
        });
        chapterListEl.appendChild(block);
      });
    }
  }

  // --- CRUD FUNCTIONS (Now with Supabase) ---

  const addSubjectBtn = document.getElementById("addSubjectBtn");
  if(addSubjectBtn) {
    addSubjectBtn.addEventListener("click", async () => {
      const name = prompt("Subject ka naam likho — e.g. Maths 2");
      if (!name || !name.trim()) return;
      showLoading(true);
      const { data, error } = await supabase.from('subjects').insert([{ name: name.trim(), user_id: currentUser.id }]).select();
      showLoading(false);
      if (error) return alert("Error saving subject: " + error.message);
      
      state.subjects.push({ ...data[0], chapters: [] });
      state.activeSubjectId = data[0].id;
      reRenderAll();
    });
  }

  const addChapterBtn = document.getElementById("addChapterBtn");
  if(addChapterBtn) {
    addChapterBtn.addEventListener("click", async () => {
      const activeSubject = state.subjects.find((s) => s.id === state.activeSubjectId);
      if (!activeSubject) return;

      const chapterNameInput = document.getElementById("chapterNameInput");
      const bulkTopicsInput = document.getElementById("bulkTopicsInput");

      const chapterName = chapterNameInput.value.trim();
      const topicsRaw = bulkTopicsInput.value.trim();

      if (!chapterName) return alert("Chapter ka naam daalo pehle.");
      if (!topicsRaw) return alert("Kam se kam ek topic to daalo, comma se separate karke.");

      const topicNames = topicsRaw.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
      if (topicNames.length === 0) return alert("Valid topics nahi mile.");

      showLoading(true);
      const order_num = activeSubject.chapters.length + 1;
      
      const { data: chapData, error: chapErr } = await supabase.from('chapters')
        .insert([{ name: chapterName, subject_id: activeSubject.id, user_id: currentUser.id, order_number: order_num }]).select();
      
      if (chapErr || !chapData) {
        showLoading(false);
        return alert("Error adding chapter: " + chapErr.message);
      }

      const newChapter = { ...chapData[0], topics: [] };
      const topicInserts = topicNames.map((n, i) => ({
        name: n, chapter_id: newChapter.id, user_id: currentUser.id, order_number: i + 1
      }));

      const { data: topsData, error: topErr } = await supabase.from('topics').insert(topicInserts).select();
      
      showLoading(false);
      if (topErr) return alert("Error adding topics: " + topErr.message);

      newChapter.topics = topsData.map(t => ({ ...t, done: t.is_done, doneDate: t.done_date }));
      activeSubject.chapters.push(newChapter);

      chapterNameInput.value = "";
      bulkTopicsInput.value = "";
      reRenderAll();
    });
  }

  async function deleteSubject(subjectId, name) {
    if (!confirm(`"${name}" subject delete karna hai? Iske sare chapters/topics bhi hat jayenge.`)) return;
    showLoading(true);
    await supabase.from('subjects').delete().eq('id', subjectId);
    state.subjects = state.subjects.filter((s) => s.id !== subjectId);
    if (state.activeSubjectId === subjectId) {
      state.activeSubjectId = state.subjects.length > 0 ? state.subjects[0].id : null;
    }
    showLoading(false);
    reRenderAll();
  }

  async function deleteChapter(subjectId, chapterId, name) {
    if (!confirm(`"${name}" chapter delete karna hai? Iske sare topics bhi hat jayenge.`)) return;
    showLoading(true);
    await supabase.from('chapters').delete().eq('id', chapterId);
    const subject = state.subjects.find((s) => s.id === subjectId);
    if (subject) {
      subject.chapters = subject.chapters.filter((c) => c.id !== chapterId);
    }
    showLoading(false);
    reRenderAll();
  }

  async function deleteTopic(topicId, name) {
    if (!confirm(`"${name}" topic delete karna hai?`)) return;
    showLoading(true);
    await supabase.from('topics').delete().eq('id', topicId);
    for (const s of state.subjects) {
      for (const c of s.chapters) {
        const idx = c.topics.findIndex((t) => t.id === topicId);
        if (idx !== -1) {
          c.topics.splice(idx, 1);
          break;
        }
      }
    }
    showLoading(false);
    reRenderAll();
  }

  async function toggleTopic(topicId, isDone) {
    const topic = findTopicById(topicId);
    if (!topic) return;

    showLoading(true);
    const doneDate = isDone ? todayISO() : null;

    // Update Topic in Supabase
    await supabase.from('topics').update({ is_done: isDone, done_date: doneDate }).eq('id', topicId);
    topic.done = isDone;
    topic.doneDate = doneDate;

    // Update Daily Log Streak in Supabase
    if (isDone) {
      const currentVal = state.dailyLog[doneDate] || 0;
      state.dailyLog[doneDate] = currentVal + 1;
      
      const { data } = await supabase.from('daily_logs').select('topics_completed').eq('log_date', doneDate);
      if (data && data.length > 0) {
        await supabase.from('daily_logs').update({ topics_completed: state.dailyLog[doneDate] }).eq('log_date', doneDate);
      } else {
        await supabase.from('daily_logs').insert([{ log_date: doneDate, topics_completed: 1, user_id: currentUser.id }]);
      }
    } else if (!isDone && topic.doneDate) {
      const oldDate = topic.doneDate;
      if (state.dailyLog[oldDate]) {
        state.dailyLog[oldDate] = Math.max(0, state.dailyLog[oldDate] - 1);
        await supabase.from('daily_logs').update({ topics_completed: state.dailyLog[oldDate] }).eq('log_date', oldDate);
      }
    }

    showLoading(false);
    reRenderAll();
  }

  // ===================== 6. EXAMS RENDER & CRUD =====================
  const examListEl = document.getElementById("examList");

  const addExamBtn = document.getElementById("addExamBtn");
  if(addExamBtn) {
    addExamBtn.addEventListener("click", async () => {
      const nameInput = document.getElementById("examNameInput");
      const dateInput = document.getElementById("examDateInput");
      const name = nameInput.value.trim();
      const date = dateInput.value;

      if (!name) return alert("Exam ka naam daalo — e.g. Mid Sem 1");
      if (!date) return alert("Exam ki date select karo.");

      showLoading(true);
      const { data, error } = await supabase.from('exams').insert([{ name, exam_date: date, user_id: currentUser.id }]).select();
      showLoading(false);

      if (error) return alert("Error adding exam: " + error.message);
      
      state.exams.push({ ...data[0], date: data[0].exam_date, topicIds: [] });
      nameInput.value = "";
      dateInput.value = "";
      reRenderAll();
    });
  }

  function renderExamsTab() {
    if(!examListEl) return;
    examListEl.innerHTML = "";

    if (state.exams.length === 0) {
      examListEl.innerHTML = `<p class="empty-hint">Abhi koi exam set nahi hai.</p>`;
      return;
    }

    const sortedExams = [...state.exams].sort((a, b) => (a.date > b.date ? 1 : -1));

    sortedExams.forEach((exam) => {
      const daysLeft = daysUntil(exam.date);
      const total = exam.topicIds.length;
      const done = exam.topicIds.filter((id) => {
        const t = findTopicById(id);
        return t && t.done;
      }).length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);

      let countdownText, countdownClass;
      if (daysLeft < 0) {
        countdownText = "Ho chuka";
        countdownClass = "status-ok";
      } else if (daysLeft === 0) {
        countdownText = "Aaj hai!";
        countdownClass = "status-danger";
      } else {
        countdownText = `${daysLeft} din baaki`;
        countdownClass = daysLeft <= 3 ? "status-danger" : daysLeft <= 7 ? "status-warn" : "status-ok";
      }

      let readinessText;
      if (total === 0) readinessText = "Abhi syllabus select nahi kiya — neeche se topics choose karo.";
      else if (daysLeft < 0) readinessText = `Syllabus ka ${pct}% cover hua tha.`;
      else {
        const remaining = total - done;
        readinessText = remaining === 0 ? "Poora syllabus complete — well done!" : `${remaining} topics baaki hain, ${daysLeft > 0 ? daysLeft : 0} din mein.`;
      }

      const card = document.createElement("div");
      card.className = "exam-card";
      card.innerHTML = `
        <div class="exam-card-head">
          <h3>${escapeHtml(exam.name)}</h3>
          <span class="exam-countdown ${countdownClass}">${countdownText}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="exam-readiness">${done} / ${total} topics &middot; ${pct}% &mdash; ${readinessText}</div>
        <div class="exam-syllabus-picker" id="picker-${exam.id}"></div>
      `;
      examListEl.appendChild(card);
      renderSyllabusPicker(card.querySelector(`#picker-${exam.id}`), exam);
    });
  }

  function renderSyllabusPicker(container, exam) {
    if (state.subjects.length === 0) {
      container.innerHTML = `<p class="empty-hint">Pehle Subjects tab mein topics add karo, phir yahan syllabus select karo.</p>`;
      return;
    }
    container.innerHTML = "";
    state.subjects.forEach((s) => {
      s.chapters.forEach((c) => {
        c.topics.forEach((topic) => {
          const row = document.createElement("div");
          row.className = "topic-row";
          const checkboxId = `exam-${exam.id}-topic-${topic.id}`;
          const checked = exam.topicIds.includes(topic.id);
          
          row.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${checked ? "checked" : ""}>
            <label for="${checkboxId}">${escapeHtml(s.name)} &rsaquo; ${escapeHtml(c.name)} &rsaquo; ${escapeHtml(topic.name)}</label>
          `;
          
          const checkbox = row.querySelector("input");
          checkbox.addEventListener("change", async () => {
            showLoading(true);
            if (checkbox.checked) {
              await supabase.from('exam_topics').insert([{ exam_id: exam.id, topic_id: topic.id }]);
              if (!exam.topicIds.includes(topic.id)) exam.topicIds.push(topic.id);
            } else {
              await supabase.from('exam_topics').delete().match({ exam_id: exam.id, topic_id: topic.id });
              exam.topicIds = exam.topicIds.filter((id) => id !== topic.id);
            }
            showLoading(false);
            renderExamsTab(); renderDashboard();
          });
          container.appendChild(row);
        });
      });
    });
  }

  // ===================== 7. ANALYTICS & CHARTS =====================
  let chartInstance = null;
  let currentRange = "daily";

  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.toggle("active", b === btn));
      currentRange = btn.dataset.range;
      updateChart();
    });
  });

  function getDailySeries(days) {
    const labels = [], values = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
      values.push(state.dailyLog[iso] || 0);
    }
    return { labels, values };
  }

  function getWeeklySeries(weeks) {
    const labels = [], values = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let w = weeks - 1; w >= 0; w--) {
      let sum = 0;
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 6);
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        sum += state.dailyLog[d.toISOString().slice(0, 10)] || 0;
      }
      labels.push(`${weekStart.getDate()}/${weekStart.getMonth() + 1}`);
      values.push(sum);
    }
    return { labels, values };
  }

  function getMonthlySeries(months) {
    const labels = [], values = [];
    const now = new Date();
    for (let m = months - 1; m >= 0; m--) {
      const target = new Date(now.getFullYear(), now.getMonth() - m, 1);
      let sum = 0;
      Object.keys(state.dailyLog).forEach((iso) => {
        const d = new Date(iso + "T00:00:00");
        if (d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth()) {
          sum += state.dailyLog[iso];
        }
      });
      labels.push(target.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
      values.push(sum);
    }
    return { labels, values };
  }

  function updateChart() {
    const canvas = document.getElementById("progressChart");
    if (!canvas || typeof Chart === "undefined") return;

    let series;
    if (currentRange === "weekly") series = getWeeklySeries(8);
    else if (currentRange === "monthly") series = getMonthlySeries(6);
    else series = getDailySeries(14);

    if (chartInstance) {
      chartInstance.data.labels = series.labels;
      chartInstance.data.datasets[0].data = series.values;
      chartInstance.update();
      return;
    }

    chartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: series.labels,
        datasets: [{ label: "Topics completed", data: series.values, borderColor: "#E3A008", backgroundColor: "rgba(227, 160, 8, 0.15)", tension: 0.3, fill: true, pointRadius: 3 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  function renderStreakStats() {
    let streak = 0;
    let cursor = new Date(); cursor.setHours(0, 0, 0, 0);

    if (!state.dailyLog[cursor.toISOString().slice(0, 10)]) cursor.setDate(cursor.getDate() - 1);

    while (true) {
      const iso = cursor.toISOString().slice(0, 10);
      if (state.dailyLog[iso] && state.dailyLog[iso] > 0) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }

    let activeDays = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if (state.dailyLog[d.toISOString().slice(0, 10)] > 0) activeDays++;
    }

    const streakEl = document.getElementById("streakCount");
    if(streakEl) streakEl.textContent = streak;
    const activeEl = document.getElementById("activeDaysCount");
    if(activeEl) activeEl.textContent = activeDays;
  }

  function renderHeatmap() {
    const container = document.getElementById("heatmap");
    if (!container) return;
    container.innerHTML = "";

    const totalDays = 84, today = new Date(); today.setHours(0, 0, 0, 0);
    const values = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      values.push(state.dailyLog[d.toISOString().slice(0, 10)] || 0);
    }
    const max = Math.max(1, ...values);

    function levelFor(count) {
      if (count === 0) return 0;
      const ratio = count / max;
      if (ratio > 0.75) return 4;
      if (ratio > 0.5) return 3;
      if (ratio > 0.25) return 2;
      return 1;
    }

    for (let w = 0; w < totalDays / 7; w++) {
      const weekCol = document.createElement("div");
      weekCol.className = "heatmap-week";
      for (let d = 0; d < 7; d++) {
        const count = values[w * 7 + d] || 0;
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.dataset.level = levelFor(count);
        cell.title = `${count} topic(s)`;
        weekCol.appendChild(cell);
      }
      container.appendChild(weekCol);
    }
  }

  let compareChartInstance = null;
  function renderSubjectCompareChart() {
    const canvas = document.getElementById("subjectCompareChart");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = state.subjects.map((s) => s.name);
    const values = state.subjects.map((s) => subjectStats(s).pct);

    if (compareChartInstance) {
      compareChartInstance.data.labels = labels;
      compareChartInstance.data.datasets[0].data = values;
      compareChartInstance.update();
      return;
    }
    compareChartInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label: "% complete", data: values, backgroundColor: "#2F6F63", borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } } } }
    });
  }

  function reRenderAll() {
    renderSubjectsTab(); renderExamsTab(); renderDashboard(); updateChart();
  }

  function initUI() { reRenderAll(); }

})();