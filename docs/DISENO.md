# Documento de diseño

## Visión
La sensación de un RTS clásico de construir aldea → juntar recursos → avanzar de era → aplastar al rival,
comprimida para jugarse en el celular durante un viaje en colectivo: **partidas de 10 a 15 minutos**.

## Cómo se logra que sea rápido
| Decisión | Efecto |
|---|---|
| Mapas chicos (48×48 en 1v1, 60×60 en 2v2) | Contacto temprano con el rival |
| 4 aldeanos iniciales, recursos iniciales altos | Se saltea el arranque lento |
| Recolección ~1,7× más rápida que en un RTS tradicional | La economía escala en minutos |
| Solo 2 eras | Un único momento clave de decisión |
| Victoria por destruir el Centro Urbano | Sin "cazar la última casa" |

## Triángulo de unidades
- **Lancero** 🔱 (+18 contra caballería) vence al **Jinete** 🐎
- **Jinete** (+6 contra arqueros, rápido) vence al **Arquero** 🏹
- **Arquero** (+3 contra infantería, a distancia) vence a **Espadachín/Lancero**
- **Espadachín** 🗡️: todoterreno, +4 contra edificios
- **Ariete** 🐏: +45 contra edificios, casi inmune a flechas, no ataca unidades

Edificios: armadura 2 cuerpo a cuerpo / 6 perforante → los arqueros casi no les hacen daño.
El Centro Urbano y las torres disparan flechas a las unidades cercanas.

## Dificultades de la IA
| | Fácil | Normal | Difícil |
|---|---|---|---|
| Velocidad de decisión | cada 3 s | cada 1,5 s | cada 0,75 s |
| Ritmo de recolección | 75 % | 100 % | 120 % |
| Aldeanos máximos | 14 | 22 | 30 |
| Primer ataque | ~8 min | ~5,5 min | ~4 min |
| Caballería y arietes | No | Sí | Sí |
| Torres y 2º cuartel | No | No | Sí |

La IA usa exactamente los mismos comandos que un jugador. Hoy conoce la ubicación del Centro Urbano enemigo
(no explora): es una simplificación aceptable para un prototipo.

## Historia: La Crónica de Varnia
La heredera **Ilen** y el viejo capataz **Bram** reconstruyen la aldea fronteriza de Valdeluz, arrasada por la banda de
los **Cuervos Negros**. Cada objetivo enseña una mecánica:

1. Cortar madera (seleccionar y ordenar)
2. Juntar 40 de madera (ciclo de recolección)
3. Construir una casa (menú de construcción y ubicación)
4. Llegar a 6 aldeanos (entrenar, comida, punto de reunión)
5. Construir un cuartel
6. Entrenar 4 soldados
7. Defender la aldea de una incursión (selección de ejército y ataque)
8. Destruir el Fortín de los Cuervos (ataque por zona y la regla de victoria)
