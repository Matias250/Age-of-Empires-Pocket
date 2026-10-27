# Hoja de ruta

## v0.1 — Prototipo jugable (este repositorio)
- [x] Simulación determinista por comandos, 20 ticks/s
- [x] Economía de 4 recursos, 11 edificios, 6 unidades, 2 eras
- [x] IA con 3 dificultades (Fácil / Normal / Difícil)
- [x] Modo historia-tutorial "La Crónica de Varnia"
- [x] 1 vs 1 contra IA y 2 vs 2 cooperativo con aliado IA
- [x] Controles táctiles, minimapa, niebla de guerra
- [x] Instalable como app web (PWA) y publicación en GitHub Pages

## v0.3 — Contenido estilo clásico (hecho)
- [x] 4 edades, 10 civilizaciones con unidad única y bonificaciones
- [x] Universidad, Muelle, Muralla de piedra; barcos pesqueros, galeones, barcos de fuego y galeones cañoneros
- [x] Escaramuza de hasta 8 jugadores con equipos, civilización, color y dificultad por jugador
- [x] Mapa Mediterráneo y peces en todos los mapas con agua

## v0.4 — Multijugador online (cooperativo)
La simulación ya está preparada: es determinista y solo cambia por comandos.

1. **Servidor de salas** (Node.js + WebSocket, por ejemplo en Fly.io o Render): crea salas con código de 4 letras.
2. **Lockstep por turnos de 100 ms**: cada cliente manda sus comandos del turno; el servidor los reenvía a todos
   y cada uno ejecuta exactamente los mismos ticks. Solo viajan comandos, no posiciones → funciona bien con datos móviles.
3. **Retraso de entrada** de 2 turnos para ocultar la latencia.
4. **Detección de desincronización**: cada 5 s los clientes comparan un hash del estado.
5. Modos: coop 2 humanos vs 2 IA, y 2 vs 2 mixto.

Pendiente técnico: reemplazar las pocas operaciones de punto flotante sensibles (raíces, trigonometría) por
aritmética de punto fijo si aparecen desincronizaciones entre navegadores distintos.

## v0.3 — Competitivo
- Emparejamiento 1 vs 1 por puntaje (Elo/Glicko-2), temporadas cortas y ligas.
- Repeticiones gratis: guardar semilla + lista de comandos alcanza para reproducir la partida entera.
- Anti-trampa: el servidor valida los comandos (las mismas validaciones que ya tiene `World.applyCommand`).
- Niebla de guerra estricta: en competitivo, el servidor podría ejecutar la simulación con autoridad.

## v0.4 — Contenido y pulido
- Arte final (sprites isométricos), música y efectos de sonido.
- Civilizaciones con bonos únicos y una unidad especial cada una.
- 3ª era, mejoras de herrería, murallas, monjes/curanderos.
- Más mapas (río, islas pequeñas, bosque cerrado) y más capítulos de historia.
- Empaquetado como app nativa para Android/iOS con Capacitor.
