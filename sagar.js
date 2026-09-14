/* =====================================================
   SEM TRACKER — sagar.js
   Sab logic ek hi file mein: subjects, topics, exams,
   progress calculation, localStorage, aur graph.
   ===================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "semTrackerData";

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Could not load saved data, starting fresh.", e);
    }
    return { subjects: [], exams: [], dailyLog: {}, activeSubjectId: null };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  const navButtons = document.querySelectorAll(".nav-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      navButtons.forEach((b) => b.classList.toggle("active", b === btn));
      tabPanels.forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
      if (tab === "dashboard") updateChart();
    });
  });

  function allTopicsOfSubject(subject) {
    return subject.chapters.flatMap((c) => c.topics);
  }

  function subjectStats(subject) {
    const topics = allTopicsOfSubject(subject);
    const total = topics.length;
    const done = topics.filter((t) => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }

  function overallStats() {
    let total = 0;
    let done = 0;
    state.subjects.forEach((s) => {
      const st = subjectStats(s);
      total += st.total;
      done += st.done;
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

  const RING_RADIUS = 52;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  function renderDashboard() {
    const stats = overallStats();

    const ring = document.getElementById("overallRing");
    ring.style.strokeDasharray = RING_CIRCUMFERENCE.toFixed(1);
    const offset = RING_CIRCUMFERENCE - (stats.pct / 100) * RING_CIRCUMFERENCE;
    ring.style.strokeDashoffset = offset.toFixed(1);

    document.getElementById("overallPercent").textContent = stats.pct + "%";
    document.getElementById("overallFraction").textContent = `${stats.done} / ${stats.total} topics`;

    const withTopics = state.subjects.filter((s) => allTopicsOfSubject(s).length > 0);
    const weakLine = document.getElementById("weakSubjectLine");
    if (withTopics.length === 0) {
      weakLine.textContent = "Sabse peeche: — abhi data nahi hai.";
    } else {
      let weakest = withTopics[0];
      let weakestPct = subjectStats(weakest).pct;
      withTopics.forEach((s) => {
        const p = subjectStats(s).pct;
        if (p < weakestPct) {
          weakest = s;
          weakestPct = p;
        }
      });
      weakLine.textContent = `Sabse peeche: ${weakest.name} — ${weakestPct}% complete.`;
    }

    const nextLine = document.getElementById("nextExamLine");
    const upcoming = state.exams
      .filter((e) => e.date)
      .map((e) => ({ ...e, daysLeft: daysUntil(e.date) }))
      .filter((e) => e.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    if (upcoming.length === 0) {
      nextLine.textContent = "Agla exam: — set nahi kiya gaya.";
    } else {
      const e = upcoming[0];
      nextLine.textContent = `Agla exam: ${e.name} — ${e.daysLeft} din baaki.`;
    }

    const grid = document.getElementById("subjectCardGrid");
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

    renderStreakStats();
    renderHeatmap();
    renderSubjectCompareChart();
  }

  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + "T00:00:00");
    const diffMs = target - today;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const subjectListEl = document.getElementById("subjectList");
  const subjectDetailEmpty = document.getElementById("subjectDetailEmpty");
  const subjectDetailContent = document.getElementById("subjectDetailContent");
  const activeSubjectName = document.getElementById("activeSubjectName");
  const activeSubjectBar = document.getElementById("activeSubjectBar");
  const activeSubjectStat = document.getElementById("activeSubjectStat");
  const chapterListEl = document.getElementById("chapterList");

  function renderSubjectsTab() {
    subjectListEl.innerHTML = "";

    if (state.subjects.length === 0) {
      subjectDetailEmpty.hidden = false;
      subjectDetailContent.hidden = true;
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
        saveState();
        renderSubjectsTab();
      });
      li.querySelector(".li-delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`"${s.name}" subject delete karna hai? Iske sare chapters/topics bhi hat jayenge.`)) {
          deleteSubject(s.id);
        }
      });
      subjectListEl.appendChild(li);
    });

    if (!state.activeSubjectId || !state.subjects.find((s) => s.id === state.activeSubjectId)) {
      state.activeSubjectId = state.subjects[0].id;
      saveState();
    }

    const activeSubject = state.subjects.find((s) => s.id === state.activeSubjectId);

    subjectDetailEmpty.hidden = true;
    subjectDetailContent.hidden = false;

    const st = subjectStats(activeSubject);
    activeSubjectName.textContent = activeSubject.name;
    activeSubjectBar.style.width = st.pct + "%";
    activeSubjectStat.textContent = `${st.done} / ${st.total} \u00B7 ${st.pct}%`;

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
          if (confirm(`"${chapter.name}" chapter delete karna hai? Iske sare topics bhi hat jayenge.`)) {
            deleteChapter(activeSubject.id, chapter.id);
          }
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
            if (confirm(`"${topic.name}" topic delete karna hai?`)) {
              deleteTopic(topic.id);
            }
          });
          block.appendChild(row);
        });

        chapterListEl.appendChild(block);
      });
    }
  }

  function toggleTopic(topicId, isDone) {
    const topic = findTopicById(topicId);
    if (!topic) return;

    if (isDone && !topic.done) {
      topic.done = true;
      topic.doneDate = todayISO();
      state.dailyLog[topic.doneDate] = (state.dailyLog[topic.doneDate] || 0) + 1;
    } else if (!isDone && topic.done) {
      if (topic.doneDate && state.dailyLog[topic.doneDate]) {
        state.dailyLog[topic.doneDate] = Math.max(0, state.dailyLog[topic.doneDate] - 1);
      }
      topic.done = false;
      topic.doneDate = null;
    }

    saveState();
    renderSubjectsTab();
    renderDashboard();
    renderExamsTab();
    updateChart();
  }

  document.getElementById("addSubjectBtn").addEventListener("click", () => {
    const name = prompt("Subject ka naam likho — e.g. Maths 2");
    if (!name || !name.trim()) return;
    const subject = { id: uid("sub"), name: name.trim(), chapters: [] };
    state.subjects.push(subject);
    state.activeSubjectId = subject.id;
    saveState();
    renderSubjectsTab();
    renderDashboard();
    renderExamsTab();
  });

  document.getElementById("addChapterBtn").addEventListener("click", () => {
    const activeSubject = state.subjects.find((s) => s.id === state.activeSubjectId);
    if (!activeSubject) return;

    const chapterNameInput = document.getElementById("chapterNameInput");
    const bulkTopicsInput = document.getElementById("bulkTopicsInput");

    const chapterName = chapterNameInput.value.trim();
    const topicsRaw = bulkTopicsInput.value.trim();

    if (!chapterName) {
      alert("Chapter ka naam daalo pehle.");
      return;
    }
    if (!topicsRaw) {
      alert("Kam se kam ek topic to daalo, comma se separate karke.");
      return;
    }

    const topicNames = topicsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (topicNames.length === 0) {
      alert("Valid topics nahi mile. Comma se separate karke likho.");
      return;
    }

    const chapter = {
      id: uid("chap"),
      name: chapterName,
      topics: topicNames.map((name) => ({
        id: uid("top"),
        name,
        done: false,
        doneDate: null,
      })),
    };

    activeSubject.chapters.push(chapter);
    saveState();

    chapterNameInput.value = "";
    bulkTopicsInput.value = "";

    renderSubjectsTab();
    renderDashboard();
    renderExamsTab();
  });

  function deleteSubject(subjectId) {
    const subject = state.subjects.find((s) => s.id === subjectId);
    if (!subject) return;

    const topicIdsToRemove = allTopicsOfSubject(subject).map((t) => t.id);

    state.subjects = state.subjects.filter((s) => s.id !== subjectId);

    state.exams.forEach((exam) => {
      exam.topicIds = exam.topicIds.filter((id) => !topicIdsToRemove.includes(id));
    });

    if (state.activeSubjectId === subjectId) {
      state.activeSubjectId = state.subjects.length > 0 ? state.subjects[0].id : null;
    }

    saveState();
    renderSubjectsTab();
    renderDashboard();
    renderExamsTab();
  }

  function deleteChapter(subjectId, chapterId) {
    const subject = state.subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    const chapter = subject.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;

    const topicIdsToRemove = chapter.topics.map((t) => t.id);
    subject.chapters = subject.chapters.filter((c) => c.id !== chapterId);

    state.exams.forEach((exam) => {
      exam.topicIds = exam.topicIds.filter((id) => !topicIdsToRemove.includes(id));
    });

    saveState();
    renderSubjectsTab();
    renderDashboard();
    renderExamsTab();
  }

  function deleteTopic(topicId) {
    for (const s of state.subjects) {
      for (const c of s.chapters) {
        const idx = c.topics.findIndex((t) => t.id === topicId);
        if (idx !== -1) {
          const topic = c.topics[idx];
          if (topic.done && topic.doneDate && state.dailyLog[topic.doneDate]) {
            state.dailyLog[topic.doneDate] = Math.max(0, state.dailyLog[topic.doneDate] - 1);
          }
          c.topics.splice(idx, 1);

          state.exams.forEach((exam) => {
            exam.topicIds = exam.topicIds.filter((id) => id !== topicId);
          });

          saveState();
          renderSubjectsTab();
          renderDashboard();
          renderExamsTab();
          updateChart();
          return;
        }
      }
    }
  }

  const examListEl = document.getElementById("examList");

  document.getElementById("addExamBtn").addEventListener("click", () => {
    const nameInput = document.getElementById("examNameInput");
    const dateInput = document.getElementById("examDateInput");

    const name = nameInput.value.trim();
    const date = dateInput.value;

    if (!name) {
      alert("Exam ka naam daalo — e.g. Mid Sem 1");
      return;
    }
    if (!date) {
      alert("Exam ki date select karo.");
      return;
    }

    state.exams.push({ id: uid("exam"), name, date, topicIds: [] });
    saveState();

    nameInput.value = "";
    dateInput.value = "";

    renderExamsTab();
    renderDashboard();
  });

  function renderExamsTab() {
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
      if (total === 0) {
        readinessText = "Abhi syllabus select nahi kiya — neeche se topics choose karo.";
      } else if (daysLeft < 0) {
        readinessText = `Syllabus ka ${pct}% cover hua tha.`;
      } else {
        const remaining = total - done;
        readinessText =
          remaining === 0
            ? "Poora syllabus complete — well done!"
            : `${remaining} topics baaki hain, ${daysLeft > 0 ? daysLeft : 0} din mein.`;
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

      const picker = card.querySelector(`#picker-${exam.id}`);
      renderSyllabusPicker(picker, exam);
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
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              if (!exam.topicIds.includes(topic.id)) exam.topicIds.push(topic.id);
            } else {
              exam.topicIds = exam.topicIds.filter((id) => id !== topic.id);
            }
            saveState();
            renderExamsTab();
            renderDashboard();
          });
          container.appendChild(row);
        });
      });
    });
  }

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
    const labels = [];
    const values = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
      values.push(state.dailyLog[iso] || 0);
    }
    return { labels, values };
  }

  function getWeeklySeries(weeks) {
    const labels = [];
    const values = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let w = weeks - 1; w >= 0; w--) {
      let sum = 0;
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        sum += state.dailyLog[iso] || 0;
      }
      labels.push(`${weekStart.getDate()}/${weekStart.getMonth() + 1}`);
      values.push(sum);
    }
    return { labels, values };
  }

  function getMonthlySeries(months) {
    const labels = [];
    const values = [];
    const now = new Date();
    for (let m = months - 1; m >= 0; m--) {
      const target = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const year = target.getFullYear();
      const month = target.getMonth();
      let sum = 0;
      Object.keys(state.dailyLog).forEach((iso) => {
        const d = new Date(iso + "T00:00:00");
        if (d.getFullYear() === year && d.getMonth() === month) {
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
        datasets: [
          {
            label: "Topics completed",
            data: series.values,
            borderColor: "#E3A008",
            backgroundColor: "rgba(227, 160, 8, 0.15)",
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  function renderStreakStats() {
    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    if (!state.dailyLog[cursor.toISOString().slice(0, 10)]) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (true) {
      const iso = cursor.toISOString().slice(0, 10);
      if (state.dailyLog[iso] && state.dailyLog[iso] > 0) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    let activeDays = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      if (state.dailyLog[iso] && state.dailyLog[iso] > 0) activeDays++;
    }

    document.getElementById("streakCount").textContent = streak;
    document.getElementById("activeDaysCount").textContent = activeDays;
  }

  function renderHeatmap() {
    const container = document.getElementById("heatmap");
    if (!container) return;
    container.innerHTML = "";

    const totalDays = 84;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const values = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      values.push(state.dailyLog[iso] || 0);
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
        const idx = w * 7 + d;
        const count = values[idx] || 0;
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
      data: {
        labels,
        datasets: [
          {
            label: "% complete",
            data: values,
            backgroundColor: "#2F6F63",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } },
        },
      },
    });
  }

  function init() {
    renderDashboard();
    renderSubjectsTab();
    renderExamsTab();
    updateChart();
  }

  init();
})();