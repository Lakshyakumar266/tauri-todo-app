import { useState, useEffect, useMemo, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  category: string;
  created_at: string;
}

const CATEGORIES = [
  { id: "general", label: "✨ General" },
  { id: "personal", label: "🌸 Personal" },
  { id: "work", label: "💼 Work" },
  { id: "study", label: "📚 Study" },
];

const DEFAULT_TODOS: TodoItem[] = [
  {
    id: "demo_1",
    title: "🌸 Welcome to your pink desktop widget!",
    completed: false,
    priority: "high",
    category: "general",
    created_at: Date.now().toString(),
  },
  {
    id: "demo_2",
    title: "📌 Click the pin button to keep widget floating",
    completed: false,
    priority: "medium",
    category: "study",
    created_at: Date.now().toString(),
  },
  {
    id: "demo_3",
    title: "✨ Tap the heart circle to check off items",
    completed: true,
    priority: "low",
    category: "personal",
    created_at: Date.now().toString(),
  },
];

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Pomodoro / Stopwatch Presets
type TabView = "todos" | "pomodoro";
type TimerMode = "pomodoro" | "shortBreak" | "longBreak" | "stopwatch";

const TIMER_PRESETS: Record<TimerMode, number> = {
  pomodoro: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  stopwatch: 0,
};

function playChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch {
    // Audio Context might be restricted before interaction
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabView>("todos");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<"low" | "medium" | "high">("medium");
  const [selectedCategory, setSelectedCategory] = useState("personal");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [isPinned, setIsPinned] = useState(true);

  // Pomodoro & Stopwatch State
  const [timerMode, setTimerMode] = useState<TimerMode>("pomodoro");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<string>("");

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Load initial todos
  useEffect(() => {
    async function loadTodos() {
      if (isTauriEnvironment()) {
        try {
          const list = await invoke<TodoItem[]>("get_todos");
          setTodos(list);
          return;
        } catch (err) {
          console.warn("Tauri invoke get_todos failed, using local storage", err);
        }
      }
      // Local fallback
      const initialized = localStorage.getItem("pink_todo_widget_initialized");
      const saved = localStorage.getItem("pink_todo_widget_data");
      if (initialized && saved) {
        try {
          setTodos(JSON.parse(saved));
        } catch {
          setTodos(DEFAULT_TODOS);
        }
      } else {
        setTodos(DEFAULT_TODOS);
        localStorage.setItem("pink_todo_widget_initialized", "true");
      }
    }
    loadTodos();
  }, []);

  // Save to localStorage whenever todos change
  useEffect(() => {
    localStorage.setItem("pink_todo_widget_data", JSON.stringify(todos));
  }, [todos]);

  // Current Date display
  const formattedDate = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  // Progress metrics
  const totalCount = todos.length;
  const completedCount = todos.filter((t) => t.completed).length;
  const activeCount = totalCount - completedCount;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const motivationalQuote = useMemo(() => {
    if (totalCount === 0) return "Add your first goal! 🌸";
    if (progressPercent === 100) return "All done! You're amazing ✨";
    if (progressPercent >= 60) return "Almost there, stay focused! 💖";
    if (progressPercent > 0) return "Great momentum, keep going! 🌷";
    return "A fresh page awaits! 🎀";
  }, [totalCount, progressPercent]);

  // Filtered todos
  const filteredTodos = useMemo(() => {
    return todos.filter((item) => {
      if (filter === "active") return !item.completed;
      if (filter === "completed") return item.completed;
      return true;
    });
  }, [todos, filter]);

  // Actions
  const handleAddTodo = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (isTauriEnvironment()) {
      try {
        const newItem = await invoke<TodoItem>("add_todo", {
          title: trimmed,
          priority: selectedPriority,
          category: selectedCategory,
        });
        setTodos((prev) => [newItem, ...prev]);
        setInputValue("");
        return;
      } catch (err) {
        console.warn("Tauri add_todo failed, fallback to local:", err);
      }
    }

    const localItem: TodoItem = {
      id: "todo_" + Date.now(),
      title: trimmed,
      completed: false,
      priority: selectedPriority,
      category: selectedCategory,
      created_at: Date.now().toString(),
    };
    setTodos((prev) => [localItem, ...prev]);
    setInputValue("");
  };

  const handleToggleTodo = async (id: string) => {
    if (isTauriEnvironment()) {
      try {
        const updated = await invoke<TodoItem>("toggle_todo", { id });
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
        return;
      } catch (err) {
        console.warn("Tauri toggle_todo failed, fallback to local:", err);
      }
    }

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleDeleteTodo = async (id: string) => {
    if (isTauriEnvironment()) {
      try {
        await invoke<boolean>("delete_todo", { id });
      } catch (err) {
        console.warn("Tauri delete_todo failed, fallback to local:", err);
      }
    }
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const handleStartEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }

    if (isTauriEnvironment()) {
      try {
        const updated = await invoke<TodoItem>("edit_todo", {
          id,
          title: trimmed,
        });
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setEditingId(null);
        return;
      } catch (err) {
        console.warn("Tauri edit_todo failed, fallback to local:", err);
      }
    }

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t))
    );
    setEditingId(null);
  };

  const handleClearCompleted = async () => {
    if (isTauriEnvironment()) {
      try {
        const remaining = await invoke<TodoItem[]>("clear_completed");
        setTodos(remaining);
        return;
      } catch (err) {
        console.warn("Tauri clear_completed failed, fallback to local:", err);
      }
    }
    setTodos((prev) => prev.filter((t) => !t.completed));
  };

  // Window Controls
  const handleTogglePin = async () => {
    const nextPin = !isPinned;
    if (isTauriEnvironment()) {
      try {
        await invoke("toggle_always_on_top", { pinned: nextPin });
      } catch (err) {
        console.warn("Could not set always on top:", err);
      }
    }
    setIsPinned(nextPin);
  };

  const handleMinimize = async () => {
    if (isTauriEnvironment()) {
      try {
        await invoke("minimize_window");
      } catch (err) {
        console.warn("Could not minimize window:", err);
      }
    }
  };

  const handleClose = async () => {
    if (isTauriEnvironment()) {
      try {
        await invoke("close_window");
      } catch (err) {
        console.warn("Could not close window:", err);
      }
    }
  };

  // Pomodoro & Stopwatch Timer Tick
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isTimerRunning) {
      interval = setInterval(() => {
        if (timerMode === "stopwatch") {
          setTimeLeft((prev) => prev + 1);
        } else {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              setIsTimerRunning(false);
              playChime();
              if (timerMode === "pomodoro") {
                setPomodorosCompleted((c) => c + 1);
              }
              return 0;
            }
            return prev - 1;
          });
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerMode]);

  const handleSwitchTimerMode = async (mode: TimerMode) => {
    setTimerMode(mode);
    setIsTimerRunning(false);
    setTimeLeft(TIMER_PRESETS[mode]);
    if (isTauriEnvironment()) {
      try {
        await invoke("set_pomodoro_mode", { mode });
      } catch (e) {
        console.warn("Tauri set_pomodoro_mode:", e);
      }
    }
  };

  const handleToggleTimer = async () => {
    const nextRunning = !isTimerRunning;
    setIsTimerRunning(nextRunning);
    if (isTauriEnvironment()) {
      try {
        if (nextRunning) {
          await invoke("start_pomodoro");
        } else {
          await invoke("pause_pomodoro");
        }
      } catch (e) {
        console.warn("Tauri toggle pomodoro:", e);
      }
    }
  };

  const handleResetTimer = async () => {
    setIsTimerRunning(false);
    setTimeLeft(TIMER_PRESETS[timerMode]);
    if (isTauriEnvironment()) {
      try {
        await invoke("reset_pomodoro", { mode: timerMode });
      } catch (e) {
        console.warn("Tauri reset_pomodoro:", e);
      }
    }
  };

  const handleAddOneMinute = async () => {
    setTimeLeft((prev) => prev + 60);
    if (isTauriEnvironment()) {
      try {
        await invoke("add_pomodoro_minute", { seconds: 60 });
      } catch (e) {
        console.warn("Tauri add_pomodoro_minute:", e);
      }
    }
  };

  const formatTimerDisplay = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Circular ring metrics (r = 68 -> circumference ~ 427.25)
  const totalTimerDuration = TIMER_PRESETS[timerMode] || 1;
  const timerRatio =
    timerMode === "stopwatch"
      ? (timeLeft % 60) / 60
      : Math.max(0, Math.min(1, 1 - timeLeft / totalTimerDuration));
  const strokeDashoffset = 427.25 * (1 - timerRatio);

  const activeTodos = useMemo(() => todos.filter((t) => !t.completed), [todos]);
  const currentFocusTask = useMemo(
    () => todos.find((t) => t.id === focusTaskId),
    [todos, focusTaskId]
  );

  return (
    <div className="widget-app" data-tauri-drag-region>
      {/* Draggable Custom Widget Header */}
      <header className="widget-header" data-tauri-drag-region>
        <div className="header-brand" data-tauri-drag-region>
          <div className="brand-dot" />
          <span className="brand-title">Today's Focus</span>
          <span className="brand-badge">{activeCount} left</span>
        </div>

        <div className="header-actions">
          <button
            className={`btn-icon ${isPinned ? "active-pin" : ""}`}
            onClick={handleTogglePin}
            title={isPinned ? "Unpin widget (Always on top)" : "Pin widget (Always on top)"}
            type="button"
          >
            📌
          </button>
          <button
            className="btn-icon"
            onClick={handleMinimize}
            title="Minimize"
            type="button"
          >
            —
          </button>
          <button
            className="btn-icon close"
            onClick={handleClose}
            title="Close"
            type="button"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Widget View Switcher: Tasks vs Pomodoro */}
      <nav className="widget-nav">
        <button
          type="button"
          className={`nav-tab ${activeTab === "todos" ? "active" : ""}`}
          onClick={() => setActiveTab("todos")}
        >
          📋 Tasks {activeCount > 0 && <span className="brand-badge" style={{ fontSize: 9 }}>{activeCount}</span>}
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === "pomodoro" ? "active" : ""}`}
          onClick={() => setActiveTab("pomodoro")}
        >
          ⏱️ Pomodoro {isTimerRunning && <span className="brand-dot" style={{ width: 6, height: 6 }} />}
        </button>
      </nav>

      {activeTab === "todos" ? (
        /* Widget Body: Todos */
        <main className="widget-body" data-tauri-drag-region>
          {/* Progress & Date Card */}
          <section className="progress-card">
            <div className="progress-header">
              <span className="progress-date">{formattedDate}</span>
              <span className="progress-percent">{progressPercent}%</span>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="progress-footer">
              <span className="progress-quote">{motivationalQuote}</span>
              <span>
                {completedCount}/{totalCount} done
              </span>
            </div>
          </section>

          {/* Filter Segmented Control */}
          <nav className="filter-tabs">
            <button
              type="button"
              className={`filter-tab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All <span className="filter-count">{totalCount}</span>
            </button>
            <button
              type="button"
              className={`filter-tab ${filter === "active" ? "active" : ""}`}
              onClick={() => setFilter("active")}
            >
              Active <span className="filter-count">{activeCount}</span>
            </button>
            <button
              type="button"
              className={`filter-tab ${filter === "completed" ? "active" : ""}`}
              onClick={() => setFilter("completed")}
            >
              Done <span className="filter-count">{completedCount}</span>
            </button>
          </nav>

          {/* Quick Add Form */}
          <form className="quick-add-form" onSubmit={handleAddTodo}>
            <div className="add-input-row">
              <input
                className="add-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="What would you like to do?..."
                id="add-todo-input"
              />
              <button
                className="btn-add"
                type="submit"
                disabled={!inputValue.trim()}
                title="Add task (Enter)"
              >
                +
              </button>
            </div>

            <div className="add-meta-row">
              <div className="meta-group">
                <span className="meta-label">Tag:</span>
                <select
                  className="meta-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="meta-group">
                <span className="meta-label">Priority:</span>
                <select
                  className="meta-select"
                  value={selectedPriority}
                  onChange={(e) =>
                    setSelectedPriority(e.target.value as "low" | "medium" | "high")
                  }
                >
                  <option value="high">🔴 High</option>
                  <option value="medium">🟠 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>
              </div>
            </div>
          </form>

          {/* Scrollable Todo List */}
          <div className="todo-list-container">
            {filteredTodos.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🌸</span>
                <p className="empty-title">
                  {filter === "completed"
                    ? "No completed tasks yet"
                    : filter === "active"
                      ? "All caught up! Yay!"
                      : "Your list is sparkling clean!"}
                </p>
                <p className="empty-desc">
                  {filter === "completed"
                    ? "Finish a task to see it listed here."
                    : "Enjoy the peaceful moment or add a new goal above."}
                </p>
              </div>
            ) : (
              filteredTodos.map((item) => (
                <div
                  key={item.id}
                  className={`todo-item ${item.completed ? "completed" : ""}`}
                >
                  <button
                    type="button"
                    className={`todo-checkbox ${item.completed ? "checked" : ""}`}
                    onClick={() => handleToggleTodo(item.id)}
                    title={item.completed ? "Mark incomplete" : "Mark completed"}
                  >
                    {item.completed && <span className="checkbox-heart">❤</span>}
                  </button>

                  {editingId === item.id ? (
                    <div className="edit-form">
                      <input
                        className="edit-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(item.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn-save"
                        onClick={() => handleSaveEdit(item.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="todo-content"
                        onDoubleClick={() => handleStartEdit(item)}
                      >
                        <span className="todo-title">{item.title}</span>
                        <div className="todo-badges">
                          <span className={`prio-badge ${item.priority}`}>
                            {item.priority}
                          </span>
                          <span className="category-badge">
                            {CATEGORIES.find((c) => c.id === item.category)?.label ||
                              item.category}
                          </span>
                        </div>
                      </div>

                      <div className="todo-actions">
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => handleStartEdit(item)}
                          title="Edit task"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn-action delete"
                          onClick={() => handleDeleteTodo(item.id)}
                          title="Delete task"
                        >
                          🗑
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Widget Footer */}
          {completedCount > 0 && (
            <footer className="widget-footer">
              <span>{completedCount} completed</span>
              <button
                type="button"
                className="btn-clear"
                onClick={handleClearCompleted}
              >
                Clear Done ✨
              </button>
            </footer>
          )}
        </main>
      ) : (
        /* Widget Body: Pomodoro & Stopwatch */
        <main className="pomodoro-container" data-tauri-drag-region>
          {/* Preset Modes */}
          <div className="pomo-mode-tabs">
            <button
              type="button"
              className={`pomo-mode-btn ${timerMode === "pomodoro" ? "active" : ""}`}
              onClick={() => handleSwitchTimerMode("pomodoro")}
            >
              🍅 25m Focus
            </button>
            <button
              type="button"
              className={`pomo-mode-btn ${timerMode === "shortBreak" ? "active" : ""}`}
              onClick={() => handleSwitchTimerMode("shortBreak")}
            >
              ☕ 5m Break
            </button>
            <button
              type="button"
              className={`pomo-mode-btn ${timerMode === "longBreak" ? "active" : ""}`}
              onClick={() => handleSwitchTimerMode("longBreak")}
            >
              🌿 15m Long
            </button>
            <button
              type="button"
              className={`pomo-mode-btn ${timerMode === "stopwatch" ? "active" : ""}`}
              onClick={() => handleSwitchTimerMode("stopwatch")}
            >
              ⏱️ Stopwatch
            </button>
          </div>

          {/* Circular Timer Card */}
          <div className={`timer-card ${isTimerRunning ? "running" : ""}`}>
            <div className="timer-dial">
              <svg className="timer-svg" viewBox="0 0 170 170">
                <defs>
                  <linearGradient id="pomoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ff758f" />
                    <stop offset="50%" stopColor="#ff476d" />
                    <stop offset="100%" stopColor="#e0184b" />
                  </linearGradient>
                </defs>
                <circle className="timer-bg-circle" cx="85" cy="85" r="68" />
                <circle
                  className="timer-progress-circle"
                  cx="85"
                  cy="85"
                  r="68"
                  strokeDasharray={427.25}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>

              <div className="timer-digits-container">
                <span className="timer-digits">{formatTimerDisplay(timeLeft)}</span>
                <span className="timer-status-badge">
                  {timerMode === "stopwatch"
                    ? isTimerRunning
                      ? "Running"
                      : "Paused"
                    : timerMode === "pomodoro"
                      ? isTimerRunning
                        ? "Deep Focus"
                        : "Focus Ready"
                      : isTimerRunning
                        ? "Relaxing"
                        : "Break Ready"}
                </span>
              </div>
            </div>

            {/* Associated Task */}
            <div className="timer-task-selector">
              <span className="timer-task-label">Currently focusing on:</span>
              <select
                className="timer-task-select"
                value={focusTaskId}
                onChange={async (e) => {
                  const val = e.target.value;
                  setFocusTaskId(val);
                  if (isTauriEnvironment()) {
                    try {
                      await invoke("set_pomodoro_focus_task", {
                        taskId: val ? val : null,
                      });
                    } catch (err) {
                      console.warn("Tauri set_pomodoro_focus_task:", err);
                    }
                  }
                }}
              >
                <option value="">✨ General Focus / Free Session</option>
                {activeTodos.map((t) => (
                  <option key={t.id} value={t.id}>
                    📌 {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Timer Control Buttons */}
          <div className="timer-controls">
            <button
              type="button"
              className="btn-timer-secondary"
              onClick={handleResetTimer}
              title="Reset timer"
            >
              ↺
            </button>

            <button
              type="button"
              className="btn-timer-primary"
              onClick={handleToggleTimer}
            >
              {isTimerRunning ? "⏸ Pause" : "▶ Start"}
            </button>

            {timerMode !== "stopwatch" && (
              <button
                type="button"
                className="btn-timer-secondary"
                onClick={handleAddOneMinute}
                title="Add 1 minute (+60s)"
              >
                +1m
              </button>
            )}

            {currentFocusTask && (
              <button
                type="button"
                className="btn-timer-secondary"
                onClick={() => {
                  handleToggleTodo(currentFocusTask.id);
                  setFocusTaskId("");
                }}
                title="Mark current focus task done"
              >
                ✔
              </button>
            )}
          </div>

          {/* Pomodoro Stats */}
          <div className="pomo-stats">
            <span className="pomo-count">
              🍅 <strong>{pomodorosCompleted}</strong> done
            </span>
            <span className="pomo-quote">
              {isTimerRunning ? "Stay in flow 💖" : "Take a breath 🌸"}
            </span>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
