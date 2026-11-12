# AurenTermKit

Administrador interactivo de colecciones, tareas y procesos de desarrollo. AurenTermKit vive en tu terminal: guarda flujos de comandos, los ejecuta en sesiones integradas y muestra los logs en una TUI de dos columnas.

```text
┌─ COLECCIONES · TAREAS · TERMINALES ─────┬─ SALIDA EN VIVO ─────────────┐
│ Colecciones, tareas y sesiones          │ Logs del proceso seleccionado│
└─────────────────────────────────────────┴───────────────────────────────┘
```

## Características

- Colecciones para separar proyectos.
- Tareas persistentes con comandos ejecutados en orden.
- Procesos integrados: no abre una ventana nueva por tarea.
- Al salir, detiene las sesiones y sus procesos hijos para no dejar servidores en segundo plano.
- Logs en vivo, estado del proceso y acción para detenerlo.
- Ejecución de todas las tareas de una colección con una tecla.
- Editor de comandos con historial y autocompletado local de rutas y scripts npm.
- Atajo para abrir la carpeta efectiva de una tarea en Visual Studio Code.
- Configuración local en JSON y sin dependencias npm de terceros.
- Compatible con Windows, macOS y Linux.

## Requisitos

- Node.js 18 o posterior.
- Una terminal interactiva compatible con entrada de teclado.
- Para abrir carpetas desde la app, el comando `code` de Visual Studio Code debe estar disponible en `PATH`.

## Inicio rápido

Clona el repositorio y entra en la carpeta:

```sh
git clone <URL-DEL-REPOSITORIO>
cd Auren_Terminal
npm start
```

No se requieren paquetes adicionales. En la primera ejecución, AurenTermKit crea una configuración local vacía en `data/collections.json`.

## Navegación

La pantalla tiene dos columnas. A la izquierda aparecen **Colecciones**, **Tareas** y **Terminales**; a la derecha se muestran los logs de la sesión seleccionada.

| Panel enfocado | Tecla | Acción |
| --- | --- | --- |
| Cualquiera | `Tab` | Cambiar entre Colecciones, Tareas y Terminales |
| Cualquiera | `↑` / `↓` | Mover la selección dentro del panel enfocado |
| Colecciones | `←` / `→` | Cambiar la colección seleccionada |
| Colecciones | `Enter` | Abrir la colección en el panel Tareas |
| Colecciones | `A` | Iniciar todas las tareas de la colección |
| Colecciones | `N` / `E` / `D` | Crear, editar o eliminar una colección |
| Tareas | `Enter` | Ejecutar la tarea seleccionada |
| Tareas | `A` | Iniciar todas las tareas de la colección |
| Tareas | `V` | Abrir en VS Code la carpeta efectiva de la tarea |
| Tareas | `N` / `E` / `D` | Crear, editar o eliminar una tarea |
| Terminales | `X` | Detener la sesión seleccionada |
| Terminales | `C` | Limpiar las sesiones finalizadas |
| Formulario | `exit` | Cancelar el formulario y volver a la TUI |
| Aplicación | `Ctrl+C` dos veces en 2.5 segundos | Detener todos los procesos y salir de AurenTermKit |

`Q` y `Esc` no cierran la aplicación.

## Crear la primera colección y tarea

1. Enfoca **Colecciones** con `Tab` y pulsa `N`.
2. Escribe el nombre de la colección y pulsa `Enter`.
3. Enfoca **Tareas** y pulsa `N`.
4. Escribe el nombre de la tarea.
5. Escribe los comandos en orden, uno por línea. Pulsa `Enter` en una línea vacía o escribe `save` y pulsa `Enter` para guardar.

Durante la edición de comandos, `Tab` completa rutas y scripts de npm mediante lógica propia de Node.js; no depende de PowerShell. `↑` y `↓` recorren el historial de comandos del editor.

Al editar una tarea, puedes conservar la lista actual de comandos respondiendo `N` a la pregunta de reemplazo. Si respondes `S` pero no escribes comandos nuevos y escribes `save`, se conserva la lista anterior mientras se guardan los otros cambios.

## Directorio de trabajo y comandos

La carpeta inicial predeterminada es el perfil del usuario en Windows (`C:\Users\<usuario>`) y el directorio home en macOS/Linux. Cada tarea puede cambiar de carpeta con `cd`; los comandos siguientes corren desde esa carpeta porque se ejecutan en orden dentro del mismo shell.

Ejemplo de tarea:

```text
cd home/Servidor/projects/microcredit-system/microcredit-backend/
nest start --watch
```

En Windows AurenTermKit usa `cmd.exe` para evitar bloqueos de scripts `.ps1` al ejecutar herramientas de npm. En macOS/Linux usa el shell configurado en `$SHELL` (o Bash como alternativa).

## Visual Studio Code

Selecciona una tarea y pulsa `V`. AurenTermKit calcula la carpeta efectiva aplicando sus comandos `cd` y abre esa carpeta con `code .`. Instala el comando `code` de VS Code en `PATH` para habilitar esta acción.

## Configuración local

Las colecciones y tareas se guardan en `data/collections.json`. El archivo tiene esta forma:

```json
{
  "collections": [
    {
      "id": "mi-proyecto",
      "name": "Mi proyecto",
      "description": "Entorno de desarrollo",
      "tasks": [
        {
          "id": "frontend",
          "name": "Frontend",
          "description": "Servidor local",
          "cwd": "C:\\Users\\aronc",
          "commands": [
            "cd home/mi-proyecto/frontend",
            "npm run dev"
          ]
        }
      ]
    }
  ]
}
```

El archivo local de colecciones se excluye de Git para evitar subir nombres de proyectos, rutas personales o comandos privados. La plantilla neutral está en [`data/collections.example.json`](data/collections.example.json).

## Estructura

```text
.
├── data/
│   ├── collections.example.json  # Plantilla limpia para el repositorio
│   └── collections.json          # Configuración local (ignorada por Git)
├── src/
│   └── cli.js                    # TUI, editor y ejecución de procesos
├── .gitignore
├── package.json
└── README.md
```

## Seguridad

Los comandos guardados se ejecutan con los permisos del usuario que inició AurenTermKit. Guarda únicamente comandos que conozcas y revisa `data/collections.json` antes de ejecutar tareas importadas.
