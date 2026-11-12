const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
// Windows Terminal abre PowerShell en el perfil del usuario de forma predeterminada.
const defaultTerminalDirectory = process.platform === 'win32'
  ? (process.env.USERPROFILE || os.homedir())
  : os.homedir();
const configDirectory = process.env.AURENTERMKIT_CONFIG_DIR
  ? path.resolve(process.env.AURENTERMKIT_CONFIG_DIR)
  : path.join(root, 'data');
const dataFile = path.join(configDirectory, 'collections.json');
const isWindows = process.platform === 'win32';
let data;
let selectedCollection = 0;
let selectedTask = 0;
let selectedSession = 0;
let focus = 'collections';
let message;
let inputMode = false;
let ctrlCArmedUntil = 0;
let shuttingDown = false;
let alternateScreen = false;
const sessions = [];

function load() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  if (!fs.existsSync(dataFile)) { data = { language: 'en', collections: [] }; save(); }
  else {
    try { data = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
    catch (error) { console.error(`No se pudo leer la configuración ${dataFile}: ${error.message}`); process.exit(1); }
  }
  if (!['en', 'es'].includes(data.language)) data.language = 'en';
  if (!Array.isArray(data.collections)) data.collections = [];
  data.collections.forEach(collection => { if (!Array.isArray(collection.tasks)) collection.tasks = []; });
  message = t('emptyCollections');
}
function save() { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n', 'utf8'); }
const translations = {
  en: {
    emptyCollections: 'No collections. Press N to create one.', collections: 'COLLECTIONS', tasks: 'TASKS', sessions: 'TERMINALS',
    createCollection: '+ Create collection  N', createTask: '+ Create task  N', noProcesses: 'No processes yet',
    selectSession: 'Select a terminal to view its output.', runForLogs: 'Run a task to see live logs.', running: 'RUNNING', ready: 'READY', logs: 'LOGS', liveOutput: 'LIVE OUTPUT',
    hintsCollections: '↑↓ move · Enter open · A run all · N new · E edit · D delete',
    hintsTasks: '↑↓ move · Enter run · V VS Code · A run all · N new · E edit · D delete',
    hintsSessions: '↑↓ move · X stop · C clear finished',
    footer: 'Tab switch panel · ←/→ switch collection · Ctrl+C twice to exit',
    noCollectionTasks: 'Collection «{name}» created. Press N to add a task.',
    createCancelled: 'Creation cancelled. AurenTermKit is still open.', taskSaved: 'Task «{name}» saved with {count} command(s).',
    editorTitle: 'TASK EDITOR · Enter one command per line.', shortcuts: 'SHORTCUTS: Tab completes paths · ↑/↓ recalls previous commands.',
    saveExisting: 'SAVE: type save and press Enter. If you entered no new commands, the existing commands are kept.',
    saveNew: 'SAVE: type save and press Enter after the last command.', saveEmpty: 'You can also press Enter on an empty line to save.',
    collectionName: 'Collection name', taskName: 'Task name', name: 'Name', description: 'Description',
    replaceCommands: 'Replace current commands? (y/N)', nameRequired: 'Name cannot be empty.',
    collectionUpdated: 'Collection settings updated.', taskUpdated: 'Settings for «{name}» updated.',
    noChanges: 'Changes not saved: name and at least one command are required.',
    deleteCollection: 'Type DELETE to remove «{name}» and its tasks', deleteTask: 'Type DELETE to remove «{name}»',
    deleteCancelled: 'Deletion cancelled.', collectionDeleted: 'Collection deleted.', taskDeleted: 'Task deleted.',
    missingFolder: 'Folder does not exist: {path}.', selectTask: 'Select a task first.',
    missingFinalFolder: 'Final folder does not exist: {path}.', vscodeError: 'Could not open VS Code: {error}',
    openingCode: 'Opening VS Code in {path}', taskStartError: 'Could not start {name}.',
    executing: 'Running «{name}» in this terminal.', taskStatus: '{name}: {status}.',
    selectActive: 'Select an active terminal to stop.', stopping: 'Stopping «{name}» and its child processes…',
    stopFromSessions: 'Press Tab until TERMINALS is focused, then select a session.',
    emptyTaskList: 'This collection has no tasks.', runAll: 'Starting {count} tasks in «{name}»…',
    finishedCleared: 'Finished terminals removed from the view.', exiting: 'Press Ctrl+C again within 2.5 seconds to exit.',
    keepOpen: 'AurenTermKit is still open. Use Ctrl+C to exit.', collectionSelected: 'Collection selected.',
    selectTaskToRun: 'Select a task to run.', emptyCollection: 'Collection is empty: press N to create a task.',
    stoppedSessions: 'Closing {count} terminal(s) and their processes…',
    settings: 'SETTINGS', language: 'Language', english: 'English', spanish: 'Spanish', languageChanged: 'Language set to {language}.',
    languagePrompt: 'Language: en = English, es = Spanish', languageChoiceError: 'Enter en or es.', unsupportedTerminal: 'AurenTermKit needs an interactive terminal.', saveCommandsError: 'Task not saved: enter at least one command.'
  },
  es: {
    emptyCollections: 'No hay colecciones. Pulsa N para crear una.', collections: 'COLECCIONES', tasks: 'TAREAS', sessions: 'TERMINALES',
    createCollection: '+ Crear colección  N', createTask: '+ Crear tarea  N', noProcesses: 'Aún no hay procesos',
    selectSession: 'Selecciona una terminal para ver su salida.', runForLogs: 'Ejecuta una tarea para ver logs en vivo.', running: 'EN EJECUCIÓN', ready: 'LISTO', logs: 'REGISTROS', liveOutput: 'SALIDA EN VIVO',
    hintsCollections: '↑↓ navegar · Enter abrir · A iniciar todo · N crear · E editar · D borrar',
    hintsTasks: '↑↓ navegar · Enter ejecutar · V VS Code · A iniciar todo · N crear · E editar · D borrar',
    hintsSessions: '↑↓ navegar · X detener · C limpiar finalizados',
    footer: 'Tab cambia panel · ←/→ cambia colección · Ctrl+C dos veces sale',
    noCollectionTasks: 'Colección «{name}» creada. Pulsa N para agregar una tarea.',
    createCancelled: 'Creación cancelada. AurenTermKit sigue abierto.', taskSaved: 'Tarea «{name}» guardada con {count} comando(s).',
    editorTitle: 'EDITOR DE TAREA · Escribe un comando por línea.', shortcuts: 'ATAJOS: Tab autocompleta rutas · ↑/↓ recupera comandos anteriores.',
    saveExisting: 'GUARDAR: escribe save y pulsa Enter. Si no escribiste comandos nuevos, se conservan los anteriores.',
    saveNew: 'GUARDAR: escribe save y pulsa Enter después del último comando.', saveEmpty: 'También puedes pulsar Enter en una línea vacía para guardar.',
    collectionName: 'Nombre de la colección', taskName: 'Nombre de la tarea', name: 'Nombre', description: 'Descripción',
    replaceCommands: '¿Reemplazar los comandos actuales? (s/N)', nameRequired: 'El nombre no puede quedar vacío.',
    collectionUpdated: 'Configuración de colección actualizada.', taskUpdated: 'Configuración de «{name}» actualizada.',
    noChanges: 'No guardé los cambios: nombre y comando son obligatorios.',
    deleteCollection: 'Escribe ELIMINAR para borrar «{name}» y sus tareas', deleteTask: 'Escribe ELIMINAR para borrar «{name}»',
    deleteCancelled: 'Eliminación cancelada.', collectionDeleted: 'Colección eliminada.', taskDeleted: 'Tarea eliminada.',
    missingFolder: 'No existe la carpeta {path}.', selectTask: 'Selecciona una tarea primero.',
    missingFinalFolder: 'No existe la carpeta final {path}.', vscodeError: 'No pude abrir VS Code: {error}',
    openingCode: 'Abriendo VS Code en {path}', taskStartError: 'No se pudo iniciar {name}.',
    executing: 'Ejecutando «{name}» en esta terminal.', taskStatus: '{name}: {status}.',
    selectActive: 'Selecciona un terminal activo para detenerlo.', stopping: 'Deteniendo «{name}» y sus procesos hijos…',
    stopFromSessions: 'Pulsa Tab hasta enfocar TERMINALES y selecciona una sesión.',
    emptyTaskList: 'Esta colección no tiene tareas.', runAll: 'Iniciando las {count} tareas de «{name}»…',
    finishedCleared: 'Terminales finalizados eliminados de la vista.', exiting: 'Pulsa Ctrl+C otra vez en 2.5 segundos para salir.',
    keepOpen: 'AurenTermKit sigue abierto. Para salir usa Ctrl+C.', collectionSelected: 'Colección seleccionada.',
    selectTaskToRun: 'Selecciona una tarea para ejecutarla.', emptyCollection: 'Colección vacía: pulsa N para crear tarea.',
    stoppedSessions: 'Cerrando {count} terminal(es) y sus procesos…',
    settings: 'CONFIGURACIÓN', language: 'Idioma', english: 'Inglés', spanish: 'Español', languageChanged: 'Idioma cambiado a {language}.',
    languagePrompt: 'Idioma: en = inglés, es = español', languageChoiceError: 'Escribe en o es.', unsupportedTerminal: 'AurenTermKit necesita una terminal interactiva.', saveCommandsError: 'No guardé la tarea: escribe al menos un comando.'
  }
};
function t(key, values = {}) {
  const template = translations[data?.language === 'es' ? 'es' : 'en'][key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
function currentCollection() { return data.collections[selectedCollection]; }
function clampSelection() {
  if (!data.collections.length) selectedCollection = 0;
  else selectedCollection = Math.max(0, Math.min(selectedCollection, data.collections.length - 1));
  const tasks = currentCollection()?.tasks || [];
  selectedTask = tasks.length ? Math.max(0, Math.min(selectedTask, tasks.length - 1)) : 0;
}
function enterScreen() {
  if (alternateScreen) return;
  process.stdout.write('\x1b[?1049h\x1b[?25l');
  alternateScreen = true;
}
function leaveScreen() {
  if (!alternateScreen) return;
  process.stdout.write('\x1b[?25h\x1b[?1049l');
  alternateScreen = false;
}
function clear() {
  enterScreen();
  process.stdout.write('\x1b[2J\x1b[H');
}
function write(text = '') { process.stdout.write(text + '\n'); }
function restoreKeyInput() {
  enterScreen();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
}
const ansi = {
  reset: '\x1b[0m', dim: '\x1b[2;38;5;245m', muted: '\x1b[38;5;245m',
  cyan: '\x1b[38;5;81m', violet: '\x1b[38;5;141m', green: '\x1b[38;5;78m',
  amber: '\x1b[38;5;221m', red: '\x1b[38;5;203m', white: '\x1b[38;5;255m',
  bold: '\x1b[1m', inverse: '\x1b[7m'
};
const paint = (color, text) => `${color}${text}${ansi.reset}`;
const stripAnsi = text => text.replace(/\x1b\[[0-9;]*m/g, '');
function displayWidth(text) {
  return [...stripAnsi(String(text))].reduce((width, char) => width + (/\p{Mark}/u.test(char) ? 0 : /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(char) ? 2 : 1), 0);
}
function fit(text, width) {
  const plain = stripAnsi(String(text));
  if (displayWidth(plain) <= width) return `${text}${' '.repeat(Math.max(0, width - displayWidth(plain)))}`;
  let result = '', used = 0;
  for (const char of plain) {
    const size = displayWidth(char);
    if (used + size > Math.max(0, width - 1)) break;
    result += char; used += size;
  }
  return `${result}…${' '.repeat(Math.max(0, width - used - 1))}`;
}
function truncateMiddle(text, width) {
  const value = String(text || '');
  if (displayWidth(value) <= width) return value;
  if (width < 5) return fit(value, width).trimEnd();
  const keep = Math.floor((width - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-(width - keep - 1))}`;
}
function boxLine(left, right, leftWidth, rightWidth) {
  return `│ ${fit(left, leftWidth - 2)} │ ${fit(right, rightWidth - 2)} │`;
}
function panelTitle(title, width, active = false) {
  const color = active ? ansi.cyan : ansi.muted;
  const label = ` ${title} `;
  const remaining = Math.max(0, width - displayWidth(label));
  return `${paint(color, `┌${label}${'─'.repeat(remaining)}┐`)}`;
}
function render() {
  clampSelection(); clear();
  const terminalWidth = process.stdout.columns || 100;
  const terminalHeight = process.stdout.rows || 30;
  const width = Math.max(20, terminalWidth - 2);
  const collection = currentCollection();
  const left = [];
  const leftWidth = width >= 92 ? Math.floor(width * 0.34) : width >= 62 ? Math.floor(width * 0.42) : width;
  const rightWidth = width - leftWidth - 3;
  const compact = rightWidth < 24;
  const section = (title, active, count) => left.push(`${active ? paint(ansi.cyan, '▰') : paint(ansi.muted, '▱')} ${paint(active ? `${ansi.bold}${ansi.white}` : ansi.muted, title)} ${count !== undefined ? paint(ansi.dim, String(count)) : ''} ${active ? paint(ansi.cyan, '· ACTIVO') : ''}`);
  section(t('collections'), focus === 'collections', data.collections.length);
  if (!data.collections.length) left.push(paint(ansi.amber, `  ${t('createCollection')}`));
  data.collections.forEach((item, index) => {
    const selected = index === selectedCollection;
    const text = `${selected ? '› ' : '  '}${item.name}  ${paint(ansi.dim, String(item.tasks.length))}`;
    left.push(selected && focus === 'collections' ? paint(`${ansi.inverse}${ansi.violet}`, text) : text);
  });
  left.push('');
  section(t('tasks'), focus === 'tasks', collection?.tasks.length || 0);
  if (!collection?.tasks.length) left.push(paint(ansi.amber, `  ${t('createTask')}`));
  (collection?.tasks || []).forEach((task, index) => {
    const selected = index === selectedTask;
    const text = `${selected ? '› ' : '  '}${paint(ansi.green, '●')} ${task.name}`;
    left.push(selected && focus === 'tasks' ? paint(`${ansi.inverse}${ansi.violet}`, text) : text);
  });
  left.push('');
  const runningCount = sessions.filter(item => item.status === 'running').length;
  section(t('sessions'), focus === 'sessions', runningCount);
  if (!sessions.length) left.push(paint(ansi.dim, `  ${t('noProcesses')}`));
  sessions.forEach((session, index) => {
    const selected = index === selectedSession;
    const dot = session.status === 'running' ? paint(ansi.green, '●') : paint(ansi.muted, '●');
    const text = `${selected ? '› ' : '  '}${dot} ${session.taskName} ${paint(ansi.dim, `· ${session.status}`)}`;
    left.push(selected && focus === 'sessions' ? paint(`${ansi.inverse}${ansi.violet}`, text) : text);
  });

  const selectedSessionData = sessions[selectedSession];
  const right = [];
  if (selectedSessionData) {
    right.push(paint(ansi.dim, truncateMiddle(selectedSessionData.cwd, Math.max(8, rightWidth - 6))));
    const rawLines = selectedSessionData.output.map(line => stripAnsi(line));
    const wrapped = rawLines.flatMap(line => splitDisplayLine(line, Math.max(8, rightWidth - 6)));
    right.push(...wrapped.slice(-Math.max(4, terminalHeight - 15)));
  } else right.push(paint(ansi.dim, sessions.length ? t('selectSession') : t('runForLogs')));

  const status = runningCount ? paint(ansi.green, `● ${runningCount} ${t('running')}`) : paint(ansi.dim, `○ ${t('ready')}`);
  const title = `  ${paint(`${ansi.bold}${ansi.white}`, 'AUREN')} ${paint(ansi.cyan, '◆')} ${paint(ansi.dim, 'TERMKIT')}   ${paint(ansi.muted, truncateMiddle(collection?.name || 'Workspace', 22))}   ${status}`;
  write(title);
  write(paint(ansi.dim, `  ${'─'.repeat(Math.max(0, width - 2))}`));
  if (compact) {
    const heading = { collections: t('collections'), tasks: t('tasks'), sessions: t('sessions') }[focus];
    write(panelTitle(`${heading} · ${focus === 'collections' ? data.collections.length : focus === 'tasks' ? collection?.tasks.length || 0 : runningCount}`, width, true));
    const visible = left.slice(Math.max(0, left.length - Math.max(4, terminalHeight - 12)));
    const contentWidth = Math.max(1, width - 4);
    for (const line of visible) write(`│ ${fit(line, contentWidth)} │`);
    write(`└${'─'.repeat(Math.max(0, width - 1))}┘`);
    if (focus === 'sessions' && selectedSessionData) {
      write(panelTitle(`SALIDA · ${selectedSessionData.taskName}`, width));
      for (const line of right.slice(-Math.max(3, terminalHeight - visible.length - 13))) write(`│ ${fit(line, contentWidth)} │`);
    write(`└${'─'.repeat(Math.max(0, width - 1))}┘`);
    }
  } else {
    const leftTitle = focus === 'collections' ? t('collections') : focus === 'tasks' ? t('tasks') : t('sessions');
    const rightTitle = selectedSessionData ? `${t('logs')} · ${selectedSessionData.taskName}` : t('liveOutput');
    const bodyHeight = Math.max(3, Math.min(terminalHeight - 10, Math.max(left.length, right.length, 6)));
    write(`┌${'─'.repeat(leftWidth - 1)}┬${'─'.repeat(rightWidth - 1)}┐`);
    const leftHeader = ` ${leftTitle}  ${paint(ansi.dim, focus === 'collections' ? String(data.collections.length) : focus === 'tasks' ? String(collection?.tasks.length || 0) : String(sessions.length))}`;
    const rightHeader = ` ${rightTitle}`;
    write(boxLine(paint(ansi.cyan, leftHeader), paint(ansi.cyan, rightHeader), leftWidth, rightWidth));
    write(`├${'─'.repeat(leftWidth - 1)}┼${'─'.repeat(rightWidth - 1)}┤`);
    const leftVisible = left.slice(0, bodyHeight);
    const rightVisible = right.slice(-bodyHeight);
    for (let row = 0; row < bodyHeight; row++) write(boxLine(leftVisible[row] || '', rightVisible[row] || '', leftWidth, rightWidth));
    write(`└${'─'.repeat(leftWidth - 1)}┴${'─'.repeat(rightWidth - 1)}┘`);
  }
  const hints = focus === 'collections' ? t('hintsCollections') : focus === 'tasks' ? t('hintsTasks') : t('hintsSessions');
  write(`  ${paint(ansi.white, hints)}`);
  write(`  ${paint(ansi.dim, `${t('footer')}  ·  L ${t('language')}`)}`);
  write(`  ${paint(ansi.amber, message)}`);
}
function padDisplay(text, width) {
  return fit(text, width);
}
function splitDisplayLine(text, width) { if (!text) return ['']; const result = []; let line = '', size = 0; for (const char of text) { const charSize = displayWidth(char); if (size + charSize > width) { result.push(line); line = ''; size = 0; } line += char; size += charSize; } if (line) result.push(line); return result; }
function ask(label, initial = '') {
  return new Promise(resolve => {
    readline.emitKeypressEvents(process.stdin); if (process.stdin.isTTY) process.stdin.setRawMode(false);
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    prompt.question(`\n${label}${initial ? ` [${initial}]` : ''}: `, answer => {
      prompt.close(); restoreKeyInput();
      const value = answer.trim();
      resolve(value.toLowerCase() === 'exit' ? null : (value || initial));
    });
  });
}
async function createCollection() {
  const name = await ask(t('collectionName')); if (name === null) { message = t('createCancelled'); return; } if (!name) return;
  data.collections.push({ id: `${slug(name)}-${Date.now()}`, name, description: '', tasks: [] }); selectedCollection = data.collections.length - 1; selectedTask = 0; focus = 'tasks'; save(); message = t('noCollectionTasks', { name });
}
async function createTask() {
  const collection = currentCollection(); if (!collection) return;
  const name = await ask(t('taskName')); if (name === null) { message = t('createCancelled'); return; } if (!name) return;
  const cwd = defaultTerminalDirectory;
  const commands = await askCommands();
  if (!commands.length) { message = t('saveCommandsError'); return; }
  collection.tasks.push({ id: `${slug(name)}-${Date.now()}`, name, description: '', cwd, commands });
  selectedTask = collection.tasks.length - 1; save(); message = t('taskSaved', { name, count: commands.length });
}
async function askCommands(existing = []) {
  if (existing.length) {
    const replace = await ask(t('replaceCommands'), 'N');
    if (replace.toLowerCase() !== 's') return existing;
  }
  return new Promise(resolve => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    const commands = [];
    const prompt = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 100,
      completer: line => completePath(line, commands)
    });
    write(t('editorTitle'));
    write(t('shortcuts'));
    write(existing.length ? t('saveExisting') : t('saveNew'));
    write(t('saveEmpty'));
    const next = () => prompt.question(`PS ${defaultTerminalDirectory}> `, answer => {
      const value = answer.trim();
      if (!value || value.toLowerCase() === 'save') { prompt.close(); restoreKeyInput(); resolve(commands.length ? commands : existing); return; }
      commands.push(value); next();
    });
    next();
  });
}
function commandWorkingDirectory(commands, startDirectory = defaultTerminalDirectory) {
  let cwd = startDirectory;
  for (const command of commands) {
    const match = command.match(/^\s*(?:cd|set-location|push-location)\s+(?:-literalpath\s+|-path\s+)?(?:'([^']*)'|"([^"]*)"|([^;]+))\s*$/i);
    if (!match) continue;
    let target = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!target) continue;
    if (target === '~' || target.startsWith(`~${path.sep}`)) target = path.join(os.homedir(), target.slice(1));
    if (isWindows && /^\/home(?:\/|$)/i.test(target)) target = path.join(defaultTerminalDirectory, 'home', target.replace(/^\/home\/?/i, ''));
    const resolved = path.resolve(cwd, target);
    try { if (fs.statSync(resolved).isDirectory()) cwd = resolved; } catch { /* Ignore paths that do not resolve yet. */ }
  }
  return cwd;
}
function completePath(line, commands = []) {
  const cwd = commandWorkingDirectory(commands);
  const tokenStart = Math.max(line.lastIndexOf(' '), line.lastIndexOf('\t')) + 1;
  let token = line.slice(tokenStart).replace(/^['"]/, '');
  const commandPart = line.slice(0, tokenStart).trimStart().toLowerCase();
  const isLocationCommand = /^(cd|set-location|push-location)\s+/.test(commandPart);
  const npmRun = line.match(/^\s*npm\s+run\s+([^\s]*)$/i);
  if (npmRun) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      const names = Object.keys(pkg.scripts || {}).filter(name => name.toLowerCase().startsWith(npmRun[1].toLowerCase()));
      return [names.map(name => `${line.slice(0, line.length - npmRun[1].length)}${name}`), line];
    } catch { return [[], line]; }
  }
  if (!isLocationCommand && !/[\\/]/.test(token)) return [[], line];

  // Map Unix-style /home/... input to the user's Windows home subfolder.
  let lookup = token;
  if (isWindows && /^\/home(?:\/|$)/i.test(lookup)) {
    lookup = path.join(defaultTerminalDirectory, 'home', lookup.replace(/^\/home\/?/i, ''));
  } else if (isWindows && /^\/users\/[^/]+(?:\/|$)/i.test(lookup)) {
    lookup = path.join(defaultTerminalDirectory, lookup.replace(/^\/users\/[^/]+\/?/i, ''));
  }
  lookup = lookup.replace(/["']/g, '');
  const hasSeparator = /[\\/]/.test(lookup);
  const directoryPart = hasSeparator ? path.dirname(lookup) : cwd;
  const partial = hasSeparator ? path.basename(lookup) : lookup;
  const directory = path.resolve(cwd, directoryPart || '.');
  try {
    const candidates = fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.name.toLowerCase().startsWith(partial.toLowerCase()))
      .map(entry => {
        const completed = path.join(directoryPart === '.' ? '' : directoryPart, entry.name);
        const normalized = isWindows ? completed.replace(/\\/g, '/') : completed;
        const relative = !hasSeparator && isLocationCommand ? `./${entry.name}` : normalized;
        return line.slice(0, tokenStart) + relative + (entry.isDirectory() ? (isWindows ? '/' : path.sep) : '');
      });
    return [candidates, line];
  } catch { return [[], line]; }
}
async function editCollection() {
  const collection = currentCollection(); if (!collection) return;
  const name = await ask(t('name'), collection.name);
  const description = await ask(t('description'), collection.description || '');
  if (!name) { message = t('nameRequired'); return; }
  collection.name = name; collection.description = description; save(); message = t('collectionUpdated');
}
async function editTask() {
  const task = currentCollection()?.tasks[selectedTask]; if (!task) return;
  const name = await ask(t('name'), task.name);
  const description = await ask(t('description'), task.description || '');
  const commands = await askCommands(task.commands);
  if (!name || !commands.length) { message = t('noChanges'); return; }
  task.name = name; task.description = description; task.commands = commands; save(); message = t('taskUpdated', { name });
}
async function editSettings(editCollectionInstead = false) { if (editCollectionInstead || focus === 'collections' || !currentCollection()?.tasks.length) await editCollection(); else await editTask(); }
async function changeLanguage() {
  const language = await ask(t('languagePrompt'), data.language);
  if (!language) return;
  const normalized = language.toLowerCase();
  if (!['en', 'es'].includes(normalized)) { message = t('languageChoiceError'); return; }
  data.language = normalized; save();
  message = t('languageChanged', { language: t(normalized === 'en' ? 'english' : 'spanish') });
}
async function deleteSelected() {
  if (focus === 'collections') {
    const collection = currentCollection(); if (!collection) return;
    const answer = await ask(t('deleteCollection', { name: collection.name }));
    if (answer !== (data.language === 'es' ? 'ELIMINAR' : 'DELETE')) { message = t('deleteCancelled'); return; }
    data.collections.splice(selectedCollection, 1); selectedCollection = Math.max(0, selectedCollection - 1); save(); message = t('collectionDeleted');
  } else {
    const collection = currentCollection(), task = collection?.tasks[selectedTask]; if (!task) return;
    const answer = await ask(t('deleteTask', { name: task.name }));
    if (answer !== (data.language === 'es' ? 'ELIMINAR' : 'DELETE')) { message = t('deleteCancelled'); return; }
    collection.tasks.splice(selectedTask, 1); selectedTask = Math.max(0, selectedTask - 1); save(); message = t('taskDeleted');
  }
}
function slug(value) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
function taskCwd(task) {
  const resolved = path.resolve(task.cwd || defaultTerminalDirectory);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error(t('missingFolder', { path: task.cwd }));
  return resolved;
}
function launch(task) {
  let cwd; try { cwd = taskCwd(task); } catch (error) { message = error.message; render(); return; }
  const session = { taskName: task.name, cwd, status: 'running', output: [], child: null };
  sessions.push(session); selectedSession = sessions.length - 1;
  const shell = isWindows ? 'cmd.exe' : (process.env.SHELL || 'bash');
  const script = task.commands.join(isWindows ? ' && ' : '\n');
  const args = isWindows ? ['/d', '/s', '/c', script] : ['-lc', script];
  const child = spawn(shell, args, { cwd, detached: !isWindows, windowsHide: true, env: process.env }); session.child = child;
  child.stdout.on('data', chunk => appendOutput(session, chunk));
  child.stderr.on('data', chunk => appendOutput(session, chunk, true));
  child.on('error', error => { session.status = 'error'; appendOutput(session, error.message, true); message = t('taskStartError', { name: task.name }); render(); });
  child.on('close', code => {
    session.status = session.status === 'deteniendo' ? 'detenido' : code === 0 ? 'finalizado' : `error ${code ?? ''}`.trim();
    message = t('taskStatus', { name: task.name, status: session.status }); render();
  });
  message = t('executing', { name: task.name }); render();
}
function openTaskInVSCode() {
  const task = currentCollection()?.tasks[selectedTask];
  if (!task) { message = t('selectTask'); return render(); }
  try {
    const taskBase = taskCwd(task);
    const cwd = commandWorkingDirectory(task.commands, taskBase);
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(t('missingFinalFolder', { path: cwd }));
    const child = isWindows
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'code .'], { cwd, detached: true, stdio: 'ignore', windowsHide: true })
      : spawn('code', ['.'], { cwd, detached: true, stdio: 'ignore' });
    child.on('error', error => { message = t('vscodeError', { error: error.message }); render(); });
    child.unref(); message = t('openingCode', { path: cwd });
  } catch (error) { message = error.message; }
  render();
}
function appendOutput(session, chunk, isError = false) {
  const lines = chunk.toString().replace(/\r/g, '').split('\n').filter(Boolean);
  for (const line of lines) session.output.push(`${isError ? '\x1b[31m' : ''}${line.slice(0, 300)}${isError ? '\x1b[0m' : ''}`);
  if (session.output.length > 80) session.output.splice(0, session.output.length - 80);
  if (sessions[selectedSession] === session) render();
}
function stopSelectedSession() {
  const session = sessions[selectedSession];
  if (!session || session.status !== 'running') { message = t('selectActive'); return render(); }
  message = t('stopping', { name: session.taskName }); render();
  terminateSession(session).then(() => render());
}
function terminateSession(session) {
  if (session.termination) return session.termination;
  if (!session.child || session.child.exitCode !== null) { session.status = 'detenido'; return Promise.resolve(); }
  session.status = 'deteniendo';
  session.termination = new Promise(resolve => {
    const child = session.child;
    let finished = false;
    const done = () => { if (finished) return; finished = true; clearTimeout(timer); session.status = 'detenido'; resolve(); };
    child.once('close', done);
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); done(); }, 4000);
    if (isWindows) {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Process group already exited. */ } }, 700).unref();
    }
  });
  return session.termination;
}
async function runAll() {
  const tasks = currentCollection()?.tasks || [];
  if (!tasks.length) { message = t('emptyTaskList'); return render(); }
  focus = 'sessions';
  message = t('runAll', { count: tasks.length, name: currentCollection().name });
  for (const task of tasks) launch(task);
}
function clearFinished() {
  for (let index = sessions.length - 1; index >= 0; index--) if (sessions[index].status !== 'running') sessions.splice(index, 1);
  selectedSession = Math.max(0, sessions.length - 1); message = t('finishedCleared'); render();
}
function exit() { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); leaveScreen(); process.exit(0); }
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const active = sessions.filter(session => session.status === 'running' || session.status === 'deteniendo');
  if (active.length) {
    message = t('stoppedSessions', { count: active.length });
    render();
    await Promise.all(active.map(terminateSession));
  }
  exit();
}
function onKey(_str, key) {
  if (shuttingDown) return;
  if (key.ctrl && key.name === 'c') {
    const now = Date.now();
    if (now <= ctrlCArmedUntil) return shutdown();
    ctrlCArmedUntil = now + 2500;
    message = t('exiting');
    render();
    return;
  }
  if (key.name === 'q' || key.name === 'escape') { message = t('keepOpen'); render(); return; }
  if (inputMode) return;
  if (key.name === 'tab') { focus = focus === 'collections' ? 'tasks' : focus === 'tasks' ? 'sessions' : 'collections'; render(); return; }
  if (key.name === 'left' || key.name === 'right') {
    const count = data.collections.length;
    if (count) selectedCollection = (selectedCollection + (key.name === 'left' ? -1 : 1) + count) % count;
    selectedTask = 0; focus = 'collections'; message = t('collectionSelected'); render(); return;
  }
  if (key.name === 'up' || key.name === 'down') {
    const delta = key.name === 'up' ? -1 : 1;
    const taskCount = currentCollection()?.tasks.length || 0;
    if (focus === 'collections' && data.collections.length) selectedCollection = (selectedCollection + delta + data.collections.length) % data.collections.length;
    else if (focus === 'tasks' && taskCount) selectedTask = (selectedTask + delta + taskCount) % taskCount;
    else if (focus === 'sessions' && sessions.length) selectedSession = (selectedSession + delta + sessions.length) % sessions.length;
    render(); return;
  }
  if (key.name === 'return') {
    if (focus === 'collections') { focus = 'tasks'; selectedTask = 0; message = currentCollection()?.tasks.length ? t('selectTaskToRun') : t('emptyCollection'); render(); return; }
    if (focus === 'tasks' && currentCollection()?.tasks[selectedTask]) launch(currentCollection().tasks[selectedTask]); return;
  }
  if (key.name === 'n') { inputMode = true; const action = focus === 'collections' || !currentCollection() ? createCollection() : createTask(); action.finally(() => { inputMode = false; render(); }); return; }
  if (key.name === 'e') { inputMode = true; editSettings().finally(() => { inputMode = false; render(); }); return; }
  if (key.name === 'd' && (focus === 'collections' || !currentCollection()?.tasks.length)) { inputMode = true; const oldFocus = focus; focus = 'collections'; deleteSelected().finally(() => { focus = oldFocus; inputMode = false; render(); }); return; }
  if (key.name === 'd') { inputMode = true; deleteSelected().finally(() => { inputMode = false; render(); }); return; }
  if (key.name === 'a') return runAll();
  if (key.name === 'v' && focus === 'tasks') return openTaskInVSCode();
  if (key.name === 'x') { if (focus !== 'sessions') { message = t('stopFromSessions'); return render(); } return stopSelectedSession(); }
  if (key.name === 'c') return clearFinished();
  if (key.name === 'l') { inputMode = true; changeLanguage().finally(() => { inputMode = false; render(); }); return; }
}

load();
readline.emitKeypressEvents(process.stdin);
if (!process.stdin.isTTY) { console.error('AurenTermKit necesita una terminal interactiva. Ejecuta npm start desde CMD, PowerShell o una terminal.'); process.exit(1); }
process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('keypress', onKey);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => { if (process.stdin.isTTY) process.stdin.setRawMode(false); leaveScreen(); });
render();
