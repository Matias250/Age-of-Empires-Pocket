# ⚜️ Imperios Rápidos

Juego de estrategia en tiempo real inspirado en los clásicos del género (aldeanos, recursos, eras, ejércitos),
pensado para **celular** y para **partidas cortas de 10 a 15 minutos**.

> Prototipo jugable v0.1 — arte, nombres y facciones son originales.

## Qué incluye

| Modo | Estado |
|---|---|
| 📜 **Historia: La Crónica de Varnia** — tutorial narrativo de 8 objetivos | ✅ Jugable |
| ⚔️ **Escaramuza 1 vs 1 contra la IA** — Fácil, Normal y Difícil | ✅ Jugable |
| 🤝 **Cooperativo 2 vs 2** — vos + aliado IA contra 2 IA | ✅ Jugable (aliado IA) |
| 🤝 Cooperativo online con amigos | 🛠️ Próxima etapa |
| 🏆 Competitivo online (clasificatorias) | 🛠️ Próxima etapa |

**Jugabilidad**

- 4 recursos: comida, madera, oro y piedra. Bayas, árboles, minas, canteras y granjas.
- 8 unidades: Aldeano, Espadachín, Lancero, Arquero, Jinete, Ariete, Monje (cura) y Guardia Real (élite del castillo).
- 16 edificios: Centro Urbano, Casa, Granja, Molino, Aserradero, Campamento minero, Mercado, Cuartel, Galería de tiro, Establo,
  Taller de asedio, Herrería, Monasterio, Empalizada, Torre y Castillo.
- 6 investigaciones: Forja, Cota de malla, Hacha doble, Arado, Minería y Carretilla. Mercado para comprar y vender recursos.
- 5 mapas (Continental, Río con vados, Lagos, Bosque cerrado, Oasis) y 5 biomas (Templado, Desierto, Nieve, Tropical, Otoño).
- Elegís el color de tu ejército entre 8.
- 2 eras (Clanes → Reinos) que desbloquean caballería, asedio y torres.
- Niebla de guerra, minimapa, puntos de reunión, colas de entrenamiento.
- **Regla de partida rápida:** el que pierde su Centro Urbano, pierde.

**Controles táctiles**

- Tocar = seleccionar · doble toque = todas las unidades de ese tipo en pantalla.
- Con unidades elegidas, tocar suelo / recurso / enemigo = mover / recolectar / atacar.
- Arrastrar = mover cámara · pellizcar = zoom · ▢ = selección por área.
- 💤 aldeano ocioso · 🛡️ todo el ejército · ⚔️ "Atacar zona".

En computadora: clic izquierdo selecciona, clic derecho ordena, arrastrar selecciona por área, flechas o WASD mueven la cámara, espacio pausa.

## Cómo correrlo

Necesitás Node.js 18 o superior.

```bash
npm install
npm run build      # compila TypeScript a dist/
npm run serve      # abre http://localhost:8080
```

Para probar en el celular, abrí desde el teléfono la IP de tu computadora (`http://192.168.x.x:8080`) estando en la misma red Wi-Fi.

Otros comandos:

```bash
npm test           # simula partidas IA contra IA sin pantalla (ver tests/)
npm run bundle     # genera build/imperios-rapidos.html: el juego entero en UN archivo
```

## Publicación automática

El workflow `.github/workflows/pages.yml` compila, corre las pruebas y publica el juego en **GitHub Pages** en cada push a `main`.
Activalo una vez en *Settings → Pages → Source: GitHub Actions*. El juego queda en `https://<usuario>.github.io/<repo>/`
y desde el celular se puede "Agregar a pantalla de inicio" para usarlo como app a pantalla completa.

## Estructura

```
src/
  sim/            # Simulación pura y determinista (sin pantalla)
    data.ts       #   balance: unidades, edificios, costos, tiempos
    world.ts      #   mundo, comandos, movimiento, combate, recolección, eras, victoria
    path.ts       #   A* sobre grilla
    ai.ts         #   IA (3 dificultades) que juega con los mismos comandos que un humano
    match.ts      #   generación de mapas y modos
    rng.ts        #   aleatorio con semilla
  client/         # Todo lo visual
    render.ts     #   dibujo en Canvas 2D (sin imágenes externas)
    game.ts       #   bucle, cámara, gestos táctiles, selección
    hud.ts        #   interfaz HTML: recursos, panel, botones
    tutorial.ts   #   modo historia
    main.ts       #   menú
tests/            # pruebas de simulación
docs/             # diseño y hoja de ruta
```

La simulación está separada del dibujo a propósito: avanza a 20 ticks fijos por segundo y solo cambia por **comandos**
(`move`, `target`, `build`, `train`…). Eso es lo que permite agregar multijugador online con *lockstep* sin reescribir el juego.
Ver [docs/ROADMAP.md](docs/ROADMAP.md).

## Créditos

Diseño y código originales. Inspirado en el género RTS clásico; no usa arte, nombres ni contenido de otros juegos.
