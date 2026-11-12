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
let message = 'No hay colecciones. Pulsa N para crear una.';
let inputMode = false;
let ctrlCArmedUntil = 0;
let shuttingDown = false;
let alternateScreen = false;
const sessions = [];

function load() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  if (!fs.existsSync(dataFile)) { data = { collections: [] }; save(); }
  else {
    try { data = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
    catch (error) { console.error(`No se pudo leer la configuración ${dataFile}: ${error.message}`); process.exit(1); }
  }
  if (!Array.isArray(data.collections)) data.collections = [];
  data.collections.forEach(collection => { if (!Array.isArray(collection.tasks)) collection.tasks = []; });
}
function save() { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n', 'utf8'); }
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
  section('COLECCIONES', focus === 'collections', data.collections.length);
  if (!data.collections.length) left.push(paint(ansi.amber, '  + Crear colección  N'));
  data.collections.forEach((item, index) => {
    const selected = index === selectedCollection;
    const text = `${selected ? '› ' : '  '}${item.name}  ${paint(ansi.dim, String(item.tasks.length))}`;
    left.push(selected && focus === 'collections' ? paint(`${ansi.inverse}${ansi.violet}`, text) : text);
  });
  left.push('');
  section('TAREAS', focus === 'tasks', collection?.tasks.length || 0);
  if (!collection?.tasks.length) left.push(paint(ansi.amber, '  + Crear tarea  N'));
  (collection?.tasks || []).forEach((task, index) => {
    const selected = index === selectedTask;
    const text = `${selected ? '› ' : '  '}${paint(ansi.green, '●')} ${task.name}`;
    left.push(selected && focus === 'tasks' ? paint(`${ansi.inverse}${ansi.violet}`, text) : text);
  });
  left.push('');
  const runningCount = sessions.filter(item => item.status === 'running').length;
  section('SESIONES', focus === 'sessions', runningCount);
  if (!sessions.length) left.push(paint(ansi.dim, '  Aún no hay procesos'));
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
  } else right.push(paint(ansi.dim, sessions.length ? 'Selecciona una sesión para ver su salida.' : 'Ejecuta una tarea para ver logs en vivo.'));

  const status = runningCount ? paint(ansi.green, `● ${runningCount} EN EJECUCIÓN`) : paint(ansi.dim, '○ LISTO');
  const title = `  ${paint(`${ansi.bold}${ansi.white}`, 'AUREN')} ${paint(ansi.cyan, '◆')} ${paint(ansi.dim, 'TERMKIT')}   ${paint(ansi.muted, truncateMiddle(collection?.name || 'Workspace', 22))}   ${status}`;
  write(title);
  write(paint(ansi.dim, `  ${'─'.repeat(Math.max(0, width - 2))}`));
  if (compact) {
    const heading = { collections: 'COLECCIONES', tasks: 'TAREAS', sessions: 'SESIONES' }[focus];
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
    const leftTitle = focus === 'collections' ? 'COLECCIONES' : focus === 'tasks' ? 'TAREAS' : 'SESIONES';
    const rightTitle = selectedSessionData ? `SALIDA · ${selectedSessionData.taskName}` : 'SALIDA EN VIVO';
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
  const hints = focus === 'collections' ? '↑↓ navegar · Enter abrir · A iniciar todo · N crear · E editar · D borrar' : focus === 'tasks' ? '↑↓ navegar · Enter ejecutar · V VS Code · A iniciar todo · N crear · E editar · D borrar' : '↑↓ navegar · X detener · C limpiar finalizados';
  write(`  ${paint(ansi.white, hints)}`);
  write(`  ${paint(ansi.dim, 'Tab cambia panel  ·  ←/→ cambia colección  ·  Ctrl+C dos veces sale')}`);
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
  const name = await ask('Nombre de la colección'); if (name === null) { message = 'Creación cancelada. AurenTermKit sigue abierto.'; return; } if (!name) return;
  data.collections.push({ id: `${slug(name)}-${Date.now()}`, name, description: '', tasks: [] }); selectedCollection = data.collections.length - 1; selectedTask = 0; focus = 'tasks'; save(); message = `Colección «${name}» creada. Pulsa N para agregar una tarea.`;
}
async function createTask() {
  const collection = currentCollection(); if (!collection) return;
  const name = await ask('Nombre de la tarea'); if (name === null) { message = 'Creación cancelada. AurenTermKit sigue abierto.'; return; } if (!name) return;
  const cwd = defaultTerminalDirectory;
  const commands = await askCommands();
  if (!commands.length) { message = 'No guardé la tarea: pega al menos un comando.'; return; }
  collection.tasks.push({ id: `${slug(name)}-${Date.now()}`, name, description: '', cwd, commands });
  selectedTask = collection.tasks.length - 1; save(); message = `Tarea «${name}» guardada con ${commands.length} comando${commands.length === 1 ? '' : 's'}.`;
}
async function askCommands(existing = []) {
  if (existing.length) {
    const replace = await ask('¿Reemplazar los comandos actuales? (s/N)', 'N');
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
    write('EDITOR DE TAREA · Escribe un comando por línea.');
    write('ATAJOS: Tab autocompleta rutas · ↑/↓ recupera comandos anteriores.');
    write(existing.length
      ? 'GUARDAR: escribe save y pulsa Enter. Si no escribiste comandos nuevos, se conservan los anteriores.'
      : 'GUARDAR: escribe save y pulsa Enter después del último comando.');
    write('También puedes pulsar Enter en una línea vacía para guardar.');
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
  const name = await ask('Nombre', collection.name);
  const description = await ask('Descripción', collection.description || '');
  if (!name) { message = 'El nombre no puede quedar vacío.'; return; }
  collection.name = name; collection.description = description; save(); message = 'Configuración de colección actualizada.';
}
async function editTask() {
  const task = currentCollection()?.tasks[selectedTask]; if (!task) return;
  const name = await ask('Nombre', task.name);
  const description = await ask('Descripción', task.description || '');
  const commands = await askCommands(task.commands);
  if (!name || !commands.length) { message = 'No guardé los cambios: nombre y comando son obligatorios.'; return; }
  task.name = name; task.description = description; task.commands = commands; save(); message = `Configuración de «${name}» actualizada.`;
}
async function editSettings(editCollectionInstead = false) { if (editCollectionInstead || focus === 'collections' || !currentCollection()?.tasks.length) await editCollection(); else await editTask(); }
async function deleteSelected() {
  if (focus === 'collections') {
    const collection = currentCollection(); if (!collection) return;
    const answer = await ask(`Escribe ELIMINAR para borrar «${collection.name}» y sus tareas`);
    if (answer !== 'ELIMINAR') { message = 'Eliminación cancelada.'; return; }
    data.collections.splice(selectedCollection, 1); selectedCollection = Math.max(0, selectedCollection - 1); save(); message = 'Colección eliminada.';
  } else {
    const collection = currentCollection(), task = collection?.tasks[selectedTask]; if (!task) return;
    const answer = await ask(`Escribe ELIMINAR para borrar «${task.name}»`);
    if (answer !== 'ELIMINAR') { message = 'Eliminación cancelada.'; return; }
    collection.tasks.splice(selectedTask, 1); selectedTask = Math.max(0, selectedTask - 1); save(); message = 'Tarea eliminada.';
  }
}
function slug(value) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
function taskCwd(task) {
  const resolved = path.resolve(task.cwd || defaultTerminalDirectory);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error(`No existe la carpeta ${task.cwd}.`);
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
  child.on('error', error => { session.status = 'error'; appendOutput(session, error.message, true); message = `No se pudo iniciar ${task.name}.`; render(); });
  child.on('close', code => {
    session.status = session.status === 'deteniendo' ? 'detenido' : code === 0 ? 'finalizado' : `error ${code ?? ''}`.trim();
    message = `${task.name}: ${session.status}.`; render();
  });
  message = `Ejecutando «${task.name}» en esta terminal.`; render();
}
function openTaskInVSCode() {
  const task = currentCollection()?.tasks[selectedTask];
  if (!task) { message = 'Selecciona una tarea primero.'; return render(); }
  try {
    const taskBase = taskCwd(task);
    const cwd = commandWorkingDirectory(task.commands, taskBase);
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`No existe la carpeta final ${cwd}.`);
    const child = isWindows
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'code .'], { cwd, detached: true, stdio: 'ignore', windowsHide: true })
      : spawn('code', ['.'], { cwd, detached: true, stdio: 'ignore' });
    child.on('error', error => { message = `No pude abrir VS Code: ${error.message}`; render(); });
    child.unref(); message = `Abriendo VS Code en ${cwd}`;
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
  if (!session || session.status !== 'running') { message = 'Selecciona un terminal activo para detenerlo.'; return render(); }
  message = `Deteniendo «${session.taskName}» y sus procesos hijos…`; render();
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
  if (!tasks.length) { message = 'Esta colección no tiene tareas.'; return render(); }
  focus = 'sessions';
  message = `Iniciando las ${tasks.length} tareas de «${currentCollection().name}»…`;
  for (const task of tasks) launch(task);
}
function clearFinished() {
  for (let index = sessions.length - 1; index >= 0; index--) if (sessions[index].status !== 'running') sessions.splice(index, 1);
  selectedSession = Math.max(0, sessions.length - 1); message = 'Terminales finalizados eliminados de la vista.'; render();
}
function exit() { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); leaveScreen(); process.exit(0); }
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const active = sessions.filter(session => session.status === 'running' || session.status === 'deteniendo');
  if (active.length) {
    message = `Cerrando ${active.length} terminal${active.length === 1 ? '' : 'es'} y sus procesos…`;
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
    message = 'Pulsa Ctrl+C otra vez en 2.5 segundos para salir.';
    render();
    return;
  }
  if (key.name === 'q' || key.name === 'escape') { message = 'AurenTermKit sigue abierto. Para salir usa Ctrl+C.'; render(); return; }
  if (inputMode) return;
  if (key.name === 'tab') { focus = focus === 'collections' ? 'tasks' : focus === 'tasks' ? 'sessions' : 'collections'; render(); return; }
  if (key.name === 'left' || key.name === 'right') {
    const count = data.collections.length;
    if (count) selectedCollection = (selectedCollection + (key.name === 'left' ? -1 : 1) + count) % count;
    selectedTask = 0; focus = 'collections'; message = 'Colección seleccionada.'; render(); return;
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
    if (focus === 'collections') { focus = 'tasks'; selectedTask = 0; message = currentCollection()?.tasks.length ? 'Selecciona una tarea para ejecutarla.' : 'Colección vacía: pulsa N para crear tarea.'; render(); return; }
    if (focus === 'tasks' && currentCollection()?.tasks[selectedTask]) launch(currentCollection().tasks[selectedTask]); return;
  }
  if (key.name === 'n') { inputMode = true; const action = focus === 'collections' || !currentCollection() ? createCollection() : createTask(); action.finally(() => { inputMode = false; render(); }); return; }
  if (key.name === 'e') { inputMode = true; editSettings().finally(() => { inputMode = false; render(); }); return; }
  if (key.name === 'd' && (focus === 'collections' || !currentCollection()?.tasks.length)) { inputMode = true; const oldFocus = focus; focus = 'collections'; deleteSelected().finally(() => { focus = oldFocus; inputMode = false; render(); }); return; }
  if (key.name === 'd') { inputMode = true; deleteSelected().finally(() => { inputMode = false; render(); }); return; }
  if (key.name === 'a') return runAll();
  if (key.name === 'v' && focus === 'tasks') return openTaskInVSCode();
  if (key.name === 'x') { if (focus !== 'sessions') { message = 'Pulsa Tab hasta enfocar TERMINALES y selecciona una sesión.'; return render(); } return stopSelectedSession(); }
  if (key.name === 'c') return clearFinished();
}

load();
readline.emitKeypressEvents(process.stdin);
if (!process.stdin.isTTY) { console.error('AurenTermKit necesita una terminal interactiva. Ejecuta npm start desde CMD, PowerShell o una terminal.'); process.exit(1); }
process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('keypress', onKey);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => { if (process.stdin.isTTY) process.stdin.setRawMode(false); leaveScreen(); });
render();
