/* global FreeBlockEngine */

// Free Block Engine + ASP.NET Core example: the board lives on the client,
// the server persists engine.exportToJSON() via /api/board.
(() => {
  const { BlockEngine, BlockRenderer, createAutosave } = FreeBlockEngine;

  const THEME_KEY = 'fbe-example-theme';

  const engine = new BlockEngine();
  const renderer = new BlockRenderer(engine, 'board', {
    // Undo/redo, select all, duplicate, delete and arrow nudging come from
    // the library — no need to wire them up in the host page.
    keyboardShortcuts: true,
    snapGuides: true,
    contextMenu: true,
    theme: localStorage.getItem(THEME_KEY) ?? 'auto',
    // The canvas menu gets an app-specific entry alongside the defaults.
    contextMenuItems: (target, defaults) =>
      target.type === 'canvas'
        ? [...defaults, { separator: true }, { label: 'Save to server', action: saveToServer }]
        : defaults,
  });

  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const statusEl = document.getElementById('status');
  let statusTimer = null;

  function updateStatus(message) {
    statusEl.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  }

  // ------------------------------------------------------------ server I/O

  async function saveToServer() {
    try {
      const response = await fetch('/api/board', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
        },
        body: engine.exportToJSON(),
      });
      updateStatus(response.ok ? 'Saved to server' : `Save failed: HTTP ${response.status}`);
    } catch {
      updateStatus('Save failed: network error');
    }
  }

  async function loadFromServer() {
    try {
      const response = await fetch('/api/board');
      if (response.status === 204) {
        updateStatus('Nothing saved on the server yet');
        return false;
      }
      if (!response.ok) {
        updateStatus(`Load failed: HTTP ${response.status}`);
        return false;
      }
      const json = await response.text();
      if (engine.importFromJSON(json)) {
        renderer.zoomToFit();
        updateStatus('Loaded from server');
        return true;
      }
      updateStatus('Load failed: invalid board data');
      return false;
    } catch {
      updateStatus('Load failed: network error');
      return false;
    }
  }

  // ------------------------------------------------------------- autosave

  /**
   * Web Storage-shaped adapter for createAutosave() that persists to the
   * server instead of localStorage. The Storage contract is synchronous, so
   * setItem fires the request without awaiting it and reports the outcome to
   * the status line. getItem returns null on purpose: the initial load stays
   * on loadFromServer(), which is async and also handles zoom and status.
   */
  let pageHiding = false;
  const serverStorage = {
    getItem: () => null,
    setItem: (_key, json) => {
      fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
        body: json,
        // keepalive lets the pagehide flush finish after the tab is gone, but
        // caps the body at ~64 KB — so it is on only for that final save.
        keepalive: pageHiding,
      })
        .then((response) => {
          updateStatus(response.ok ? 'Autosaved' : `Autosave failed: HTTP ${response.status}`);
        })
        .catch(() => updateStatus('Autosave failed: network error'));
    },
    removeItem: () => {},
  };

  let autosave = null;

  /** Started only after the initial load, so loading does not re-save itself. */
  function startAutosave() {
    autosave = createAutosave(engine, { debounceMs: 1500, storage: serverStorage });
  }

  window.addEventListener('pagehide', () => {
    if (!autosave) return;
    pageHiding = true;
    autosave.flush(); // push the last edits even if the debounce is pending
  });
  window.addEventListener('pageshow', () => {
    pageHiding = false; // the page can come back from the bfcache
  });

  // ---------------------------------------------------------------- theme

  /**
   * The library themes the canvas on its own; the surrounding page chrome is
   * ours, so mirror the resolved scheme onto <body>.
   */
  function applyTheme(theme) {
    renderer.setTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    document.body.classList.toggle('dark', renderer.getTheme() === 'dark');
  }

  renderer.onThemeChange = (resolved) => {
    document.body.classList.toggle('dark', resolved === 'dark');
  };

  // --------------------------------------------------------- image export

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSvg() {
    const svg = renderer.exportToSVG();
    download(new Blob([svg], { type: 'image/svg+xml' }), `board_${stamp()}.svg`);
    updateStatus('Exported as SVG');
  }

  async function exportPng() {
    try {
      download(await renderer.exportToPNG({ scale: 2 }), `board_${stamp()}.png`);
      updateStatus('Exported as PNG');
    } catch (error) {
      updateStatus(`PNG export failed: ${error.message}`);
    }
  }

  function stamp() {
    return new Date().toISOString().slice(0, 10);
  }

  // -------------------------------------------------------------- toolbar

  document.getElementById('newBlockBtn').addEventListener('click', () => {
    const content = prompt('Enter block content:');
    if (content !== null) {
      const block = engine.createBlock(content);
      renderer.scrollToBlock(block.id);
    }
  });

  document.getElementById('saveBtn').addEventListener('click', saveToServer);
  document.getElementById('loadBtn').addEventListener('click', loadFromServer);
  document.getElementById('undoBtn').addEventListener('click', () => engine.undo());
  document.getElementById('redoBtn').addEventListener('click', () => engine.redo());
  document.getElementById('zoomInBtn').addEventListener('click', () => renderer.zoomBy(1.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => renderer.zoomBy(1 / 1.2));
  document.getElementById('zoomFitBtn').addEventListener('click', () => renderer.zoomToFit());
  document.getElementById('exportSvgBtn').addEventListener('click', exportSvg);
  document.getElementById('exportPngBtn').addEventListener('click', exportPng);

  const themeSelect = document.getElementById('themeSelect');
  themeSelect.value = localStorage.getItem(THEME_KEY) ?? 'auto';
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  applyTheme(themeSelect.value);

  engine.on('historyChanged', ({ canUndo, canRedo }) => {
    document.getElementById('undoBtn').disabled = !canUndo;
    document.getElementById('redoBtn').disabled = !canRedo;
  });

  renderer.onCameraChange = (camera) => {
    document.getElementById('zoomLabel').textContent = `${Math.round(camera.zoom * 100)}%`;
  };

  // Only the app-specific hotkey lives here; the rest is `keyboardShortcuts`.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.isContentEditable) return;
    if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveToServer();
    }
  });

  // ------------------------------------------------------------- start-up

  function createSampleBoard() {
    const api = engine.createBlock(
      'ASP.NET Core 10\n\nMVC app serving this page and the /api/board endpoint.',
      'note',
      { x: 400, y: 80 }
    );
    const client = engine.createBlock(
      'free-block-engine\n\nRuns fully on the client; exportToJSON() goes to the server.',
      'note',
      { x: 120, y: 320 }
    );
    const storage = engine.createBlock(
      'FileBoardStorage\n\nApp_Data/board.json, atomic writes, semaphore-guarded.',
      'task',
      { x: 680, y: 320 }
    );
    engine.linkBlocks(api.id, client.id, 'double', 'renders');
    engine.linkBlocks(api.id, storage.id, 'single', 'persists via');
    engine.clearHistory();
  }

  loadFromServer().then((loaded) => {
    if (!loaded) {
      createSampleBoard();
      updateStatus('Sample board created — it will autosave as you edit');
    }
    startAutosave();
  });
})();
