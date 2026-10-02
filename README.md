# PELAGIA — Exploración submarina

Experiencia interactiva en 3D en el navegador: pilota un minisubmarino por un océano abierto, usa el sonar y descubre arrecifes, ruinas, un naufragio y fauna marina. Todo el mundo (terreno, vegetación, criaturas y sonido) se genera de forma procedural, sin assets externos.

## Características

- **Física realista del submarino**: flotabilidad (Arquímedes), resistencia cuadrática, masa añadida, corrientes, presión y consumo eléctrico. Los planos y el timón solo actúan con velocidad; las toberas verticales funcionan parado.
- **Mundo procedural**: terreno por ruido, vegetación (kelp, corales…) generada por chunks con LOD y 6 puntos singulares.
- **Óptica submarina**: absorción del agua por canal (los rojos desaparecen primero con la profundidad), cáusticas, niebla y focos del submarino.
- **Fauna**: 14 especies, entre ellas sardinas, atunes, tortugas, mantas, delfines, tiburones martillo, cachalotes, medusas, rape abisal y calamar gigante.
- **Sonar y telemetría**: pulso de sonar, minimapa, brújula, profundidad, presión, batería, oxígeno, casco y lastre.
- **Sonido procedural** con WebAudio: motor, ambiente, crujidos del casco, sonar y cantos de ballena.
- **Diario de misión**: lista de descubrimientos por completar.

## Puntos de interés

| Lugar | Profundidad del fondo |
|---|---|
| Naufragio | ~34 m |
| Ruinas | ~27 m |
| Bosque de kelp | ~23 m |
| Arco rocoso | ~31 m |
| Fumarolas hidrotermales | ~148 m |
| Cementerio de ballena | ~112 m |

## Controles

| Tecla | Acción |
|---|---|
| `W` / `S` | Avanzar / retroceder |
| `A` / `D` | Girar a izquierda / derecha |
| `Espacio` / `Shift` | Subir / bajar (toberas verticales) |
| `↑` / `↓` | Inclinar el morro |
| `Z` / `X` | Inundar / soplar tanques de lastre |
| `E` | Emitir pulso de sonar |
| `F` | Encender / apagar focos |
| `V` | Cambiar cámara (exterior / cabina) |
| `G` | Cambiar calidad gráfica |
| `H` o `?` | Mostrar / ocultar ayuda |
| Ratón / rueda | Mirar alrededor / acercar |

> Sube a superficie para recargar batería y oxígeno. Enciende los focos al descender.

## Puesta en marcha

Requisitos: [Node.js](https://nodejs.org/) 18 o superior.

```bash
npm install
npm run dev       # servidor de desarrollo (Vite)
npm run build     # build de producción en dist/
npm run preview   # sirve el build localmente
```

## Estructura

```
index.html        # interfaz (HUD, intro, ayuda)
src/
├── main.js       # bucle principal, entrada, cámara, HUD y descubrimientos
├── sub.js        # modelo y física del submarino
├── terrain.js    # altura del fondo, corrientes y puntos singulares
├── landmarks.js  # naufragio, ruinas, arco, fumarolas, ballena
├── flora.js      # vegetación y chunks del terreno
├── fauna.js      # catálogo de especies y comportamiento (bandadas, etc.)
├── creatures.js  # geometría de las criaturas
├── fx.js         # efectos: partículas, rayos de luz, superficie
├── shading.js    # shaders compartidos y óptica del agua
├── noise.js      # PRNG determinista y ruido de gradiente
├── audio.js      # sonido procedural (WebAudio)
└── style.css     # estilos de la interfaz
```

## Tecnologías

- [Three.js](https://threejs.org/) para el renderizado 3D con WebGL.
- [Vite](https://vite.dev/) como servidor de desarrollo y bundler.
- JavaScript (ES modules), sin framework.
