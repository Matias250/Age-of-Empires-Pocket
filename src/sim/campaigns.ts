// Historias: 7 campañas con 25 escenarios. Cada escenario arma un mapa, ejércitos y un objetivo propio.
import { Age, BuildingType, BUILDINGS, Res, ResBag, TICK_RATE, TILE, UNITS, UnitType } from './data.js';
import { CivId } from './civs.js';
import { Biome, createMatch, MapSize, MapType, Match, PLAYER_COLORS, SlotCfg } from './match.js';
import { Difficulty } from './ai.js';
import { Entity, World } from './world.js';

export interface ScnLine { who: string; icon: string; text: string }

export type Goal =
  | { t: 'conquer' }
  | { t: 'destroy'; types: BuildingType[]; label: string }
  | { t: 'survive'; min: number }
  | { t: 'gather'; res: Res; n: number }
  | { t: 'age'; age: Age }
  | { t: 'build'; list: [BuildingType, number][] };

interface Side {
  civ: CivId; name: string; diff?: Difficulty; age?: Age; res?: Partial<ResBag>;
  army?: [UnitType, number][]; build?: [BuildingType, number][];
}

export interface Scenario {
  id: string; title: string; place: string; year: string;
  /** longitud y latitud del lugar, para el mapa de la campaña */
  at: [number, number];
  intro: ScnLine[]; outro: string; goalText: string;
  map: MapType; biome: Biome; size?: MapSize;
  me: { age?: Age; res?: Partial<ResBag>; army?: [UnitType, number][]; build?: [BuildingType, number][] };
  hero?: { type: UnitType; name: string };
  allies?: Side[]; enemies: Side[];
  goal: Goal;
  /** oleadas enemigas: cada `every` segundos, desde `from` segundos */
  waves?: { every: number; from: number; units: UnitType[]; size: number; grow: number };
  /** multiplicador de vida del héroe (según dificultad) */
  heroHp?: number;
}

export interface Campaign { id: string; name: string; civ: CivId; emblem: string; hero: string; desc: string; scenarios: Scenario[] }

const N = (text: string): ScnLine => ({ who: 'Crónica', icon: '📜', text });
const S = (who: string, icon: string) => (text: string): ScnLine => ({ who, icon, text });

const JUANA = S('Juana', '⚜️'), LAHIRE = S('La Hire', '🛡️');
const TEMU = S('Temujín', '🐎'), BORTE = S('Börte', '👸');
const CID = S('Rodrigo', '🗡️'), JIMENA = S('Jimena', '👸');
const BELI = S('Belisario', '🦅'), ANTO = S('Antonina', '👸');
const YOSHI = S('Yoshitsune', '⛩️'), BENKEI = S('Benkei', '🪓');
const ERIK = S('Erik', '🛶'), LEIF = S('Leif', '🛡️');
const ATILA = S('Atila', '🐺'), BLEDA = S('Bleda', '🏹');

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'juana', name: 'Juana de Arco', civ: 'francos', emblem: '⚜️', hero: 'Juana', desc: 'Francia, 1429: una campesina de diecisiete años levanta a un reino vencido.',
    scenarios: [
      {
        id: 'juana1', title: 'La doncella de Domrémy', place: 'Chinon', year: '1429', at: [0.24, 47.17],
        intro: [
          N('Francia lleva casi cien años en guerra. Los ingleses y sus aliados dominan el norte, y el delfín Carlos espera en Chinon sin ejército ni esperanza.'),
          JUANA('Vengo a pedir soldados, no favores. Dios quiere que Orleans sea libre y que el delfín sea coronado en Reims.'),
          LAHIRE('Las patrullas inglesas rondan el castillo, muchacha. Si sobrevivimos a esta semana, quizá alguien te escuche.'),
        ],
        outro: 'Las patrullas inglesas se retiraron. El delfín, asombrado, le dio a Juana una armadura blanca y un ejército.',
        goalText: 'Resistí 8 minutos los ataques ingleses y mantené a Juana con vida',
        map: 'continental', biome: 'templado',
        me: { age: 2, res: { food: 400, wood: 400, gold: 200, stone: 150 }, army: [['militia', 4], ['archer', 3]] },
        hero: { type: 'knight', name: 'Juana' },
        enemies: [{ civ: 'britanos', name: 'Ingleses', diff: 'easy', age: 2 }],
        goal: { t: 'survive', min: 8 },
        waves: { every: 75, from: 70, units: ['militia', 'archer', 'spearman'], size: 3, grow: 1 },
      },
      {
        id: 'juana2', title: 'El asedio de Orleans', place: 'Orleans', year: '1429', at: [1.9, 47.9],
        intro: [
          N('Orleans resiste rodeada por bastillas inglesas. Si la ciudad cae, el camino al sur queda abierto.'),
          JUANA('Tomaremos las torres una por una. Que los arietes golpeen y que nadie retroceda.'),
          LAHIRE('Las bastillas son tres torres y un castillo. Sin ellos, el asedio se termina.'),
        ],
        outro: 'El 8 de mayo los ingleses levantaron el asedio. Desde ese día la llamaron la Doncella de Orleans.',
        goalText: 'Destruí las torres y el castillo inglés',
        map: 'rio', biome: 'templado',
        me: { age: 3, res: { food: 800, wood: 800, gold: 600, stone: 200 }, army: [['knight', 4], ['champion', 4], ['ram', 2], ['archer', 4]] },
        hero: { type: 'knight', name: 'Juana' },
        enemies: [{ civ: 'britanos', name: 'Ingleses', diff: 'normal', age: 3, build: [['castle', 1], ['tower', 3]] }],
        goal: { t: 'destroy', types: ['castle', 'tower'], label: 'bastillas' },
      },
      {
        id: 'juana3', title: 'El camino a Reims', place: 'Reims', year: '1429', at: [4.03, 49.26],
        intro: [
          N('Para ser rey, Carlos debe ser coronado en Reims, en pleno territorio enemigo.'),
          JUANA('Los borgoñones y los ingleses nos esperan en el camino. Los vasallos leales marchan con nosotros.'),
          LAHIRE('Que caigan sus centros urbanos y el camino quedará libre.'),
        ],
        outro: 'El 17 de julio Carlos VII fue coronado en la catedral de Reims, con Juana a su lado y su estandarte en alto.',
        goalText: 'Derrotá a ingleses y borgoñones (Juana debe sobrevivir)',
        map: 'continental', biome: 'otono', size: 'small',
        me: { age: 3, res: { food: 600, wood: 600, gold: 400, stone: 200 }, army: [['knight', 3], ['spearman', 4]] },
        hero: { type: 'knight', name: 'Juana' },
        allies: [{ civ: 'francos', name: 'Leales al rey', diff: 'normal', age: 3 }],
        enemies: [{ civ: 'britanos', name: 'Ingleses', diff: 'normal', age: 3 }, { civ: 'francos', name: 'Borgoñones', diff: 'easy', age: 3 }],
        goal: { t: 'conquer' },
      },
      {
        id: 'juana4', title: 'Compiègne', place: 'Compiègne', year: '1430', at: [2.83, 49.42],
        intro: [
          N('Un año después, los borgoñones sitian Compiègne. Juana corre a defenderla con un puñado de hombres.'),
          JUANA('No abandonaré a esta gente. Mientras resistamos, el rey podrá mandar ayuda.'),
          LAHIRE('Son muchos más que nosotros. Aguantemos detrás de las murallas.'),
        ],
        outro: 'Compiègne resistió el asedio. La historia recuerda a Juana como la voz que devolvió a Francia la voluntad de luchar.',
        goalText: 'Resistí 12 minutos el asedio de Compiègne',
        map: 'arena', biome: 'templado',
        me: { age: 3, res: { food: 700, wood: 700, gold: 500, stone: 400 }, army: [['champion', 4], ['archer', 4], ['spearman', 2]] },
        hero: { type: 'knight', name: 'Juana' },
        enemies: [{ civ: 'francos', name: 'Borgoñones', diff: 'normal', age: 3 }],
        goal: { t: 'survive', min: 12 },
        waves: { every: 90, from: 90, units: ['champion', 'knight', 'archer', 'mangonel'], size: 3, grow: 1 },
      },
    ],
  },
  {
    id: 'gengis', name: 'Gengis Kan', civ: 'mongoles', emblem: '🐎', hero: 'Temujín', desc: 'Las estepas, 1180: un huérfano une a las tribus y conquista medio mundo.',
    scenarios: [
      {
        id: 'gengis1', title: 'Un huérfano de las estepas', place: 'Burkhan Khaldun', year: '1184', at: [108.9, 48.8],
        intro: [
          N('Las tribus de la estepa se roban y se matan entre ellas. Los merkitas acaban de raptar a Börte, la esposa del joven Temujín.'),
          TEMU('Juré ante el cielo azul que la traería de vuelta. Los merkitas aprenderán quién es Temujín.'),
          BORTE('(Desde el campamento enemigo, se oye cantar a Börte: la esperan.)'),
        ],
        outro: 'Temujín rescató a Börte y los clanes empezaron a seguirlo. Era solo el comienzo.',
        goalText: 'Destruí el campamento de los merkitas',
        map: 'continental', biome: 'otono', size: 'tiny',
        me: { age: 1, army: [['scout', 2]] },
        hero: { type: 'cavarcher', name: 'Temujín' },
        enemies: [{ civ: 'mongoles', name: 'Merkitas', diff: 'novice' }],
        goal: { t: 'conquer' },
      },
      {
        id: 'gengis2', title: 'El gran kan', place: 'Río Onón', year: '1206', at: [110.5, 49.5],
        intro: [
          N('Veinte años de guerras después, todas las tribus esperan una señal. Solo falta reunir a los clanes en el Onón.'),
          TEMU('Un pueblo unido necesita graneros llenos y caballos sanos. Preparemos el gran kurultai.'),
          BORTE('Los kanes escucharán a quien pueda alimentar a sus hombres. Juntá comida y oro.'),
        ],
        outro: 'En el kurultai del río Onón, Temujín fue proclamado Gengis Kan: el señor de todos los pueblos de las estepas.',
        goalText: 'Juntá 1.500 de comida para el kurultai',
        map: 'lagos', biome: 'templado', size: 'small',
        me: { age: 2, res: { food: 200, wood: 300, gold: 100 }, army: [['cavarcher', 4]] },
        hero: { type: 'cavarcher', name: 'Gengis Kan' },
        enemies: [{ civ: 'mongoles', name: 'Tártaros', diff: 'easy' }, { civ: 'chinos', name: 'Keraítas', diff: 'novice' }],
        goal: { t: 'gather', res: 'food', n: 1500 },
        waves: { every: 120, from: 180, units: ['scout', 'cavarcher'], size: 2, grow: 1 },
      },
      {
        id: 'gengis3', title: 'La Gran Muralla', place: 'Zhongdu', year: '1215', at: [116.4, 39.9],
        intro: [
          N('Al sur, tras la Gran Muralla, la dinastía Jin gobierna desde su capital, Zhongdu.'),
          TEMU('Sus murallas son altas, pero detrás de las murallas hay hombres. Y los hombres se cansan.'),
          BORTE('Los ingenieros chinos que se pasaron a nuestro lado saben construir máquinas de asedio. Usalas.'),
        ],
        outro: 'Zhongdu cayó. Los ingenieros jin se sumaron al ejército mongol, que ahora podía tomar cualquier ciudad.',
        goalText: 'Destruí el castillo y las torres de Zhongdu',
        map: 'arena', biome: 'otono',
        me: { age: 3, res: { food: 900, wood: 900, gold: 700, stone: 200 }, army: [['mangudai', 6], ['mangonel', 2], ['ram', 3]] },
        hero: { type: 'mangudai', name: 'Gengis Kan' },
        enemies: [{ civ: 'chinos', name: 'Dinastía Jin', diff: 'normal', age: 3, build: [['castle', 1], ['tower', 2]] }],
        goal: { t: 'destroy', types: ['castle', 'tower'], label: 'defensas de Zhongdu' },
      },
      {
        id: 'gengis4', title: 'Las ciudades de la seda', place: 'Bujará', year: '1220', at: [64.4, 39.8],
        intro: [
          N('El sha de Corasmia mandó ejecutar a los embajadores mongoles. Fue el error más caro de su vida.'),
          TEMU('Ofrecí comercio y me respondieron con sangre. Bujará y Samarcanda pagarán la ofensa.'),
          BORTE('Persas y turcos defienden juntos el imperio del sha. Atacá antes de que reúnan a todos sus ejércitos.'),
        ],
        outro: 'El imperio corasmio se derrumbó. Las rutas de la seda quedaron, por primera vez, bajo un solo señor.',
        goalText: 'Derrotá a los corasmios (persas y turcos)',
        map: 'oasis', biome: 'desierto', size: 'small',
        me: { age: 3, res: { food: 900, wood: 700, gold: 700, stone: 200 }, army: [['mangudai', 6], ['knight', 4], ['trebuchet', 1]] },
        hero: { type: 'mangudai', name: 'Gengis Kan' },
        enemies: [{ civ: 'persas', name: 'Corasmios', diff: 'normal', age: 3 }, { civ: 'turcos', name: 'Turcos de Samarcanda', diff: 'normal', age: 3 }],
        goal: { t: 'conquer' },
      },
    ],
  },
  {
    id: 'cid', name: 'El Cid', civ: 'espanoles', emblem: '🗡️', hero: 'Rodrigo', desc: 'Castilla, 1081: un caballero desterrado se convierte en leyenda.',
    scenarios: [
      {
        id: 'cid1', title: 'El destierro', place: 'Burgos', year: '1081', at: [-3.7, 42.34],
        intro: [
          N('Rodrigo Díaz de Vivar, el mejor caballero de Castilla, cae en desgracia y el rey Alfonso lo destierra.'),
          CID('Me voy de Burgos con lo puesto. Pero mis hombres necesitan paga, y un capitán sin oro no es capitán.'),
          JIMENA('Juntá oro en las minas de la frontera y cuidate de los bandidos. Te esperamos.'),
        ],
        outro: 'Con oro en las alforjas y fama de invencible, Rodrigo marchó al este. Los moros lo empezaron a llamar "Sidi": el Cid.',
        goalText: 'Juntá 1.200 de oro',
        map: 'continental', biome: 'desierto', size: 'tiny',
        me: { age: 2, res: { food: 300, wood: 300, gold: 0, stone: 100 }, army: [['knight', 2], ['spearman', 2]] },
        hero: { type: 'knight', name: 'El Cid' },
        enemies: [{ civ: 'espanoles', name: 'Bandidos de la frontera', diff: 'easy' }],
        goal: { t: 'gather', res: 'gold', n: 1200 },
        waves: { every: 100, from: 120, units: ['scout', 'militia'], size: 2, grow: 1 },
      },
      {
        id: 'cid2', title: 'Al servicio de Zaragoza', place: 'Zaragoza', year: '1082', at: [-0.88, 41.65],
        intro: [
          N('El rey moro de Zaragoza contrata al Cid para defender su reino de Aragón y del conde de Barcelona.'),
          CID('Lucho por quien me trata con honor. Hoy, Zaragoza es mi casa.'),
          JIMENA('Los aragoneses y los catalanes atacan juntos. Con la caballería de Zaragoza podés vencerlos.'),
        ],
        outro: 'En Almenar el Cid derrotó y capturó al conde de Barcelona. Lo liberó sin rescate: su fama de caballero creció aún más.',
        goalText: 'Derrotá a Aragón y Barcelona junto a tu aliado de Zaragoza',
        map: 'rio', biome: 'desierto', size: 'small',
        me: { age: 2, res: { food: 600, wood: 600, gold: 300, stone: 200 }, army: [['knight', 3], ['archer', 3]] },
        hero: { type: 'knight', name: 'El Cid' },
        allies: [{ civ: 'turcos', name: 'Zaragoza', diff: 'normal', age: 2 }],
        enemies: [{ civ: 'espanoles', name: 'Aragón', diff: 'normal', age: 2 }, { civ: 'francos', name: 'Barcelona', diff: 'easy', age: 2 }],
        goal: { t: 'conquer' },
      },
      {
        id: 'cid3', title: 'Valencia', place: 'Valencia', year: '1094', at: [-0.38, 39.47],
        intro: [
          N('Valencia, la joya del Mediterráneo, está en manos de los almorávides. El Cid decide tomarla.'),
          CID('No voy a pedirle permiso a ningún rey. Valencia será nuestra, Jimena.'),
          JIMENA('El castillo de la ciudad mira al mar. Que los barcos y los arietes lo rodeen.'),
        ],
        outro: 'El Cid entró en Valencia y la gobernó hasta su muerte. Dicen que, aun muerto, su cuerpo atado al caballo espantó a los enemigos.',
        goalText: 'Destruí el castillo de Valencia y su muelle',
        map: 'costa', biome: 'desierto',
        me: { age: 3, res: { food: 900, wood: 1000, gold: 700, stone: 300 }, army: [['conquistador', 4], ['champion', 4], ['ram', 2]] },
        hero: { type: 'knight', name: 'El Cid' },
        enemies: [{ civ: 'turcos', name: 'Almorávides', diff: 'normal', age: 3, build: [['castle', 1], ['dock', 1]] }],
        goal: { t: 'destroy', types: ['castle', 'dock'], label: 'castillo y muelle' },
      },
    ],
  },
  {
    id: 'belisario', name: 'Belisario', civ: 'bizantinos', emblem: '🦅', hero: 'Belisario', desc: 'Bizancio, 530: el general que quiso recuperar el Imperio Romano.',
    scenarios: [
      {
        id: 'beli1', title: 'La batalla de Dara', place: 'Dara', year: '530', at: [40.9, 37.2],
        intro: [
          N('Un gran ejército persa avanza sobre la fortaleza de Dara, en la frontera oriental del Imperio.'),
          BELI('Tenemos la mitad de hombres. Cavaremos zanjas, usaremos las murallas y esperaremos el momento justo.'),
          ANTO('Si Dara resiste, el emperador Justiniano te confiará todo el ejército.'),
        ],
        outro: 'Los persas se estrellaron contra las defensas y huyeron. Belisario tenía apenas veinticinco años.',
        goalText: 'Resistí 10 minutos en Dara',
        map: 'arena', biome: 'desierto',
        me: { age: 2, res: { food: 600, wood: 600, gold: 300, stone: 400 }, army: [['spearman', 5], ['archer', 5]] },
        hero: { type: 'cataphract', name: 'Belisario' },
        enemies: [{ civ: 'persas', name: 'Persas sasánidas', diff: 'normal', age: 2 }],
        goal: { t: 'survive', min: 10 },
        waves: { every: 75, from: 80, units: ['knight', 'archer', 'spearman'], size: 3, grow: 1 },
      },
      {
        id: 'beli2', title: 'Los disturbios de Niká', place: 'Constantinopla', year: '532', at: [28.97, 41.01],
        intro: [
          N('Las facciones del hipódromo incendian Constantinopla y proclaman a otro emperador. Justiniano piensa en huir.'),
          ANTO('La púrpura es una buena mortaja. El emperador se queda, y vos vas a recuperar la ciudad.'),
          BELI('Los rebeldes se atrincheraron en tres cuarteles. Sin ellos, la revuelta se apaga.'),
        ],
        outro: 'La revuelta de Niká terminó. Sobre las cenizas, Justiniano levantó la gran iglesia de Santa Sofía.',
        goalText: 'Destruí los 3 cuarteles rebeldes',
        map: 'continental', biome: 'templado', size: 'tiny',
        me: { age: 3, res: { food: 600, wood: 600, gold: 500, stone: 200 }, army: [['cataphract', 5], ['champion', 5], ['archer', 4]] },
        hero: { type: 'cataphract', name: 'Belisario' },
        enemies: [{ civ: 'bizantinos', name: 'Rebeldes del hipódromo', diff: 'normal', age: 3, build: [['barracks', 3]] }],
        goal: { t: 'destroy', types: ['barracks'], label: 'cuarteles rebeldes' },
      },
      {
        id: 'beli3', title: 'La reconquista de África', place: 'Cartago', year: '533', at: [10.3, 36.85],
        intro: [
          N('Hace un siglo, los vándalos tomaron Cartago y el norte de África. Justiniano manda a Belisario a recuperarlos por mar.'),
          BELI('Desembarcamos en la costa y marchamos sobre Cartago antes de que el rey vándalo reúna a sus fuerzas.'),
          ANTO('Te acompaño. Quiero ver con mis ojos cómo vuelve el estandarte del Imperio a África.'),
        ],
        outro: 'En Ad Decimum los vándalos fueron derrotados y Cartago abrió sus puertas. África volvió a ser romana.',
        goalText: 'Derrotá a los vándalos',
        map: 'mediterraneo', biome: 'desierto', size: 'tiny',
        me: { age: 3, res: { food: 800, wood: 900, gold: 600, stone: 200 }, army: [['cataphract', 4], ['archer', 4], ['galleon', 2]] },
        hero: { type: 'cataphract', name: 'Belisario' },
        enemies: [{ civ: 'godos', name: 'Vándalos', diff: 'normal', age: 3 }],
        goal: { t: 'conquer' },
      },
    ],
  },
  {
    id: 'yoshitsune', name: 'Minamoto no Yoshitsune', civ: 'japoneses', emblem: '⛩️', hero: 'Yoshitsune', desc: 'Japón, 1184: la guerra Genpei entre los clanes Minamoto y Taira.',
    scenarios: [
      {
        id: 'yoshi1', title: 'El acantilado de Ichi-no-Tani', place: 'Ichi-no-Tani', year: '1184', at: [135.1, 34.65],
        intro: [
          N('El clan Taira se atrincheró en Ichi-no-Tani, con el mar a la espalda y un acantilado al frente.'),
          YOSHI('Si los ciervos bajan por ese barranco, mis caballos también pueden. Atacaremos por donde nadie nos espera.'),
          BENKEI('Mi señor está loco… y por eso lo sigo. Tomemos su fortaleza.'),
        ],
        outro: 'La carga por el acantilado sorprendió a los Taira, que huyeron en sus barcos. Yoshitsune se volvió una leyenda.',
        goalText: 'Destruí la fortaleza Taira',
        map: 'bosque', biome: 'tropical', size: 'tiny',
        me: { age: 3, res: { food: 600, wood: 600, gold: 500, stone: 200 }, army: [['samurai', 5], ['cavarcher', 5], ['ram', 2]] },
        hero: { type: 'samurai', name: 'Yoshitsune' },
        enemies: [{ civ: 'japoneses', name: 'Clan Taira', diff: 'normal', age: 3, build: [['castle', 1]] }],
        goal: { t: 'destroy', types: ['castle'], label: 'fortaleza' },
      },
      {
        id: 'yoshi2', title: 'Yashima', place: 'Yashima', year: '1185', at: [134.1, 34.35],
        intro: [
          N('Los Taira se refugian en la isla de Yashima. Una tormenta hace que nadie espere un ataque.'),
          YOSHI('Cruzaremos con la tormenta. Prendan fuego a sus casas para que crean que somos un ejército enorme.'),
          BENKEI('Nadie navega con este mar… salvo nosotros.'),
        ],
        outro: 'Los Taira abandonaron Yashima y huyeron al oeste, hacia el estrecho de Shimonoseki.',
        goalText: 'Derrotá al clan Taira en su isla',
        map: 'islas', biome: 'tropical', size: 'tiny',
        me: { age: 3, res: { food: 900, wood: 1000, gold: 600, stone: 200 }, army: [['samurai', 5], ['archer', 4], ['galleon', 3]] },
        hero: { type: 'samurai', name: 'Yoshitsune' },
        enemies: [{ civ: 'japoneses', name: 'Clan Taira', diff: 'normal', age: 3 }],
        goal: { t: 'conquer' },
      },
      {
        id: 'yoshi3', title: 'Dan-no-ura', place: 'Dan-no-ura', year: '1185', at: [130.95, 33.95],
        intro: [
          N('La última batalla de la guerra Genpei será en el mar, en el estrecho de Dan-no-ura.'),
          YOSHI('Cuando la marea cambie, empujará sus barcos contra los nuestros. Hundamos sus muelles y su flota.'),
          BENKEI('Que el mar decida quién gobierna Japón.'),
        ],
        outro: 'La flota Taira fue destruida. Los Minamoto gobernaron Japón y comenzó la era de los samuráis.',
        goalText: 'Destruí los muelles del clan Taira',
        map: 'mediterraneo', biome: 'tropical', size: 'tiny',
        me: { age: 3, res: { food: 1000, wood: 1500, gold: 800, stone: 200 }, army: [['galleon', 4], ['fireship', 3]], build: [['dock', 1]] },
        hero: { type: 'samurai', name: 'Yoshitsune' },
        enemies: [{ civ: 'japoneses', name: 'Clan Taira', diff: 'normal', age: 3, build: [['dock', 2]], army: [['galleon', 3]] }],
        goal: { t: 'destroy', types: ['dock'], label: 'muelles' },
      },
    ],
  },
  {
    id: 'sagas', name: 'Sagas del Norte', civ: 'vikingos', emblem: '🛶', hero: 'Erik', desc: 'Escandinavia, 793: los vikingos navegan hasta el borde del mundo conocido.',
    scenarios: [
      {
        id: 'saga1', title: 'Lindisfarne', place: 'Lindisfarne', year: '793', at: [-1.8, 55.67],
        intro: [
          N('Un amanecer de junio, unos barcos de proa de dragón aparecen frente a la isla sagrada de Lindisfarne.'),
          ERIK('Dicen que el monasterio guarda oro y plata. Nadie lo defiende más que monjes y una palizada.'),
          LEIF('Rápido, antes de que lleguen los guerreros del rey de Northumbria.'),
        ],
        outro: 'El saqueo de Lindisfarne estremeció a Europa. Había comenzado la era vikinga.',
        goalText: 'Destruí el monasterio',
        map: 'costa', biome: 'templado', size: 'tiny',
        me: { age: 2, res: { food: 300, wood: 400, gold: 100 }, army: [['berserker', 6], ['archer', 3]] },
        hero: { type: 'berserker', name: 'Erik' },
        enemies: [{ civ: 'britanos', name: 'Northumbria', diff: 'easy', age: 2, build: [['monastery', 1]] }],
        goal: { t: 'destroy', types: ['monastery'], label: 'monasterio' },
      },
      {
        id: 'saga2', title: 'La tierra de hielo', place: 'Islandia', year: '874', at: [-21.9, 64.1],
        intro: [
          N('Huyendo de reyes y deudas, familias enteras cruzan el mar hacia una isla de volcanes y hielo.'),
          ERIK('Aquí nadie nos dirá qué hacer. Pero el invierno no perdona: necesitamos casas, granjas y un puerto.'),
          LEIF('Si prosperamos rápido, llegaremos a la Edad de los Castillos antes que nuestros vecinos.'),
        ],
        outro: 'Islandia se llenó de granjas. Allí nació el Althing, una de las asambleas más antiguas del mundo.',
        goalText: 'Llegá a la Edad de los Castillos',
        map: 'islas', biome: 'nieve', size: 'tiny',
        me: { age: 1, res: { food: 300, wood: 300, gold: 150, stone: 100 } },
        hero: { type: 'berserker', name: 'Erik' },
        enemies: [{ civ: 'vikingos', name: 'Colonos rivales', diff: 'novice' }],
        goal: { t: 'age', age: 3 },
      },
      {
        id: 'saga3', title: 'Groenlandia', place: 'Brattahlíð', year: '985', at: [-45.5, 61.15],
        intro: [
          N('Erik el Rojo, desterrado de Islandia, funda una colonia en una tierra a la que llama, con astucia, "Tierra Verde".'),
          ERIK('El nombre atraerá colonos. Lo difícil será que sobrevivan al primer invierno.'),
          LEIF('Un clan rival quiere nuestro fiordo. Resistamos hasta que pase la tormenta.'),
        ],
        outro: 'La colonia de Brattahlíð resistió. Durante cuatrocientos años hubo vikingos en Groenlandia.',
        goalText: 'Resistí 10 minutos de invierno',
        map: 'costa', biome: 'nieve', size: 'tiny',
        me: { age: 2, res: { food: 500, wood: 500, gold: 200, stone: 200 }, army: [['berserker', 4], ['archer', 4]] },
        hero: { type: 'berserker', name: 'Erik el Rojo' },
        enemies: [{ civ: 'vikingos', name: 'Clan de Thorgest', diff: 'normal', age: 2 }],
        goal: { t: 'survive', min: 10 },
        waves: { every: 80, from: 100, units: ['berserker', 'axeman', 'archer'], size: 3, grow: 1 },
      },
      {
        id: 'saga4', title: 'Vinlandia', place: 'L\'Anse aux Meadows', year: '1000', at: [-55.5, 51.6],
        intro: [
          N('Leif, hijo de Erik, navega hacia el oeste y encuentra una costa de bosques infinitos y uvas silvestres.'),
          LEIF('La llamaré Vinlandia. Construyamos un asentamiento de verdad: casas, un mercado y una fortaleza.'),
          ERIK('Cuidate de Freydís y su gente: también quieren esta tierra para ellos.'),
        ],
        outro: 'Cinco siglos antes que Colón, los vikingos levantaron casas en América. Sus ruinas todavía se ven en Terranova.',
        goalText: 'Construí 1 castillo, 1 mercado y 5 casas',
        map: 'costa', biome: 'otono', size: 'tiny',
        me: { age: 3, res: { food: 600, wood: 900, gold: 400, stone: 650 }, army: [['berserker', 4]] },
        hero: { type: 'berserker', name: 'Leif' },
        enemies: [{ civ: 'vikingos', name: 'Gente de Freydís', diff: 'easy', age: 2 }],
        goal: { t: 'build', list: [['castle', 1], ['market', 1], ['house', 5]] },
      },
    ],
  },
  {
    id: 'atila', name: 'Atila el Huno', civ: 'hunos', emblem: '🐺', hero: 'Atila', desc: 'Panonia, 434: el azote de Dios cabalga sobre Roma.',
    scenarios: [
      {
        id: 'atila1', title: 'Dos hermanos', place: 'Panonia', year: '434', at: [19.0, 47.5],
        intro: [
          N('Atila y su hermano Bleda heredan el trono de los hunos. Pero un clan rival no acepta su autoridad.'),
          ATILA('Un pueblo con dos voces no es un pueblo. Primero, que todos los clanes sigan a los hijos de Mundzuk.'),
          BLEDA('Sus jinetes son rápidos, pero los nuestros son más. Arrasemos su campamento.'),
        ],
        outro: 'Los clanes hunos se unieron. Muy pronto, Atila gobernaría solo.',
        goalText: 'Derrotá al clan rival',
        map: 'continental', biome: 'templado', size: 'tiny',
        me: { age: 2, res: { food: 400, wood: 400, gold: 200 }, army: [['cavarcher', 3], ['scout', 3]] },
        hero: { type: 'tarkan', name: 'Atila' },
        enemies: [{ civ: 'hunos', name: 'Clan de Ruga', diff: 'easy', age: 2 }],
        goal: { t: 'conquer' },
      },
      {
        id: 'atila2', title: 'Las murallas de Naissus', place: 'Naissus', year: '443', at: [21.9, 43.3],
        intro: [
          N('Roma de Oriente dejó de pagar el tributo. Atila responde atacando Naissus, la ciudad natal de Constantino.'),
          ATILA('Que sus murallas caigan una piedra por vez. Ellos tienen torres; nosotros tenemos paciencia y arietes.'),
          BLEDA('Los ingenieros que capturamos ya armaron los arietes. Sólo hay que llegar al castillo.'),
        ],
        outro: 'Naissus cayó. Años después, los viajeros todavía encontraban los huesos junto al río.',
        goalText: 'Destruí el castillo y las torres de Naissus',
        map: 'arena', biome: 'templado',
        me: { age: 3, res: { food: 800, wood: 800, gold: 600, stone: 200 }, army: [['tarkan', 6], ['ram', 3], ['cavarcher', 4]] },
        hero: { type: 'tarkan', name: 'Atila' },
        enemies: [{ civ: 'bizantinos', name: 'Roma de Oriente', diff: 'normal', age: 3, build: [['castle', 1], ['tower', 2]] }],
        goal: { t: 'destroy', types: ['castle', 'tower'], label: 'defensas' },
      },
      {
        id: 'atila3', title: 'El tributo de oro', place: 'Constantinopla', year: '447', at: [28.97, 41.01],
        intro: [
          N('Constantinopla es demasiado fuerte para tomarla. Pero el emperador puede pagar… y mucho.'),
          ATILA('No quiero sus piedras: quiero su oro. Juntemos el tributo mientras sus soldados se esconden tras las murallas.'),
          BLEDA('Las minas del Danubio y el comercio darán lo suficiente si nadie nos detiene.'),
        ],
        outro: 'El emperador Teodosio aceptó pagar seis mil libras de oro. Atila era ahora el hombre más temido de Europa.',
        goalText: 'Juntá 1.500 de oro',
        map: 'mediterraneo', biome: 'templado', size: 'tiny',
        me: { age: 3, res: { food: 600, wood: 600, gold: 100, stone: 200 }, army: [['tarkan', 4], ['cavarcher', 4]] },
        hero: { type: 'tarkan', name: 'Atila' },
        enemies: [{ civ: 'bizantinos', name: 'Roma de Oriente', diff: 'normal', age: 3 }],
        goal: { t: 'gather', res: 'gold', n: 1500 },
        waves: { every: 110, from: 150, units: ['cataphract', 'archer', 'spearman'], size: 3, grow: 1 },
      },
      {
        id: 'atila4', title: 'Los Campos Cataláunicos', place: 'Campos Cataláunicos', year: '451', at: [4.4, 48.9],
        intro: [
          N('Atila invade la Galia. Romanos de Occidente, francos y visigodos se unen contra él en las llanuras de Champaña.'),
          ATILA('Que vengan todos juntos: así los venceremos de una sola vez. Los ostrogodos cabalgan conmigo.'),
          BLEDA('(Bleda ya no está. Atila gobierna solo, y la batalla decidirá el destino del Imperio.)'),
        ],
        outro: 'La batalla fue una de las más sangrientas de la Antigüedad. La leyenda de Atila, el Azote de Dios, nunca se olvidó.',
        goalText: 'Derrotá a francos y visigodos con la ayuda de los ostrogodos',
        map: 'continental', biome: 'otono', size: 'small',
        me: { age: 3, res: { food: 900, wood: 800, gold: 700, stone: 200 }, army: [['tarkan', 5], ['cavarcher', 5], ['spearman', 4]] },
        hero: { type: 'tarkan', name: 'Atila' },
        allies: [{ civ: 'godos', name: 'Ostrogodos', diff: 'normal', age: 3 }],
        enemies: [{ civ: 'francos', name: 'Francos', diff: 'normal', age: 3 }, { civ: 'godos', name: 'Visigodos', diff: 'normal', age: 3 }],
        goal: { t: 'conquer' },
      },
    ],
  },
];

export const ALL_SCENARIOS: Scenario[] = CAMPAIGNS.flatMap((c) => c.scenarios);
export function findScenario(id: string): { camp: Campaign; scn: Scenario; index: number } | undefined {
  for (const camp of CAMPAIGNS) {
    const index = camp.scenarios.findIndex((s) => s.id === id);
    if (index >= 0) return { camp, scn: camp.scenarios[index], index };
  }
  return undefined;
}

const DIFFS: Difficulty[] = ['novice', 'easy', 'normal', 'hard'];
/** Ajusta un escenario a la dificultad elegida: IA enemiga, oleadas y vida del héroe */
export function scaleScenario(scn: Scenario, diff: Difficulty = 'normal'): Scenario {
  const shift = DIFFS.indexOf(diff) - 2; // principiante -2 … difícil +1
  if (!shift) return scn;
  const move = (d: Difficulty | undefined) => DIFFS[Math.max(0, Math.min(3, DIFFS.indexOf(d ?? 'normal') + shift))];
  const k = [0.4, 0.65, 1, 1.35][shift + 2];
  return {
    ...scn,
    enemies: scn.enemies.map((e) => ({ ...e, diff: move(e.diff) })),
    waves: scn.waves && { ...scn.waves, size: Math.max(1, Math.round(scn.waves.size * k)), grow: shift < 0 ? (shift < -1 ? 0 : 0.5) : scn.waves.grow, every: Math.round(scn.waves.every / Math.min(1.15, k)) },
    heroHp: [9, 7, 5, 4][shift + 2],
  };
}

function hash(s: string): number { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 99991; return h; }

/** Busca lugar libre cerca de (cx, cy) para un edificio */
function spotNear(w: World, p: number, type: BuildingType, cx: number, cy: number, minR = 3): { x: number; y: number } | null {
  const pl = w.players[p];
  const saved = pl.explored;
  pl.explored = new Uint8Array(w.w * w.h).fill(1);
  try {
    for (let r = minR; r < 22; r++)
      for (let k = 0; k < r * 8; k++) {
        const a = (k / (r * 8)) * Math.PI * 2 + r;
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        if (!w.canPlace(p, type, x, y)) return { x, y };
      }
    return null;
  } finally { pl.explored = saved; }
}

function placeArmy(w: World, p: number, list: [UnitType, number][], near: Entity, dir: number) {
  let i = 0;
  for (const [type, n] of list)
    for (let k = 0; k < n; k++, i++) {
      const naval = !!UNITS[type].naval;
      let x = near.x + Math.cos(dir) * 110 + ((i % 5) - 2) * 26, y = near.y + Math.sin(dir) * 110 + Math.floor(i / 5) * 26;
      if (naval) {
        // buscar agua cerca de la base
        let best: { x: number; y: number } | null = null, bd = Infinity;
        for (let t = 0; t < w.terrain.length; t++) {
          if (w.terrain[t] !== 1) continue;
          const tx = (t % w.w) * TILE + 16, ty = ((t / w.w) | 0) * TILE + 16;
          const d = Math.hypot(tx - near.x, ty - near.y) + i * 3;
          if (d < bd && w.nav.solid[t] === 0) { bd = d; best = { x: tx, y: ty }; }
        }
        if (!best) continue;
        x = best.x + ((i % 3) - 1) * 30; y = best.y + Math.floor(i / 3) * 10;
      }
      w.spawnUnit(p, type, x, y);
    }
}

function applySide(w: World, p: number, side: { age?: Age; res?: Partial<ResBag>; army?: [UnitType, number][]; build?: [BuildingType, number][] }) {
  const pl = w.players[p];
  if (side.age) pl.age = side.age;
  if (side.res) for (const r of Object.keys(side.res) as Res[]) pl.res[r] = side.res[r]!;
  const tc = w.buildingsOf(p, 'towncenter')[0];
  if (!tc) return;
  const dir = Math.atan2(w.h * TILE / 2 - tc.y, w.w * TILE / 2 - tc.x);
  const age = pl.age;
  pl.age = 4; // los edificios de la historia se ponen sin importar la edad
  for (const [type, n] of side.build ?? []) {
    for (let k = 0; k < n; k++) {
      const s = spotNear(w, p, type, tc.tx + 1 + Math.cos(dir) * 4, tc.ty + 1 + Math.sin(dir) * 4, type === 'dock' ? 2 : 3);
      if (s) w.placeBuilding(p, type, s.x, s.y, true);
    }
  }
  pl.age = age;
  if (side.army) placeArmy(w, p, side.army, tc, dir);
  // casas para que el ejército inicial no tape la población
  const need = w.popOf(p) + 10 - w.popCap(p);
  for (let k = 0; k < Math.ceil(Math.max(0, need) / 5); k++) {
    const s = spotNear(w, p, 'house', tc.tx + 1 - Math.cos(dir) * 5, tc.ty + 1 - Math.sin(dir) * 5, 4);
    if (s) w.placeBuilding(p, 'house', s.x, s.y, true);
  }
}

/** Arma la partida de un escenario */
export function createScenario(scn: Scenario, color = 0): Match {
  const used = new Set([color]);
  const nextColor = () => { for (let c = 0; c < 8; c++) if (!used.has(c)) { used.add(c); return c; } return 0; };
  const slots: SlotCfg[] = [{ ai: false, civ: CAMPAIGNS.find((c) => c.scenarios.some((x) => x.id === scn.id))!.civ, team: 1, color }];
  for (const a of scn.allies ?? []) slots.push({ ai: true, civ: a.civ, team: 1, color: nextColor(), difficulty: a.diff ?? 'normal' });
  for (const e of scn.enemies) slots.push({ ai: true, civ: e.civ, team: 2, color: nextColor(), difficulty: e.diff ?? 'normal' });
  const m = createMatch({ mode: 'skirmish', difficulty: 'normal', seed: hash(scn.id), map: scn.map, biome: scn.biome, size: scn.size, players: slots });
  const w = m.world;
  const sides = [scn.me, ...(scn.allies ?? []), ...scn.enemies];
  sides.forEach((s, i) => {
    if (i > 0) w.players[i].name = (s as Side).name;
    applySide(w, i, s);
  });
  // héroe
  if (scn.hero) {
    const tc = w.buildingsOf(0, 'towncenter')[0];
    const h = w.spawnUnit(0, scn.hero.type, tc.x, tc.y + 80);
    h.hero = scn.hero.name;
    h.maxHp = h.hp = Math.round(h.maxHp * (scn.heroHp ?? 5));
  }
  w.refreshVisibility();
  m.cfg = { ...m.cfg, mode: 'scenario', scenario: scn.id, color };
  return m;
}

export type ScnStatus = 'win' | 'lose' | null;

/** Lleva la cuenta del objetivo de un escenario. Se llama una vez por tick de simulación. */
export class ScenarioState {
  readonly heroId: number;
  private waveN = 0;
  private nextWave: number;
  readonly targets: number[] = [];
  private startTechs = 0;
  events: string[] = [];

  constructor(private w: World, readonly scn: Scenario) {
    this.heroId = [...w.entities.values()].find((e) => e.hero && e.owner === 0)?.id ?? 0;
    this.nextWave = (scn.waves?.from ?? 0) * TICK_RATE;
    if (scn.goal.t === 'destroy') {
      const types = scn.goal.types;
      for (const e of w.entities.values()) if (e.cat === 'building' && w.isEnemy(0, e.owner) && types.includes(e.type as BuildingType)) this.targets.push(e.id);
    }
    this.startTechs = w.players[0].techs.size;
  }

  get enemyTeam() { return this.w.players.find((p) => this.w.isEnemy(0, p.id))?.team ?? 2; }

  /** Texto de progreso del objetivo */
  progress(): string {
    const w = this.w, g = this.scn.goal, pl = w.players[0];
    switch (g.t) {
      case 'destroy': return `${this.targets.filter((id) => !w.entities.has(id)).length}/${this.targets.length}`;
      case 'survive': {
        const left = Math.max(0, g.min * 60 - Math.floor(w.tick / TICK_RATE));
        return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      }
      case 'gather': return `${Math.min(g.n, Math.floor(pl.res[g.res]))}/${g.n}`;
      case 'age': return `${pl.age}/${g.age}`;
      case 'build': return g.list.map(([t, n]) => `${Math.min(n, w.buildingsOf(0, t, true).length)}/${n} ${BUILDINGS[t].name.toLowerCase()}`).join(' · ');
      default: return '';
    }
  }

  step(): ScnStatus {
    const w = this.w, scn = this.scn, g = scn.goal, pl = w.players[0];
    if (w.winnerTeam >= 0) return w.winnerTeam === pl.team ? 'win' : 'lose';
    if (this.heroId && !w.entities.has(this.heroId)) {
      w.winnerTeam = this.enemyTeam;
      this.events.push(`💀 ${scn.hero!.name} cayó en combate`);
      return 'lose';
    }
    // oleadas
    if (scn.waves && w.tick >= this.nextWave) {
      const wv = scn.waves;
      this.nextWave = w.tick + wv.every * TICK_RATE;
      const enemy = w.players.find((p) => w.isEnemy(0, p.id) && !p.defeated);
      const myTc = w.buildingsOf(0, 'towncenter')[0];
      const from = enemy ? w.buildingsOf(enemy.id, 'towncenter')[0] : undefined;
      if (enemy && myTc && from) {
        const n = Math.round(wv.size + this.waveN * wv.grow);
        const ids: number[] = [];
        for (let k = 0; k < n; k++) {
          const t = wv.units[(k + this.waveN) % wv.units.length];
          const a = (k / n) * Math.PI * 2;
          ids.push(w.spawnUnit(enemy.id, t, from.x + Math.cos(a) * 70, from.y + Math.sin(a) * 70).id);
        }
        w.issue({ t: 'attackMove', p: enemy.id, ids, x: myTc.x, y: myTc.y });
        this.waveN++;
        this.events.push(`⚔️ ¡Oleada ${this.waveN}! ${n} soldados enemigos vienen hacia tu aldea`);
      }
    }
    let won = false;
    switch (g.t) {
      case 'destroy': won = this.targets.length > 0 && this.targets.every((id) => !w.entities.has(id)); break;
      case 'survive': won = w.tick >= g.min * 60 * TICK_RATE; break;
      case 'gather': won = pl.res[g.res] >= g.n; break;
      case 'age': won = pl.age >= g.age; break;
      case 'build': won = g.list.every(([t, n]) => w.buildingsOf(0, t, true).length >= n); break;
      default: break;
    }
    if (won) { w.winnerTeam = pl.team; return 'win'; }
    void this.startTechs;
    return null;
  }
}

/** Nombre del color, para los mensajes */
export const colorName = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length].name;
