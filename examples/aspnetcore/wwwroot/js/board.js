/* global FreeBlockEngine */

// Free Block Engine + ASP.NET Core example: the board lives on the client,
// the server persists engine.exportToJSON() via /api/board.
(() => {
  const { BlockEngine, BlockRenderer } = FreeBlockEngine;

  const engine = new BlockEngine();
  const renderer = new BlockRenderer(engine, 'board');

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

  engine.on('historyChanged', ({ canUndo, canRedo }) => {
    document.getElementById('undoBtn').disabled = !canUndo;
    document.getElementById('redoBtn').disabled = !canRedo;
  });

  renderer.onCameraChange = (camera) => {
    document.getElementById('zoomLabel').textContent = `${Math.round(camera.zoom * 100)}%`;
  };

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.isContentEditable) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      saveToServer();
    } else if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      engine.undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      engine.redo();
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
      updateStatus('Sample board created — press "Save to server" to persist it');
    }
  });
})();
