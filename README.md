# ⚜️ Imperios Rápidos

Juego de estrategia en tiempo real inspirado en los clásicos del género (aldeanos, recursos, eras, ejércitos),
pensado para **celular** y para **partidas cortas de 10 a 15 minutos**.

> Prototipo jugable v0.6 — arte y código originales.

## Qué incluye

| Modo | Estado |
|---|---|
| 📜 **Historia: La Crónica de Varnia** — tutorial narrativo de 8 objetivos | ✅ Jugable |
| ⚔️ **Escaramuza de 2 a 8 jugadores** — equipos (cooperativo con aliados IA), civilización, color y dificultad por jugador; 4 tamaños de mapa | ✅ Jugable |
| 🤝 Cooperativo online con amigos | 🛠️ Próxima etapa |
| 🏆 Competitivo online (clasificatorias) | 🛠️ Próxima etapa |

**Jugabilidad**

- **4 edades:** Oscura → Media → de los Castillos → Imperial.
- **10 civilizaciones**, cada una con 3 bonificaciones y una unidad única que se entrena en el Castillo:
  Británicos (Arquero de arco largo), Francos (Lanzador de hachas), Españoles (Conquistador), Bizantinos (Catafracto),
  Mongoles (Mangudai), Japoneses (Samurái), Chinos (Chu Ko Nu), Persas (Elefante de guerra), Vikingos (Berserker) y Turcos (Jenízaro).
- **19 unidades comunes:** Aldeano, Espadachín, Lancero, Campeón, Arquero, Escaramuzador, Arquero a caballo, Arcabucero,
  Explorador, Caballero, Ariete, Mangana (daño en área), Cañón de bombardeo, Fundíbulo, Monje (cura), Barco pesquero,
  Galeón, Barco incendiario y Galeón cañonero.
- **19 edificios**, entre ellos Muelle (va en el agua), Universidad, Castillo, Monasterio, Mercado, Herrería, Empalizada, Muralla de piedra y Puertas (dejan pasar solo a tu equipo).
- **15 investigaciones:** Herrería (Forja, Cota de malla, Emplumado, Barda), Universidad (Albañilería, Arquitectura, Química,
  Balística, Matacanes, Ingeniería de asedio) y economía (Telar, Carretilla, Hacha doble, Arado, Minería). Química desbloquea la pólvora.
- **Agua y barcos:** pesca con barcos, batallas navales, barcos que bombardean la costa.
- 10 mapas (Continental, Río, Lagos, Bosque cerrado, Oasis, Mediterráneo, Archipiélago, Costas, Canales y Arena, donde cada reino arranca amurallado con 2 torres y una puerta), elegidos desde un desplegable con miniatura; 4 tamaños (Diminuto 64, Chico 80, Mediano 94, Grande 104 casillas) y 5 biomas.
- **2 modos de juego:** Normal (desde la Edad Oscura) y **Combate imperial** (Edad Imperial, 2000 de cada recurso y todas las mejoras investigadas).
- **4 dificultades de IA:** Principiante (para aprender: casi no ataca), Fácil, Normal y Difícil.
- Botón 🗑️ para eliminar unidades o destruir edificios propios; colas de hasta 10 unidades; ➕ En cola también al construir.
- Niebla de guerra, minimapa, puntos de reunión, colas de entrenamiento.
- **Órdenes en cola** (como Shift): botón "➕ En cola" para encadenar construcciones, movimientos y recolección.
- **Posturas** por tropa: Agresiva (persigue), Neutral (defiende su zona y vuelve) y Pasiva (no ataca).
- **Varias investigaciones a la vez** (una por edificio) con cola de hasta 5; la barra de avance de edad queda visible arriba.
- **Puntuación en vivo** individual y por equipo (economía, militar, tecnología): tocá el trofeo.
- Mantené apretado cualquier botón para ver la ficha: vida, ataque, fuerte contra, débil contra, costo.
- Una granja admite un solo aldeano; las minas y bayas se van vaciando a la vista; la barra de recursos muestra cuántos aldeanos trabajan en cada uno.
- Portones de 3 tramos que se abren al acercarse tu ejército y se pueden bloquear.
- **Regla de partida rápida:** el que pierde su Centro Urbano, pierde.

**Controles táctiles**

- Tocar = seleccionar · doble toque = todas las unidades de ese tipo en pantalla.
- Con unidades elegidas, tocar suelo / recurso / enemigo = mover / recolectar / atacar.
- Arrastrar = mover cámara · pellizcar = zoom · ▢ = selección por área.
- 🔨 construir · 💤 aldeano ocioso · 🛡️ todo el ejército · ⚓ la flota · ⚔️ "Atacar zona".

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
    data.ts       #   balance: unidades, edificios, edades, investigaciones
    civs.ts       #   las 10 civilizaciones y sus bonificaciones
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
