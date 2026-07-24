/* global FreeBlockEngine */

// Free Block Engine demo application.
const { BlockEngine, BlockRenderer } = FreeBlockEngine;

const engine = new BlockEngine();
const renderer = new BlockRenderer(engine, 'blocks-container', {
  defaultLinkType: document.getElementById('linkTypeSelect').value,
  keyboardShortcuts: true, // Ctrl+Z/Y, Ctrl+A, Ctrl+D, Delete, arrow nudge
});

// ------------------------------------------------------------------ status

let statusTimer = null;

function updateStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

// ----------------------------------------------------------------- actions

function createNewBlock() {
  const content = prompt('Enter block content:');
  if (content !== null) {
    const block = engine.createBlock(content);
    renderer.scrollToBlock(block.id);
    updateStatus(`Block ${block.id.slice(0, 12)}... created`);
  }
}

function linkTypeChanged() {
  renderer.setDefaultLinkType(document.getElementById('linkTypeSelect').value);
}

function linkSelectedBlocks() {
  const linkType = document.getElementById('linkTypeSelect').value;
  if (renderer.linkSelected(linkType)) {
    updateStatus(`Blocks linked with ${linkType} connection`);
  } else {
    updateStatus('Select at least 2 blocks to link (Ctrl+click or lasso)');
  }
}

function arrangeBlocks() {
  engine.arrangeBlocks(3);
  renderer.zoomToFit();
  updateStatus('Blocks arranged');
}

function setViewMode(mode) {
  renderer.setViewMode(mode);
  document.getElementById('freeViewBtn').classList.toggle('active', mode === 'free');
  document.getElementById('gridViewBtn').classList.toggle('active', mode === 'grid');
  updateStatus(`Switched to ${mode} view`);
}

function searchBlocks() {
  const query = document.getElementById('searchInput').value;
  const blocks = document.querySelectorAll('#blocks-container .block');
  if (query) {
    const results = engine.searchBlocks(query);
    const ids = new Set(results.map((block) => block.id));
    blocks.forEach((el) => {
      el.style.opacity = ids.has(el.dataset.blockId) ? '1' : '0.3';
    });
    updateStatus(`Found ${results.length} blocks`);
  } else {
    blocks.forEach((el) => {
      el.style.opacity = '1';
    });
  }
}

// ------------------------------------------------------------- undo / redo

function undo() {
  engine.undo();
}

function redo() {
  engine.redo();
}

engine.on('historyChanged', ({ canUndo, canRedo }) => {
  document.getElementById('undoBtn').disabled = !canUndo;
  document.getElementById('redoBtn').disabled = !canRedo;
});

// -------------------------------------------------------------------- zoom

function zoomIn() {
  renderer.zoomBy(1.2);
}

function zoomOut() {
  renderer.zoomBy(1 / 1.2);
}

function zoomFit() {
  renderer.zoomToFit();
}

renderer.onCameraChange = (camera) => {
  document.getElementById('zoomLabel').textContent = `${Math.round(camera.zoom * 100)}%`;
};

// --------------------------------------------------------------- read-only

function toggleReadOnly() {
  const readOnly = document.getElementById('readOnlyToggle').checked;
  renderer.setReadOnly(readOnly);
  updateStatus(readOnly ? 'Read-only mode enabled' : 'Editing enabled');
}

// ----------------------------------------------------------- import/export

function exportData() {
  const data = engine.exportToJSON();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blocks_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  updateStatus('Data exported');
}

function importData() {
  document.getElementById('importFile').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (engine.importFromJSON(e.target.result)) {
      renderer.zoomToFit();
      updateStatus('Data imported successfully');
    } else {
      updateStatus('Import failed: invalid file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ---------------------------------------------------------------- keyboard

// Undo/redo, duplicate, delete, select-all and arrow nudging come from the
// renderer's built-in `keyboardShortcuts` option; only the app-specific
// "link selected" hotkey lives in the demo.
document.addEventListener('keydown', (e) => {
  const inEditor =
    e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if ((e.ctrlKey || e.metaKey) && !inEditor && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    linkSelectedBlocks();
  }
});

// Expose toolbar handlers referenced from inline onclick attributes.
Object.assign(window, {
  createNewBlock,
  linkTypeChanged,
  linkSelectedBlocks,
  arrangeBlocks,
  setViewMode,
  searchBlocks,
  undo,
  redo,
  zoomIn,
  zoomOut,
  zoomFit,
  toggleReadOnly,
  exportData,
  importData,
  handleImport,
});

// ------------------------------------------------------------- sample data

window.addEventListener('DOMContentLoaded', () => {
  const block1 = engine.createBlock(
    'Project Overview\n\nThis is the main project hub with links to all components.',
    'note',
    { x: 400, y: 100 }
  );
  const block2 = engine.createBlock(
    'Task 1: Design UI\n\nCreate mockups and wireframes for the user interface.',
    'task',
    { x: 60, y: 320 }
  );
  const block3 = engine.createBlock(
    'Task 2: Backend API\n\nDevelop RESTful API endpoints for data management.',
    'task',
    { x: 400, y: 320 }
  );
  const block4 = engine.createBlock(
    'Task 3: Testing\n\nWrite unit tests and integration tests.',
    'task',
    { x: 740, y: 320 }
  );
  const block5 = engine.createBlock(
    'Resources\n\n- Documentation\n- API Reference\n- Design Guidelines',
    'note',
    { x: 230, y: 540 }
  );
  const block6 = engine.createBlock(
    'Dependencies\n\nExternal libraries and frameworks used in the project.',
    'note',
    { x: 570, y: 540 }
  );

  engine.linkBlocks(block1.id, block2.id, 'single', 'plans');
  engine.linkBlocks(block1.id, block3.id, 'single', 'plans');
  engine.linkBlocks(block1.id, block4.id, 'single', 'plans');
  engine.linkBlocks(block2.id, block3.id, 'single', 'before');
  engine.linkBlocks(block3.id, block4.id, 'single', 'before');
  engine.linkBlocks(block5.id, block1.id, 'reverse');
  engine.linkBlocks(block6.id, block3.id, 'double', 'uses');

  engine.clearHistory(); // sample data should not be undoable
  updateStatus('Welcome! Click a connection line to edit it.');

  setTimeout(() => {
    const helpText = document.querySelector('.help-text');
    if (helpText) {
      helpText.style.opacity = '0';
      helpText.style.transition = 'opacity 0.5s';
      setTimeout(() => helpText.remove(), 500);
    }
  }, 12000);
});
