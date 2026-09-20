use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub priority: String, // "low", "medium", "high"
    pub category: String, // "personal", "work", "study", "general"
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroState {
    pub mode: String, // "pomodoro", "shortBreak", "longBreak", "stopwatch"
    pub time_left: u32,
    pub is_running: bool,
    pub pomodoros_completed: u32,
    pub focus_task_id: Option<String>,
}

impl Default for PomodoroState {
    fn default() -> Self {
        Self {
            mode: "pomodoro".to_string(),
            time_left: 25 * 60,
            is_running: false,
            pomodoros_completed: 0,
            focus_task_id: None,
        }
    }
}

pub struct AppState {
    pub file_path: PathBuf,
    pub todos: Mutex<Vec<TodoItem>>,
    pub pomodoro: Mutex<PomodoroState>,
}

impl AppState {
    fn save_to_disk(&self) {
        if let Ok(guard) = self.todos.lock() {
            if let Ok(json) = serde_json::to_string_pretty(&*guard) {
                let _ = fs::write(&self.file_path, json);
            }
        }
    }
}

fn get_preset_duration(mode: &str) -> u32 {
    match mode {
        "pomodoro" => 25 * 60,
        "shortBreak" => 5 * 60,
        "longBreak" => 15 * 60,
        "stopwatch" => 0,
        _ => 25 * 60,
    }
}

fn generate_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("todo_{}", millis)
}

fn current_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    millis.to_string()
}

/* ==========================================================
Todo Commands
========================================================== */

#[tauri::command]
fn get_todos(state: State<AppState>) -> Vec<TodoItem> {
    state
        .todos
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[tauri::command]
fn add_todo(
    title: String,
    priority: Option<String>,
    category: Option<String>,
    state: State<AppState>,
) -> Result<TodoItem, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Todo title cannot be empty".to_string());
    }

    let item = TodoItem {
        id: generate_id(),
        title: trimmed.to_string(),
        completed: false,
        priority: priority.unwrap_or_else(|| "medium".to_string()),
        category: category.unwrap_or_else(|| "general".to_string()),
        created_at: current_timestamp(),
    };

    {
        let mut list = state.todos.lock().map_err(|e| e.to_string())?;
        list.insert(0, item.clone());
    }

    state.save_to_disk();
    Ok(item)
}

#[tauri::command]
fn toggle_todo(id: String, state: State<AppState>) -> Result<TodoItem, String> {
    let mut list = state.todos.lock().map_err(|e| e.to_string())?;
    let item = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "Todo not found".to_string())?;

    item.completed = !item.completed;
    let cloned = item.clone();
    drop(list);

    state.save_to_disk();
    Ok(cloned)
}

#[tauri::command]
fn edit_todo(
    id: String,
    title: String,
    priority: Option<String>,
    category: Option<String>,
    state: State<AppState>,
) -> Result<TodoItem, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Todo title cannot be empty".to_string());
    }

    let mut list = state.todos.lock().map_err(|e| e.to_string())?;
    let item = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "Todo not found".to_string())?;

    item.title = trimmed.to_string();
    if let Some(p) = priority {
        item.priority = p;
    }
    if let Some(c) = category {
        item.category = c;
    }
    let cloned = item.clone();
    drop(list);

    state.save_to_disk();
    Ok(cloned)
}

#[tauri::command]
fn delete_todo(id: String, state: State<AppState>) -> Result<bool, String> {
    let mut list = state.todos.lock().map_err(|e| e.to_string())?;
    let initial_len = list.len();
    list.retain(|x| x.id != id);
    let removed = list.len() < initial_len;
    drop(list);

    if removed {
        state.save_to_disk();
    }
    Ok(removed)
}

#[tauri::command]
fn clear_completed(state: State<AppState>) -> Result<Vec<TodoItem>, String> {
    let mut list = state.todos.lock().map_err(|e| e.to_string())?;
    list.retain(|x| !x.completed);
    let result = list.clone();
    drop(list);

    state.save_to_disk();
    Ok(result)
}

/* ==========================================================
Window Controls
========================================================== */

#[tauri::command]
fn toggle_always_on_top(window: WebviewWindow, pinned: bool) -> Result<bool, String> {
    window
        .set_always_on_top(pinned)
        .map_err(|e| e.to_string())?;
    Ok(pinned)
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/* ==========================================================
Pomodoro & Stopwatch Commands
========================================================== */

#[tauri::command]
fn get_pomodoro_state(state: State<AppState>) -> PomodoroState {
    state
        .pomodoro
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[tauri::command]
fn start_pomodoro(state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    pomo.is_running = true;
    pomo.clone()
}

#[tauri::command]
fn pause_pomodoro(state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    pomo.is_running = false;
    pomo.clone()
}

#[tauri::command]
fn reset_pomodoro(mode: Option<String>, state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    let target_mode = mode.unwrap_or_else(|| pomo.mode.clone());
    pomo.mode = target_mode.clone();
    pomo.time_left = get_preset_duration(&target_mode);
    pomo.is_running = false;
    pomo.clone()
}

#[tauri::command]
fn set_pomodoro_mode(mode: String, state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    pomo.mode = mode.clone();
    pomo.time_left = get_preset_duration(&mode);
    pomo.is_running = false;
    pomo.clone()
}

#[tauri::command]
fn set_pomodoro_focus_task(task_id: Option<String>, state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    pomo.focus_task_id = task_id;
    pomo.clone()
}

#[tauri::command]
fn add_pomodoro_minute(seconds: Option<u32>, state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    let extra = seconds.unwrap_or(60);
    pomo.time_left = pomo.time_left.saturating_add(extra);
    pomo.clone()
}

#[tauri::command]
fn tick_pomodoro(state: State<AppState>) -> PomodoroState {
    let mut pomo = state.pomodoro.lock().unwrap_or_else(|e| e.into_inner());
    if pomo.is_running {
        if pomo.mode == "stopwatch" {
            pomo.time_left = pomo.time_left.saturating_add(1);
        } else if pomo.time_left > 1 {
            pomo.time_left -= 1;
        } else {
            pomo.time_left = 0;
            pomo.is_running = false;
            if pomo.mode == "pomodoro" {
                pomo.pomodoros_completed = pomo.pomodoros_completed.saturating_add(1);
            }
        }
    }
    pomo.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            let _ = fs::create_dir_all(&app_dir);
            let file_path = app_dir.join("todos.json");

            let initial_todos: Vec<TodoItem> = if file_path.exists() {
                fs::read_to_string(&file_path)
                    .ok()
                    .and_then(|content| serde_json::from_str(&content).ok())
                    .unwrap_or_default()
            } else {
                vec![
                    TodoItem {
                        id: "initial_1".to_string(),
                        title: "🌸 Welcome to your pink desktop widget!".to_string(),
                        completed: false,
                        priority: "high".to_string(),
                        category: "general".to_string(),
                        created_at: current_timestamp(),
                    },
                    TodoItem {
                        id: "initial_2".to_string(),
                        title: "📌 Pin to keep this widget always on top".to_string(),
                        completed: false,
                        priority: "medium".to_string(),
                        category: "study".to_string(),
                        created_at: current_timestamp(),
                    },
                    TodoItem {
                        id: "initial_3".to_string(),
                        title: "✨ Click the heart to check off tasks".to_string(),
                        completed: true,
                        priority: "low".to_string(),
                        category: "personal".to_string(),
                        created_at: current_timestamp(),
                    },
                ]
            };

            app.manage(AppState {
                file_path,
                todos: Mutex::new(initial_todos),
                pomodoro: Mutex::new(PomodoroState::default()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_todos,
            add_todo,
            toggle_todo,
            edit_todo,
            delete_todo,
            clear_completed,
            toggle_always_on_top,
            minimize_window,
            close_window,
            get_pomodoro_state,
            start_pomodoro,
            pause_pomodoro,
            reset_pomodoro,
            set_pomodoro_mode,
            set_pomodoro_focus_task,
            add_pomodoro_minute,
            tick_pomodoro
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
