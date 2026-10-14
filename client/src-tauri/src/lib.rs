use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

const HIDDEN_ARG: &str = "--hidden";
const READY_PREFIX: &str = "RYHOME_READY";
const READY_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Default)]
struct CoreState {
  ready: bool,
  error: Option<String>,
  child: Option<Child>,
  stopping: bool,
}

struct Core {
  url: String,
  token: String,
  state: Mutex<CoreState>,
  changed: Condvar,
}

#[derive(serde::Serialize)]
struct CoreConnection {
  url: String,
  token: String,
}

fn random_token() -> Result<String, String> {
  let mut bytes = [0u8; 32];
  getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
  Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn free_port() -> Result<u16, String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
  Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

fn engine_path() -> Result<PathBuf, String> {
  let exe = std::env::current_exe().map_err(|e| e.to_string())?;
  let name = if cfg!(windows) { "ryhome-core.exe" } else { "ryhome-core" };
  Ok(exe.parent().ok_or("no exe dir")?.join(name))
}

fn spawn_engine(app: &AppHandle, core: &Core) -> Result<Child, String> {
  let script = app
    .path()
    .resolve("core/core.mjs", BaseDirectory::Resource)
    .map_err(|e| e.to_string())?;
  let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&data).map_err(|e| e.to_string())?;
  let port = core.url.rsplit(':').next().unwrap_or_default();
  let mut command = Command::new(engine_path()?);
  // node can't load scripts from \\?\ verbatim paths, which is what tauri hands back on windows
  command
    .arg("--disable-warning=ExperimentalWarning")
    .arg(dunce::simplified(&script))
    .env("RYHOME_HOME", dunce::simplified(&data))
    .env("RYHOME_TOKEN", &core.token)
    .env("RYHOME_PORT", port)
    .env("RYHOME_PARENT_PIPE", "1")
    .env("NO_COLOR", "1")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }
  command.spawn().map_err(|e| format!("couldn't start RyHome's engine: {e}"))
}

fn open_log(app: &AppHandle) -> Option<File> {
  let dir = app.path().app_log_dir().ok()?;
  fs::create_dir_all(&dir).ok()?;
  OpenOptions::new().create(true).append(true).open(dir.join("core.log")).ok()
}

fn pipe_lines(source: impl std::io::Read + Send + 'static, log: Option<File>, core: Option<Arc<Core>>) {
  thread::spawn(move || {
    let mut log = log;
    for line in BufReader::new(source).lines().map_while(Result::ok) {
      if let Some(core) = &core {
        if line.starts_with(READY_PREFIX) {
          let mut state = core.state.lock().unwrap();
          state.ready = true;
          state.error = None;
          core.changed.notify_all();
          continue;
        }
      }
      if let Some(file) = log.as_mut() {
        let _ = writeln!(file, "{line}");
      }
    }
  });
}

// keeps the engine running for the life of the app, restarting it if it ever crashes
fn supervise(app: AppHandle, core: Arc<Core>) {
  thread::spawn(move || {
    let mut backoff = Duration::from_secs(1);
    loop {
      if core.state.lock().unwrap().stopping {
        return;
      }
      let mut child = match spawn_engine(&app, &core) {
        Ok(child) => child,
        Err(error) => {
          let mut state = core.state.lock().unwrap();
          state.error = Some(error);
          core.changed.notify_all();
          return;
        }
      };
      pipe_lines(child.stdout.take().unwrap(), open_log(&app), Some(core.clone()));
      pipe_lines(child.stderr.take().unwrap(), open_log(&app), None);
      let pid = child.id();
      core.state.lock().unwrap().child = Some(child);
      loop {
        thread::sleep(Duration::from_millis(500));
        let mut state = core.state.lock().unwrap();
        let exited = match state.child.as_mut() {
          Some(c) if c.id() == pid => !matches!(c.try_wait(), Ok(None)),
          _ => true,
        };
        if exited {
          state.child = None;
          break;
        }
      }
      if core.state.lock().unwrap().stopping {
        return;
      }
      thread::sleep(backoff);
      backoff = (backoff * 2).min(Duration::from_secs(30));
    }
  });
}

#[tauri::command]
async fn core_connection(core: State<'_, Arc<Core>>) -> Result<CoreConnection, String> {
  let core = core.inner().clone();
  tauri::async_runtime::spawn_blocking(move || {
    let state = core.state.lock().unwrap();
    let (state, _) = core
      .changed
      .wait_timeout_while(state, READY_TIMEOUT, |s| !s.ready && s.error.is_none())
      .unwrap();
    if let Some(error) = &state.error {
      return Err(error.clone());
    }
    if !state.ready {
      return Err("RyHome's engine didn't start in time.".into());
    }
    Ok(CoreConnection { url: core.url.clone(), token: core.token.clone() })
  })
  .await
  .map_err(|e| e.to_string())?
}

fn show_main(app: &AppHandle) {
  let Some(window) = app.get_webview_window("main") else {
    return;
  };
  for result in [window.show(), window.unminimize(), window.set_focus()] {
    if let Err(error) = result {
      eprintln!("failed to show main window: {error}");
    }
  }
}

#[tauri::command]
fn quit(app: AppHandle) {
  app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // a second copy would start a second matter controller on the same storage, so hand off to the first
    .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main(app)))
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN_ARG])))
    .invoke_handler(tauri::generate_handler![core_connection, quit])
    .setup(|app| {
      let core = Arc::new(Core {
        url: format!("http://127.0.0.1:{}", free_port()?),
        token: random_token()?,
        state: Mutex::new(CoreState::default()),
        changed: Condvar::new(),
      });
      app.manage(core.clone());
      supervise(app.handle().clone(), core);

      let open = MenuItem::with_id(app, "open", "Open RyHome", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&open, &quit])?;
      let icon = app.default_window_icon().cloned().ok_or("missing app icon")?;
      TrayIconBuilder::new()
        .icon(icon)
        .tooltip("RyHome")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "open" => show_main(app),
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            show_main(tray.app_handle());
          }
        })
        .build(app)?;

      if !std::env::args().any(|arg| arg == HIDDEN_ARG) {
        show_main(app.handle());
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" {
          api.prevent_close();
          if let Err(error) = window.hide() {
            eprintln!("failed to hide main window: {error}");
          }
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building RyHome")
    .run(|app, event| {
      if let RunEvent::Exit = event {
        let core = app.state::<Arc<Core>>();
        let mut state = core.state.lock().unwrap();
        state.stopping = true;
        if let Some(mut child) = state.child.take() {
          let _ = child.kill();
          let _ = child.wait();
        }
      }
    });
}
