# Gestor de Cuadrante y Auditor de Jornada SAS (Gerhonte)

Herramienta profesional diseñada para profesionales del **Servicio Andaluz de Salud (SAS)** que permite auditar y llevar el control exhaustivo de su jornada laboral anual, turnos realizados, cómputo proporcional de nombramientos (interinidades y sustituciones) y el cálculo de la bolsa de horas para acumulación y solicitud de **Días de Compensación por Incidencias / Exceso de Jornada (DCI)**.

---

## 📋 Características Principales

1. **Calendario Interactivo Día a Día**:
   - Asignación rápida de turnos mediante paleta de pinceles visuales o atajos de teclado (`M`, `T`, `N`, `2`/`B`, `V`, `L`, `D`, `X`/Borrar).
   - Control de validación automática: En régimen diurno (L-V), el sistema avisa e impide asignar vacaciones (V), moscosos (LD) o descansos DCI en fines de semana (sábados y domingos no laborables).
   - Tipos de turno operativos:
     - **[M] Mañana**: +7,0 horas efectivas.
     - **[T] Tarde**: +7,0 horas efectivas.
     - **[N] Noche**: +10,0 horas efectivas.
     - **[MN] Mañana + Noche (Doble Turno)**: +17,0 horas efectivas (7h de mañana + 10h de noche), computadas íntegramente en la fecha en que se inicia la jornada conforme al criterio de registro Gerhonte del SAS.
     - **[V] Vacaciones**: +7,0 horas efectivas (en días laborables de lunes a viernes en régimen diurno).
     - **[LD] Moscoso (Asuntos Particulares)**: +7,0 horas efectivas.
     - **[DCI] Día de Descanso Compensatorio**: -7,0 horas del exceso acumulado a favor.

2. **Resumen y Auditoría Numérica Mensual (Gerhonte)**:
   - Tabla comparativa mes a mes de turnos realizados vs. horas exigibles proporcionales.
   - Sincronización bidireccional inmediata entre la cuadrícula del calendario y la tabla mensual.

3. **Planificador y Proyector de Exceso a Fin de Nombramiento**:
   - Simulación de días DCI para comprobar cómo quedaría la bolsa.
   - Cálculo automático del número de turnos necesarios para cuadrar el saldo a 0h.

4. **Generador de Solicitud Formal DCI**:
   - Redacción automática de la instancia administrativa oficial dirigida a la Dirección/Jefatura de Personal del SAS, con detalle de fechas propuestas, saldo acumulado y fundamentación legal.
   - Opciones directas para imprimir en formato administrativo oficial o copiar al portapapeles.

5. **Persistencia Dual (Nube + Modo Local Seguro)**:
   - Sincronización en la nube mediante **Firebase Authentication** y **Cloud Firestore** con reglas de seguridad ABAC por usuario.
   - Modo local automático con `localStorage` ante desconexión o uso sin registro.
   - Exportación de datos a hoja de cálculo en formato **CSV**.

---

## ⚖️ Normativa SAS y Fórmulas de Cómputo

- **Jornada Anual Base (Decreto 35 horas semanales / Mesa Sectorial SAS)**:
  - *Diurno Ordinario*: 1.540 horas netas anuales.
  - *Rotatorio (con noches)*: 1.483 horas netas anuales (ponderación por penosidad nocturna).
  - *Nocturno Fijo*: 1.450 horas netas anuales.

- **Cómputo Proporcional para Sustitutos e Interinos**:
  $$\text{Jornada Exigible} = \text{round}\left( \frac{\text{Días Activos del Nombramiento}}{\text{Días del Año (365 o 366)}} \times \text{Jornada Base} \right)$$

- **Bolsa de Días DCI**:
  - Por cada **7,0 horas** de exceso consolidado se genera derecho a **1 día completo DCI**.
  - El disfrute de 1 DCI resta 7,0 horas del exceso sin minorar la retribución ordinaria mensual.

---

## 🛠️ Tecnologías Empleadas

- **Frontend**: HTML5 Semántico, JavaScript Modular ES6+, [Tailwind CSS](https://tailwindcss.com/).
- **Empaquetador**: [Vite](https://vitejs.dev/) (compilación ultrarrápida a cliente estático optimizado).
- **Backend / BBDD**: [Firebase](https://firebase.google.com/) (Auth + Firestore Cloud Database).
- **CI/CD**: GitHub Actions con despliegue automático a GitHub Pages.

---

## 🚀 Puesta en Marcha en Desarrollo Local

### Requisitos Previos
- [Node.js](https://nodejs.org/) v18+ instalado.
- [Git](https://git-scm.com/) instalado.

### Instalación y Ejecución

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Iniciar servidor de desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

3. **Verificar tipado y sintaxis**:
   ```bash
   npm run lint
   ```

4. **Compilar para producción**:
   ```bash
   npm run build
   ```
   Los archivos estáticos listos para producción se generan en la carpeta `/dist`.

5. **Previsualizar la compilación de producción**:
   ```bash
   npm run preview
   ```

---

## 🚢 Despliegue a Producción

### Opción A: Despliegue Automático en GitHub Pages (Recomendado)
El proyecto incluye un flujo de trabajo de integración continua en `.github/workflows/deploy.yml`.

1. En tu repositorio de GitHub (`https://github.com/xonn83/GestorSAS`), ve a:
   **Settings** > **Pages** > **Build and deployment**.
2. En **Source**, selecciona **GitHub Actions**.
3. Cada vez que hagas `git push` a la rama `main`, GitHub compilará el código y desplegará la web automáticamente en tu dominio de GitHub Pages:
   `https://xonn83.github.io/GestorSAS/`

### Opción B: Despliegue en Firebase Hosting
Si deseas alojarlo en la infraestructura de Firebase:
```bash
npx firebase login
npx firebase deploy --only hosting,firestore:rules
```

---

## 🔄 Flujo de Trabajo para Mantener y Subir Cambios

1. Realiza las modificaciones deseadas en el código (por ejemplo, en `src/app.js` o `index.html`).
2. Verifica que todo compile correctamente:
   ```bash
   npm run build
   ```
3. Guarda y sube los cambios a GitHub:
   ```bash
   git add .
   git commit -m "feat: descripción de la mejora implementada"
   git push origin main
   ```
4. El flujo de GitHub Actions se activará automáticamente y la nueva versión estará visible en producción en cuestión de segundos.

---

## 🔒 Privacidad y Seguridad

- Los datos del profesional sanitario están aislados por identificador de usuario (`request.auth.uid`).
- No se comparten datos con terceros ni se transmiten identificadores personales fuera de la sesión autenticada del usuario.
- En modo local, los datos quedan exclusivamente almacenados en el navegador del usuario (`localStorage`).
