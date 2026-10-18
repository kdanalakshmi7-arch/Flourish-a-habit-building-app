
"use strict";

/* =========================================
   FLOURISH — APPLICATION FOUNDATION
   ========================================= */

const STORAGE_KEY = "flourish-app-v1";

const DEFAULT_DATA = {
  version: 1,
  onboardingComplete: false,

  profile: {
    name: "Friend",
    avatar: "🌷"
  },

  settings: {
    theme: "light",
    sound: true
  },

  habits: [],
  completions: [],
  journalEntries: [],
  achievements: [],
  garden: {
    energy: 0,
    plants: [],
    decorations: []
  },

  rewards: {
    xp: 0,
    petals: 0,
    ledger: []
  }
};

let appData = loadData();
let selectedMood = "Happy";
let toastTimeout;
let audioContext = null;

/* -----------------------------------------
   STORAGE AND DATA SAFETY
   ----------------------------------------- */

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return cloneData(DEFAULT_DATA);
    }

    const parsed = JSON.parse(saved);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Saved data is invalid.");
    }

    const data = {
      ...cloneData(DEFAULT_DATA),
      ...parsed,
      version: 1,

      profile: {
        ...DEFAULT_DATA.profile,
        ...(parsed.profile || {})
      },

      settings: {
        ...DEFAULT_DATA.settings,
        ...(parsed.settings || {})
      },

      garden: {
        ...DEFAULT_DATA.garden,
        ...(parsed.garden || {})
      },

      rewards: {
        ...DEFAULT_DATA.rewards,
        ...(parsed.rewards || {})
      },

      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      completions: Array.isArray(parsed.completions)
        ? parsed.completions : [],
      journalEntries: Array.isArray(parsed.journalEntries)
        ? parsed.journalEntries : [],
      achievements: Array.isArray(parsed.achievements)
        ? parsed.achievements : []
    };

    if (!Array.isArray(data.garden.plants)) {
      data.garden.plants = [];
    }

    if (!Array.isArray(data.garden.decorations)) {
      data.garden.decorations = [];
    }

    if (!Array.isArray(data.rewards.ledger)) {
      data.rewards.ledger = [];
    }

    return data;
  } catch (error) {
    console.error("Flourish could not load saved data:", error);

    // Do not overwrite potentially recoverable data.
    // The user can still see the welcome screen and receive an error.
    return cloneData(DEFAULT_DATA);
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch (error) {
    console.error("Flourish could not save data:", error);
    showToast("Couldn't save your changes. Check your browser storage.");
    return false;
  }
}

function makeId() {
  if (typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "flourish-" + Date.now() + "-" +
    Math.random().toString(36).slice(2);
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* -----------------------------------------
   TOAST AND SOUND
   ----------------------------------------- */

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2600);
}

function playSound(type = "click") {
  if (!appData.settings.sound) return;

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const notes = type === "celebrate"
      ? [523.25, 659.25, 783.99]
      : type === "complete"
        ? [587.33, 783.99]
        : [660];

    notes.forEach((frequency, index) => {
      const start = audioContext.currentTime + index * 0.09;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } catch (error) {
    console.warn("Sound is unavailable in this browser.", error);
  }
}

/* -----------------------------------------
   ONBOARDING
   ----------------------------------------- */

function setupWelcome() {
  const welcomeScreen = document.getElementById("welcomeScreen");
  const mainApp = document.getElementById("mainApp");
  const form = document.getElementById("welcomeForm");

  if (appData.onboardingComplete) {
    welcomeScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");
    applySettings();
    renderApp();
    return;
  }

  welcomeScreen.classList.remove("hidden");
  mainApp.classList.add("hidden");

  form.addEventListener("submit", event => {
    event.preventDefault();

    const name = document.getElementById("displayName")
      .value.trim();

    const habitName = document.getElementById("firstHabit")
      .value.trim();

    if (!habitName) {
      showToast("Add one little habit to get started 🌱");
      return;
    }

    const firstHabit = createHabitObject(habitName, "Wellness", "daily");

    appData.profile.name = name || "Friend";
    appData.habits.push(firstHabit);
    appData.onboardingComplete = true;

    if (!saveData()) {
      appData.habits = appData.habits.filter(
        habit => habit.id !== firstHabit.id
      );
      appData.onboardingComplete = false;
      return;
    }

    welcomeScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");

    applySettings();
    renderApp();
    showToast("Welcome to Flourish! Let's grow together 🌷");
    playSound("celebrate");
  });
}

/* -----------------------------------------
   NAVIGATION
   ----------------------------------------- */

function navigate(viewName) {
  const validViews = [
    "home",
    "garden",
    "habits",
    "rewards",
    "journal",
    "insights",
    "settings"
  ];

  if (!validViews.includes(viewName)) return;

  document.querySelectorAll(".page-view").forEach(section => {
    section.classList.toggle(
      "hidden",
      section.id !== `view-${viewName}`
    );
  });

  document.querySelectorAll("[data-view]").forEach(button => {
    if (button.classList.contains("nav-item")) {
      button.classList.toggle(
        "active",
        button.dataset.view === viewName
      );
    }
  });

  if (viewName === "journal") renderJournal();
  if (viewName === "insights") renderInsights();
  if (viewName === "garden") renderGarden();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupNavigation() {
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      navigate(button.dataset.view);
    });
  });
}

/* -----------------------------------------
   HABITS
   ----------------------------------------- */

function createHabitObject(name, category, schedule) {
  const emojis = {
    Wellness: "🌸",
    Learning: "📚",
    Fitness: "🏃",
    Mindfulness: "🧘",
    Productivity: "✨"
  };

  return {
    id: makeId(),
    name,
    category,
    schedule,
    emoji: emojis[category] || "🌱",
    createdAt: new Date().toISOString(),
    archived: false
  };
}

function isScheduledToday(habit) {
  const day = new Date().getDay();

  if (habit.schedule === "weekdays") {
    return day >= 1 && day <= 5;
  }

  if (habit.schedule === "weekends") {
    return day === 0 || day === 6;
  }

  return true;
}

function getActiveHabits() {
  return appData.habits.filter(habit => !habit.archived);
}

function getTodayHabits() {
  return getActiveHabits().filter(isScheduledToday);
}

function getCompletion(habitId) {
  return appData.completions.find(item =>
    item.habitId === habitId &&
    item.date === todayKey()
  );
}

function addHabit(name, category, schedule) {
  const cleanName = name.trim();

  if (!cleanName) {
    showToast("Give your habit a name first 🌱");
    return false;
  }

  const habit = createHabitObject(cleanName, category, schedule);

  appData.habits.push(habit);

  if (!saveData()) {
    appData.habits = appData.habits.filter(
      item => item.id !== habit.id
    );
    return false;
  }

  renderApp();
  showToast("A new little habit has joined your journey 🌷");
  return true;
}

function setupHabitDialog() {
  const dialog = document.getElementById("habitDialog");
  const form = document.getElementById("habitForm");

  document.getElementById("addHabitButton").addEventListener("click", () => {
    form.reset();
    dialog.showModal();
  });

  document.getElementById("addHabitHome").addEventListener("click", () => {
    navigate("habits");
    form.reset();
    dialog.showModal();
  });

  document.getElementById("cancelHabit").addEventListener("click", () => {
    dialog.close();
  });

  form.addEventListener("submit", event => {
    event.preventDefault();

    const name = document.getElementById("habitName").value;
    const category = document.getElementById("habitCategory").value;
    const schedule = document.getElementById("habitSchedule").value;

    if (addHabit(name, category, schedule)) {
      dialog.close();
      form.reset();
    }
  });
}

function toggleHabit(habitId) {
  const habit = appData.habits.find(item =>
    item.id === habitId && !item.archived
  );

  if (!habit || !isScheduledToday(habit)) return;

  const existing = getCompletion(habitId);

  if (existing) {
    showToast("This habit is already complete for today 💗");
    return;
  }

  const completion = {
    id: makeId(),
    habitId,
    date: todayKey(),
    completedAt: new Date().toISOString()
  };

  const ledgerEntry = {
    id: makeId(),
    eventKey: `completion:${habitId}:${todayKey()}`,
    type: "habit-completion",
    habitId,
    date: todayKey(),
    xp: 10,
    petals: 1,
    createdAt: new Date().toISOString()
  };

  // Guard against duplicate reward events.
  if (appData.rewards.ledger.some(item =>
    item.eventKey === ledgerEntry.eventKey
  )) {
    showToast("This habit has already earned today's reward.");
    return;
  }

  appData.completions.push(completion);
  appData.rewards.ledger.push(ledgerEntry);
  appData.rewards.xp += ledgerEntry.xp;
  appData.rewards.petals += ledgerEntry.petals;
  appData.garden.energy += 1;

  const plant = {
    id: makeId(),
    habitId,
    stage: 1,
    createdAt: new Date().toISOString()
  };

  appData.garden.plants.push(plant);

  const newlyEarned = checkAchievements();

  if (!saveData()) {
    // Restore the previous in-memory state if saving failed.
    appData.completions = appData.completions.filter(
      item => item.id !== completion.id
    );
    appData.rewards.ledger = appData.rewards.ledger.filter(
      item => item.id !== ledgerEntry.id
    );
    appData.rewards.xp -= ledgerEntry.xp;
    appData.rewards.petals -= ledgerEntry.petals;
    appData.garden.energy -= 1;
    appData.garden.plants = appData.garden.plants.filter(
      item => item.id !== plant.id
    );

    appData.achievements = appData.achievements.filter(
      item => !newlyEarned.includes(item.id)
    );

    return;
  }

  renderApp();
  showToast("Habit complete! You earned 10 XP and a petal 🌸");
  playSound("complete");

  if (getTodayHabits().every(item => getCompletion(item.id))) {
    showToast("You completed all today's habits! Amazing work ✨");
    playSound("celebrate");
  }
}

function renderHabitItem(habit) {
  const completion = getCompletion(habit.id);
  const completed = Boolean(completion);

  return `
    <div class="habit-item ${completed ? "completed" : ""}">
      <button
        class="habit-check"
        data-complete="${escapeHTML(habit.id)}"
        aria-label="${completed ? "Completed" : "Complete"} ${escapeHTML(habit.name)}"
        aria-pressed="${completed}"
        ${completed ? "disabled" : ""}
      >${completed ? "✓" : ""}</button>

      <span class="habit-emoji">${escapeHTML(habit.emoji || "🌱")}</span>

      <div class="habit-details">
        <strong>${escapeHTML(habit.name)}</strong>
        <small>${escapeHTML(habit.category || "Personal")} ·
          ${completed ? "Done for today ✨" : "One little step"}</small>
      </div>

      <button class="icon-button"
        data-archive="${escapeHTML(habit.id)}"
        aria-label="Archive ${escapeHTML(habit.name)}">⋯</button>
    </div>
  `;
}

function renderHabits() {
  const todayHabits = getTodayHabits();
  const activeHabits = getActiveHabits();

  document.getElementById("todayHabits").innerHTML =
    todayHabits.length
      ? todayHabits.map(renderHabitItem).join("")
      : `<div class="empty-state">
          🌷 No habits scheduled today. Add a little habit when you're ready!
        </div>`;

  document.getElementById("allHabits").innerHTML =
    activeHabits.length
      ? activeHabits.map(habit => {
          const scheduled = isScheduledToday(habit);

          if (!scheduled) {
            return `
              <div class="habit-item">
                <span class="habit-emoji">${escapeHTML(habit.emoji || "🌱")}</span>
                <div class="habit-details">
                  <strong>${escapeHTML(habit.name)}</strong>
                  <small>${escapeHTML(habit.category)} · Not scheduled today</small>
                </div>
                <button class="icon-button"
                  data-archive="${escapeHTML(habit.id)}"
                  aria-label="Archive ${escapeHTML(habit.name)}">⋯</button>
              </div>
            `;
          }

          return renderHabitItem(habit);
        }).join("")
      : `<div class="empty-state">
          🌱 Your habit garden is waiting. Add your first habit!
        </div>`;

  document.querySelectorAll("[data-complete]").forEach(button => {
    button.addEventListener("click", () => {
      toggleHabit(button.dataset.complete);
    });
  });

  document.querySelectorAll("[data-archive]").forEach(button => {
    button.addEventListener("click", () => {
      archiveHabit(button.dataset.archive);
    });
  });

  const total = todayHabits.length;
  const completed = todayHabits.filter(habit =>
    getCompletion(habit.id)
  ).length;

  const percentage = total
    ? Math.round(completed / total * 100)
    : 0;

  document.getElementById("progressText").textContent =
    `${percentage}%`;

  document.getElementById("progressBar").style.width =
    `${percentage}%`;
}

function archiveHabit(habitId) {
  const habit = appData.habits.find(item => item.id === habitId);

  if (!habit) return;

  if (!confirm(`Archive "${habit.name}"? Your completion history will remain saved.`)) {
    return;
  }

  habit.archived = true;

  if (!saveData()) {
    habit.archived = false;
    return;
  }

  renderApp();
  showToast("Habit archived. Its history is still here 🌿");
}

/* -----------------------------------------
   REWARDS AND ACHIEVEMENTS
   ----------------------------------------- */

const ACHIEVEMENT_DEFINITIONS = [
  {
    id: "first-bloom",
    title: "First Bloom",
    description: "Complete your first habit.",
    emoji: "🌷",
    condition: () => appData.completions.length >= 1
  },
  {
    id: "little-steps",
    title: "Little Steps",
    description: "Complete 5 habits.",
    emoji: "👣",
    condition: () => appData.completions.length >= 5
  },
  {
    id: "blooming-week",
    title: "Blooming Spirit",
    description: "Complete 10 habits.",
    emoji: "🌼",
    condition: () => appData.completions.length >= 10
  }
];

function checkAchievements() {
  const newAchievements = [];

  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    const alreadyEarned = appData.achievements.some(
      item => item.id === definition.id
    );

    if (!alreadyEarned && definition.condition()) {
      appData.achievements.push({
        id: definition.id,
        unlockedAt: new Date().toISOString()
      });

      newAchievements.push(definition.id);
    }
  }

  return newAchievements;
}

function getLevelInfo(xp) {
  const level = Math.floor(xp / 100) + 1;
  const currentLevelXP = xp % 100;

  const names = [
    "Little Seed",
    "Tiny Sprout",
    "Growing Bud",
    "Happy Bloom",
    "Garden Star"
  ];

  return {
    level,
    currentLevelXP,
    name: names[Math.min(level - 1, names.length - 1)]
  };
}

function renderRewards() {
  const xp = appData.rewards.xp;
  const petals = appData.rewards.petals;
  const levelInfo = getLevelInfo(xp);

  document.getElementById("xpValue").textContent = xp;
  document.getElementById("petalValue").textContent = petals;
  document.getElementById("levelText").textContent =
    `Level ${levelInfo.level} · ${levelInfo.name}`;

  document.getElementById("rewardsXP").textContent = `${xp} XP`;
  document.getElementById("rewardsPetals").textContent = petals;
  document.getElementById("rewardsLevel").textContent =
    `Level ${levelInfo.level}`;

  document.getElementById("achievementsList").innerHTML =
    ACHIEVEMENT_DEFINITIONS.map(definition => {
      const earned = appData.achievements.some(
        item => item.id === definition.id
      );

      return `
        <div class="achievement">
          <span>${earned ? definition.emoji : "🔒"}</span>
          <strong>${escapeHTML(definition.title)}</strong>
          <p>${earned
            ? "You've earned this badge!"
            : escapeHTML(definition.description)}</p>
        </div>
      `;
    }).join("");
}

/* -----------------------------------------
   GARDEN
   ----------------------------------------- */

function renderGarden() {
  const plants = appData.garden.plants;

  document.getElementById("gardenEnergy").textContent =
    appData.garden.energy;

  document.getElementById("plantCount").textContent =
    plants.length;

  document.getElementById("gardenXP").textContent =
    `${appData.rewards.xp} XP`;

  document.getElementById("gardenMessage").textContent =
    plants.length
      ? "Look at your little garden growing with every win! 🌷"
      : "Your little garden is waiting for its first seed.";

  const gardenPlants = document.getElementById("gardenPlants");

  if (!plants.length) {
    gardenPlants.innerHTML = `
      <div class="garden-plot">
        🌱
        <small>Your first seed is waiting</small>
      </div>
    `;
    return;
  }

  const plantEmojis = ["🌱", "🌿", "🌷", "🌼", "🌻"];

  gardenPlants.innerHTML = plants.map((plant, index) => {
    const stage = Math.min(
      Math.max(Number(plant.stage) || 1, 1),
      plantEmojis.length
    );

    const habit = appData.habits.find(item =>
      item.id === plant.habitId
    );

    return `
      <div class="garden-plot">
        ${plantEmojis[stage - 1]}
        <small>${escapeHTML(habit ? habit.name : "Little plant")}</small>
      </div>
    `;
  }).join("");
}

/* -----------------------------------------
   JOURNAL
   ----------------------------------------- */

function renderJournal() {
  const container = document.getElementById("journalEntries");

  container.innerHTML = appData.journalEntries
    .slice()
    .reverse()
    .map(entry => `
      <article class="journal-entry">
        <strong>${escapeHTML(entry.mood)} · ${escapeHTML(entry.date)}</strong>
        <p>${escapeHTML(entry.text || "A little mood check-in 💗")}</p>
        <button class="text-button" data-delete-entry="${escapeHTML(entry.id)}">
          Delete entry
        </button>
      </article>
    `).join("");

  container.querySelectorAll("[data-delete-entry]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteEntry;
      const original = appData.journalEntries;

      if (!confirm("Delete this journal entry?")) return;

      appData.journalEntries = original.filter(entry => entry.id !== id);

      if (!saveData()) {
        appData.journalEntries = original;
        return;
      }

      renderJournal();
      showToast("Journal entry deleted.");
    });
  });
}

function setupJournal() {
  document.querySelectorAll("[data-mood]").forEach(button => {
    button.addEventListener("click", () => {
      selectedMood = button.dataset.mood;

      document.querySelectorAll("[data-mood]").forEach(item => {
        item.classList.toggle("selected", item === button);
      });

      playSound("click");
    });
  });

  document.getElementById("journalForm").addEventListener("submit", event => {
    event.preventDefault();

    const text = document.getElementById("journalText").value.trim();

    if (!text) {
      showToast("Write a little reflection before saving 💗");
      return;
    }

    const entry = {
      id: makeId(),
      mood: selectedMood,
      text,
      date: todayKey(),
      createdAt: new Date().toISOString()
    };

    appData.journalEntries.push(entry);

    if (!saveData()) {
      appData.journalEntries = appData.journalEntries.filter(
        item => item.id !== entry.id
      );
      return;
    }

    document.getElementById("journalText").value = "";
    renderJournal();
    showToast("Your reflection has been saved 💗");
  });
}

/* -----------------------------------------
   INSIGHTS
   ----------------------------------------- */

function renderInsights() {
  document.getElementById("insightCompletions").textContent =
    appData.completions.length;

  document.getElementById("insightHabits").textContent =
    getActiveHabits().length;

  document.getElementById("insightXP").textContent =
    `${appData.rewards.xp} XP`;

  const chart = document.getElementById("weeklyChart");
  const today = new Date();

  const days = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    const count = appData.completions.filter(
      item => item.date === key
    ).length;

    days.push({
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count
    });
  }

  const maxCount = Math.max(1, ...days.map(day => day.count));

  chart.innerHTML = days.map(day => {
    const height = day.count
      ? Math.max(5, day.count / maxCount * 100)
      : 3;

    return `
      <div class="chart-day">
        <span>${day.count}</span>
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="height:${height}%"></div>
        </div>
        <span>${escapeHTML(day.label)}</span>
      </div>
    `;
  }).join("");
}

/* -----------------------------------------
   SETTINGS AND EXPORT
   ----------------------------------------- */

function applySettings() {
  document.body.classList.toggle(
    "dark-theme",
    appData.settings.theme === "dark"
  );

  document.getElementById("themeToggle").checked =
    appData.settings.theme === "dark";

  document.getElementById("soundToggle").checked =
    appData.settings.sound;

  document.getElementById("profileName").textContent =
    appData.profile.name || "Friend";

  document.getElementById("profileAvatar").textContent =
    appData.profile.avatar || "🌷";

  const hour = new Date().getHours();

  let greeting = "Hello, sunshine! ☀️";

  if (hour < 12) greeting = "Good morning, sunshine! ☀️";
  else if (hour >= 17) greeting = "Good evening, lovely! 🌙";
  else greeting = "Hello, sunshine! 🌷";

  document.getElementById("greeting").textContent =
    `${greeting} ${appData.profile.name === "Friend"
      ? ""
      : appData.profile.name + "!"}`;

  document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).toUpperCase();
}

function setupSettings() {
  document.getElementById("themeToggle").addEventListener("change", event => {
    const previous = appData.settings.theme;

    appData.settings.theme = event.target.checked ? "dark" : "light";

    if (!saveData()) {
      appData.settings.theme = previous;
      applySettings();
      return;
    }

    applySettings();
  });

  document.getElementById("soundToggle").addEventListener("change", event => {
    const previous = appData.settings.sound;

    appData.settings.sound = event.target.checked;

    if (!saveData()) {
      appData.settings.sound = previous;
      applySettings();
      return;
    }

    if (appData.settings.sound) playSound("click");
  });

  document.getElementById("changeName").addEventListener("click", () => {
    const name = prompt(
      "What should Flourish call you?",
      appData.profile.name === "Friend" ? "" : appData.profile.name
    );

    if (name === null) return;

    const previous = appData.profile.name;
    appData.profile.name = name.trim().slice(0, 30) || "Friend";

    if (!saveData()) {
      appData.profile.name = previous;
      return;
    }

    applySettings();
    showToast("Your profile has been updated 🌷");
  });

  document.getElementById("exportData").addEventListener("click", () => {
    try {
      const file = new Blob(
        [JSON.stringify(appData, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");

      link.href = url;
      link.download = "flourish-backup.json";
      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Your Flourish backup is ready 🌱");
    } catch (error) {
      console.error(error);
      showToast("Couldn't export your data.");
    }
  });

  document.getElementById("resetData").addEventListener("click", () => {
    const confirmed = confirm(
      "Reset Flourish? This will delete your saved habits, garden, " +
      "journal entries, and settings from this browser. Export a backup first if needed."
    );

    if (!confirmed) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    } catch (error) {
      console.error(error);
      showToast("Couldn't reset the saved data.");
    }
  });
}

/* -----------------------------------------
   MAIN RENDER
   ----------------------------------------- */

function renderApp() {
  applySettings();
  renderHabits();
  renderRewards();
  renderGarden();
  renderJournal();
  renderInsights();
}

function initFlourish() {
  setupNavigation();
  setupWelcome();
  setupHabitDialog();
  setupJournal();
  setupSettings();

  if (appData.onboardingComplete) {
    renderApp();
  }
}

document.addEventListener("DOMContentLoaded", initFlourish);
