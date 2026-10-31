// Datos de balance del juego. Todo lo numérico vive acá para poder ajustar sin tocar lógica.

export const TICK_RATE = 20; // ticks de simulación por segundo
export const DT = 1 / TICK_RATE;
export const TILE = 32; // px por casilla

export type Res = 'food' | 'wood' | 'gold' | 'stone';
export const RES_LIST: Res[] = ['food', 'wood', 'gold', 'stone'];
export type ResBag = Record<Res, number>;
export const RES_NAME: Record<Res, string> = { food: 'Comida', wood: 'Madera', gold: 'Oro', stone: 'Piedra' };

export type Age = 1 | 2 | 3 | 4;
export const AGE_NAME: Record<Age, string> = { 1: 'Edad Oscura', 2: 'Edad Media', 3: 'Edad de los Castillos', 4: 'Edad Imperial' };
export const AGE_SHORT: Record<Age, string> = { 1: 'Oscura', 2: 'Media', 3: 'Castillos', 4: 'Imperial' };
export const AGE_UPS: Record<2 | 3 | 4, { cost: Partial<ResBag>; time: number }> = {
  2: { cost: { food: 400 }, time: 30 },
  3: { cost: { food: 700, gold: 200 }, time: 40 },
  4: { cost: { food: 900, gold: 600 }, time: 50 },
};

export type UnitType =
  | 'villager' | 'militia' | 'spearman' | 'champion'
  | 'archer' | 'skirmisher' | 'cavarcher' | 'handcannon'
  | 'scout' | 'knight' | 'camel' | 'eagle'
  | 'ram' | 'mangonel' | 'bombard' | 'trebuchet'
  | 'monk'
  | 'fishship' | 'galleon' | 'fireship' | 'cannongalleon' | 'tradecart' | 'tradecog' | 'transport'
  // unidades únicas de cada civilización
  | 'longbow' | 'axeman' | 'conquistador' | 'cataphract' | 'mangudai'
  | 'samurai' | 'chukonu' | 'elephant' | 'berserker' | 'janissary'
  | 'huskarl' | 'jaguar' | 'tarkan' | 'teutonic' | 'plumed';

export type BuildingType =
  | 'towncenter' | 'house' | 'barracks' | 'range' | 'stable' | 'workshop'
  | 'mill' | 'lumbercamp' | 'miningcamp' | 'farm' | 'tower'
  | 'blacksmith' | 'market' | 'castle' | 'monastery' | 'wall'
  | 'dock' | 'university' | 'stonewall' | 'gate';
export type NodeType = 'tree' | 'berries' | 'goldmine' | 'stonemine' | 'fish';

export type ArmorClass = 'infantry' | 'archer' | 'cavalry' | 'siege' | 'villager' | 'building' | 'ship' | 'camel';
export type Projectile = 'arrow' | 'stone' | 'ball' | 'fire' | 'axe' | 'bolt';

export type TechType =
  | 'forge' | 'mail' | 'fletching' | 'barding'
  | 'axe' | 'plow' | 'mining' | 'wheelbarrow' | 'loom'
  | 'masonry' | 'architecture' | 'chemistry' | 'ballistics' | 'murderholes' | 'siegeeng'
  /** mejora de línea de cada unidad (élite) */
  | `up_${UnitType}`;

export interface UnitDef {
  name: string;
  hp: number;
  atk: number;
  atkType: 'melee' | 'pierce';
  cooldown: number; // s
  range: number; // px (distancia entre bordes)
  armorMelee: number;
  armorPierce: number;
  speed: number; // px/s
  radius: number;
  sight: number; // casillas
  cost: Partial<ResBag>;
  trainTime: number; // s
  age: Age;
  cls: ArmorClass;
  bonus?: Partial<Record<ArmorClass, number>>;
  onlyBuildings?: boolean;
  heals?: boolean;
  naval?: boolean;
  mounted?: boolean;
  gunpowder?: boolean;
  gathers?: boolean; // barco pesquero
  requires?: TechType;
  splash?: number; // radio de daño en área (px)
  multishot?: number; // flechas extra a enemigos cercanos
  regen?: number; // vida por segundo
  projectile?: Projectile;
  unique?: boolean;
  /** clases extra que reciben bonificaciones (p. ej. el camello es caballería y además camello) */
  tags?: ArmorClass[];
  /** comercia con mercados (carreta) o muelles (barca) aliados */
  trade?: boolean;
  /** barco de transporte: cuántas unidades de tierra lleva */
  carries?: number;
  desc: string;
}

const T = TILE;

export const UNITS: Record<UnitType, UnitDef> = {
  villager: {
    name: 'Aldeano', hp: 25, atk: 3, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 0, armorPierce: 0,
    speed: 52, radius: 7, sight: 5, cost: { food: 50 }, trainTime: 10, age: 1, cls: 'villager',
    desc: 'Recolecta y construye.',
  },
  // ---------------------------------------------------------------- infantería
  militia: {
    name: 'Espadachín', hp: 55, atk: 7, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 1, armorPierce: 1,
    speed: 48, radius: 8, sight: 5, cost: { food: 60, gold: 20 }, trainTime: 12, age: 1, cls: 'infantry',
    bonus: { building: 4 }, desc: 'Infantería resistente. Buena contra edificios.',
  },
  spearman: {
    name: 'Lancero', hp: 45, atk: 4, atkType: 'melee', cooldown: 2, range: 6, armorMelee: 0, armorPierce: 0,
    speed: 52, radius: 8, sight: 5, cost: { food: 35, wood: 25 }, trainTime: 10, age: 2, cls: 'infantry',
    bonus: { cavalry: 18 }, desc: 'Barato. Destroza caballería.',
  },
  champion: {
    name: 'Campeón', hp: 80, atk: 12, atkType: 'melee', cooldown: 1.8, range: 4, armorMelee: 2, armorPierce: 2,
    speed: 50, radius: 9, sight: 6, cost: { food: 60, gold: 25 }, trainTime: 14, age: 4, cls: 'infantry',
    bonus: { building: 6, infantry: 2 }, desc: 'La mejor infantería con espada.',
  },
  // ---------------------------------------------------------------- arquería
  archer: {
    name: 'Arquero', hp: 30, atk: 4, atkType: 'pierce', cooldown: 2, range: 4.5 * T, armorMelee: 0, armorPierce: 0,
    speed: 50, radius: 7, sight: 6, cost: { wood: 25, gold: 45 }, trainTime: 13, age: 2, cls: 'archer',
    bonus: { infantry: 3, camel: 4 }, projectile: 'arrow', desc: 'Ataque a distancia. Fuerte contra infantería.',
  },
  skirmisher: {
    name: 'Escaramuzador', hp: 30, atk: 2, atkType: 'pierce', cooldown: 2.2, range: 4 * T, armorMelee: 0, armorPierce: 3,
    speed: 50, radius: 7, sight: 6, cost: { food: 25, wood: 35 }, trainTime: 11, age: 2, cls: 'archer',
    bonus: { archer: 4 }, projectile: 'bolt', desc: 'Jabalinas baratas que cazan arqueros.',
  },
  cavarcher: {
    name: 'Arquero a caballo', hp: 50, atk: 5, atkType: 'pierce', cooldown: 2, range: 4 * T, armorMelee: 0, armorPierce: 1,
    speed: 78, radius: 10, sight: 6, cost: { wood: 40, gold: 70 }, trainTime: 16, age: 3, cls: 'archer', mounted: true,
    bonus: { infantry: 2, camel: 4 }, projectile: 'arrow', desc: 'Arquero veloz que golpea y huye.',
  },
  handcannon: {
    name: 'Arcabucero', hp: 35, atk: 15, atkType: 'pierce', cooldown: 3.5, range: 5.5 * T, armorMelee: 1, armorPierce: 0,
    speed: 46, radius: 8, sight: 7, cost: { food: 45, gold: 50 }, trainTime: 16, age: 4, cls: 'archer', gunpowder: true,
    requires: 'chemistry', bonus: { infantry: 6 }, projectile: 'ball', desc: 'Pólvora devastadora contra infantería.',
  },
  // ---------------------------------------------------------------- caballería
  scout: {
    name: 'Explorador', hp: 50, atk: 4, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 0, armorPierce: 2,
    speed: 92, radius: 9, sight: 8, cost: { food: 80 }, trainTime: 12, age: 2, cls: 'cavalry', mounted: true,
    bonus: { siege: 6 }, desc: 'Caballería ligera y rápida. Caza asedio y arqueros sueltos.',
  },
  knight: {
    name: 'Caballero', hp: 110, atk: 10, atkType: 'melee', cooldown: 1.8, range: 4, armorMelee: 2, armorPierce: 2,
    speed: 80, radius: 10, sight: 6, cost: { food: 60, gold: 75 }, trainTime: 16, age: 3, cls: 'cavalry', mounted: true,
    bonus: { archer: 6 }, desc: 'Caballería pesada. Arrasa arqueros.',
  },
  eagle: {
    name: 'Guerrero águila', hp: 50, atk: 6, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 0, armorPierce: 3,
    speed: 72, radius: 8, sight: 8, cost: { food: 20, gold: 50 }, trainTime: 10, age: 1, cls: 'infantry',
    bonus: { siege: 5, archer: 2 }, desc: 'Infantería barata y veloz de los pueblos mesoamericanos: hace de explorador y caza arqueros, monjes y asedio.',
  },
  camel: {
    name: 'Jinete de camello', hp: 100, atk: 6, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 0, armorPierce: 0,
    speed: 76, radius: 10, sight: 5, cost: { food: 55, gold: 60 }, trainTime: 15, age: 3, cls: 'cavalry', mounted: true, tags: ['camel'],
    bonus: { cavalry: 9 }, desc: 'Espanta a los caballos: destroza caballería, pero las flechas lo castigan.',
  },
  // ---------------------------------------------------------------- asedio
  ram: {
    name: 'Ariete', hp: 180, atk: 3, atkType: 'melee', cooldown: 3, range: 4, armorMelee: 0, armorPierce: 40,
    speed: 30, radius: 13, sight: 3, cost: { wood: 160, gold: 75 }, trainTime: 25, age: 3, cls: 'siege',
    bonus: { building: 45 }, onlyBuildings: true, desc: 'Derriba edificios. Inmune a flechas.',
  },
  mangonel: {
    name: 'Mangana', hp: 55, atk: 28, atkType: 'melee', cooldown: 6, range: 6 * T, armorMelee: 0, armorPierce: 6,
    speed: 30, radius: 12, sight: 7, cost: { wood: 160, gold: 135 }, trainTime: 24, age: 3, cls: 'siege',
    bonus: { building: 10 }, splash: 30, projectile: 'stone', desc: 'Lanza piedras que dañan en área.',
  },
  bombard: {
    name: 'Cañón de bombardeo', hp: 80, atk: 30, atkType: 'pierce', cooldown: 6.5, range: 9 * T, armorMelee: 2, armorPierce: 5,
    speed: 28, radius: 13, sight: 10, cost: { wood: 225, gold: 225 }, trainTime: 30, age: 4, cls: 'siege', gunpowder: true,
    requires: 'chemistry', bonus: { building: 60, siege: 20 }, projectile: 'ball', desc: 'Cañón de largo alcance que destroza muros.',
  },
  trebuchet: {
    name: 'Fundíbulo', hp: 150, atk: 40, atkType: 'melee', cooldown: 8, range: 12 * T, armorMelee: 1, armorPierce: 150,
    speed: 24, radius: 14, sight: 13, cost: { wood: 200, gold: 200 }, trainTime: 35, age: 4, cls: 'siege',
    bonus: { building: 160 }, onlyBuildings: true, projectile: 'stone', desc: 'El asedio de mayor alcance. Solo ataca edificios.',
  },
  monk: {
    name: 'Monje', hp: 30, atk: 0, atkType: 'melee', cooldown: 1, range: 4 * T, armorMelee: 0, armorPierce: 0,
    speed: 40, radius: 7, sight: 7, cost: { gold: 100 }, trainTime: 18, age: 3, cls: 'infantry',
    heals: true, desc: 'Cura a las unidades aliadas cercanas.',
  },
  // ---------------------------------------------------------------- barcos
  fishship: {
    name: 'Barco pesquero', hp: 60, atk: 0, atkType: 'melee', cooldown: 1, range: 4, armorMelee: 0, armorPierce: 4,
    speed: 62, radius: 11, sight: 5, cost: { wood: 75 }, trainTime: 15, age: 1, cls: 'ship', naval: true, gathers: true,
    desc: 'Pesca y lleva la comida al muelle.',
  },
  tradecart: {
    name: 'Carreta mercante', hp: 70, atk: 0, atkType: 'melee', cooldown: 1, range: 4, armorMelee: 0, armorPierce: 0,
    speed: 60, radius: 10, sight: 4, cost: { wood: 100, gold: 50 }, trainTime: 20, age: 2, cls: 'villager', trade: true,
    desc: 'Viaja hasta el mercado de un aliado y vuelve con oro. Cuanto más lejos, más oro.',
  },
  transport: {
    name: 'Barco de transporte', hp: 150, atk: 0, atkType: 'melee', cooldown: 1, range: 4, armorMelee: 0, armorPierce: 4,
    speed: 64, radius: 17, sight: 5, cost: { wood: 125 }, trainTime: 15, age: 2, cls: 'ship', naval: true, carries: 5,
    desc: 'Cruza unidades de tierra por el agua: lleva 5 (10 con su mejora). Si se hunde, se hunden con él.',
  },
  tradecog: {
    name: 'Coca mercante', hp: 80, atk: 0, atkType: 'melee', cooldown: 1, range: 4, armorMelee: 0, armorPierce: 2,
    speed: 66, radius: 11, sight: 5, cost: { wood: 100, gold: 50 }, trainTime: 20, age: 2, cls: 'ship', naval: true, trade: true,
    desc: 'Navega hasta el muelle de un aliado y vuelve con oro.',
  },
  galleon: {
    name: 'Galeón', hp: 140, atk: 7, atkType: 'pierce', cooldown: 2.5, range: 6 * T, armorMelee: 0, armorPierce: 6,
    speed: 66, radius: 16, sight: 8, cost: { wood: 90, gold: 30 }, trainTime: 20, age: 2, cls: 'ship', naval: true,
    bonus: { ship: 4, building: 2 }, projectile: 'arrow', desc: 'Barco de guerra que dispara a distancia.',
  },
  fireship: {
    name: 'Barco incendiario', hp: 120, atk: 1, atkType: 'melee', cooldown: 0.3, range: 2 * T, armorMelee: 0, armorPierce: 5,
    speed: 74, radius: 14, sight: 6, cost: { wood: 75, gold: 45 }, trainTime: 20, age: 3, cls: 'ship', naval: true,
    bonus: { ship: 4 }, projectile: 'fire', desc: 'Lanzallamas de corto alcance. Quema barcos enemigos.',
  },
  cannongalleon: {
    name: 'Galeón cañonero', hp: 120, atk: 35, atkType: 'pierce', cooldown: 9, range: 12 * T, armorMelee: 0, armorPierce: 6,
    speed: 50, radius: 18, sight: 12, cost: { wood: 200, gold: 150 }, trainTime: 30, age: 4, cls: 'ship', naval: true,
    gunpowder: true, requires: 'chemistry', bonus: { building: 40 }, projectile: 'ball', desc: 'Bombardea la costa desde muy lejos.',
  },
  // ---------------------------------------------------------------- únicas
  longbow: {
    name: 'Arquero de arco largo', hp: 35, atk: 6, atkType: 'pierce', cooldown: 2, range: 7 * T, armorMelee: 0, armorPierce: 1,
    speed: 48, radius: 7, sight: 9, cost: { wood: 35, gold: 40 }, trainTime: 14, age: 3, cls: 'archer', unique: true,
    bonus: { infantry: 2, camel: 4 }, projectile: 'arrow', desc: 'Única de los Británicos. Alcance enorme.',
  },
  axeman: {
    name: 'Lanzador de hachas', hp: 60, atk: 7, atkType: 'melee', cooldown: 2, range: 3 * T, armorMelee: 0, armorPierce: 1,
    speed: 52, radius: 8, sight: 6, cost: { food: 55, gold: 25 }, trainTime: 14, age: 3, cls: 'infantry', unique: true,
    projectile: 'axe', desc: 'Única de los Francos. Infantería que arroja hachas.',
  },
  conquistador: {
    name: 'Conquistador', hp: 60, atk: 16, atkType: 'pierce', cooldown: 2.9, range: 5 * T, armorMelee: 2, armorPierce: 2,
    speed: 82, radius: 10, sight: 6, cost: { food: 60, gold: 70 }, trainTime: 18, age: 3, cls: 'cavalry', mounted: true, gunpowder: true,
    unique: true, bonus: { infantry: 4 }, projectile: 'ball', desc: 'Única de los Españoles. Jinete con arcabuz.',
  },
  cataphract: {
    name: 'Catafracto', hp: 115, atk: 9, atkType: 'melee', cooldown: 1.8, range: 4, armorMelee: 2, armorPierce: 1,
    speed: 76, radius: 10, sight: 5, cost: { food: 70, gold: 75 }, trainTime: 18, age: 3, cls: 'cavalry', mounted: true,
    unique: true, bonus: { infantry: 10 }, splash: 14, desc: 'Única de los Bizantinos. Aplasta a la infantería.',
  },
  mangudai: {
    name: 'Mangudai', hp: 60, atk: 6, atkType: 'pierce', cooldown: 1.8, range: 4 * T, armorMelee: 0, armorPierce: 1,
    speed: 86, radius: 10, sight: 7, cost: { wood: 55, gold: 65 }, trainTime: 18, age: 3, cls: 'archer', mounted: true,
    unique: true, bonus: { siege: 4, infantry: 1, camel: 4 }, projectile: 'arrow', desc: 'Única de los Mongoles. Arquero a caballo letal.',
  },
  samurai: {
    name: 'Samurái', hp: 62, atk: 9, atkType: 'melee', cooldown: 1.45, range: 4, armorMelee: 1, armorPierce: 1,
    speed: 52, radius: 8, sight: 5, cost: { food: 60, gold: 30 }, trainTime: 14, age: 3, cls: 'infantry', unique: true,
    bonus: { infantry: 4, building: 3 }, desc: 'Único de los Japoneses. Espadachín veloz y letal.',
  },
  chukonu: {
    name: 'Chu Ko Nu', hp: 45, atk: 4, atkType: 'pierce', cooldown: 2, range: 4 * T, armorMelee: 0, armorPierce: 0,
    speed: 50, radius: 7, sight: 6, cost: { food: 40, wood: 35 }, trainTime: 13, age: 3, cls: 'archer', unique: true,
    multishot: 2, bonus: { infantry: 1, camel: 4 }, projectile: 'bolt', desc: 'Única de los Chinos. Ballesta que dispara ráfagas.',
  },
  elephant: {
    name: 'Elefante de guerra', hp: 320, atk: 16, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 1, armorPierce: 2,
    speed: 36, radius: 15, sight: 5, cost: { food: 170, gold: 85 }, trainTime: 25, age: 3, cls: 'cavalry', mounted: true,
    unique: true, splash: 20, bonus: { building: 7 }, desc: 'Única de los Persas. Lento pero imparable.',
  },
  berserker: {
    name: 'Berserker', hp: 62, atk: 9, atkType: 'melee', cooldown: 1.9, range: 4, armorMelee: 1, armorPierce: 1,
    speed: 52, radius: 8, sight: 5, cost: { food: 65, gold: 25 }, trainTime: 14, age: 3, cls: 'infantry', unique: true,
    regen: 1.5, bonus: { cavalry: 2 }, desc: 'Única de los Vikingos. Se cura sola en combate.',
  },
  janissary: {
    name: 'Jenízaro', hp: 40, atk: 17, atkType: 'pierce', cooldown: 3.4, range: 7 * T, armorMelee: 1, armorPierce: 0,
    speed: 46, radius: 8, sight: 8, cost: { food: 60, gold: 55 }, trainTime: 16, age: 3, cls: 'archer', gunpowder: true,
    unique: true, bonus: { infantry: 2 }, projectile: 'ball', desc: 'Única de los Turcos. Arcabucero de élite.',
  },
  huskarl: {
    name: 'Huscarle', hp: 60, atk: 10, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 0, armorPierce: 6,
    speed: 56, radius: 8, sight: 5, cost: { food: 52, gold: 26 }, trainTime: 13, age: 3, cls: 'infantry', unique: true,
    bonus: { archer: 6, building: 2 }, desc: 'Única de los Godos. Casi inmune a las flechas: caza arqueros.',
  },
  jaguar: {
    name: 'Guerrero jaguar', hp: 65, atk: 10, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 1, armorPierce: 1,
    speed: 54, radius: 8, sight: 5, cost: { food: 60, gold: 30 }, trainTime: 15, age: 3, cls: 'infantry', unique: true,
    bonus: { infantry: 10 }, desc: 'Única de los Aztecas. Destroza a la infantería enemiga.',
  },
  tarkan: {
    name: 'Tarkán', hp: 100, atk: 8, atkType: 'melee', cooldown: 2.1, range: 4, armorMelee: 1, armorPierce: 3,
    speed: 82, radius: 10, sight: 6, cost: { food: 60, gold: 60 }, trainTime: 16, age: 3, cls: 'cavalry', mounted: true, unique: true,
    bonus: { building: 10 }, desc: 'Única de los Hunos. Jinete incendiario que arrasa edificios.',
  },
  teutonic: {
    name: 'Caballero teutón', hp: 90, atk: 12, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 5, armorPierce: 2,
    speed: 38, radius: 9, sight: 5, cost: { food: 85, gold: 40 }, trainTime: 16, age: 3, cls: 'infantry', unique: true,
    bonus: { cavalry: 2, infantry: 2 }, desc: 'Única de los Teutones. Lento, pero una muralla de acero.',
  },
  plumed: {
    name: 'Arquero emplumado', hp: 50, atk: 5, atkType: 'pierce', cooldown: 1.9, range: 5 * T, armorMelee: 0, armorPierce: 1,
    speed: 64, radius: 7, sight: 7, cost: { wood: 46, gold: 46 }, trainTime: 13, age: 3, cls: 'archer', unique: true,
    bonus: { infantry: 1, camel: 4 }, projectile: 'arrow', desc: 'Única de los Mayas. Arquero rápido y resistente.',
  },
};

export interface BuildingDef {
  name: string;
  size: number; // casillas por lado
  hp: number;
  cost: Partial<ResBag>;
  buildTime: number;
  age: Age;
  pop?: number;
  trains?: UnitType[];
  drop?: Res[];
  sight: number;
  attack?: { atk: number; range: number; cooldown: number };
  food?: number; // granja
  research?: TechType[];
  trade?: boolean;
  onWater?: boolean;
  line?: boolean; // se traza como línea (murallas)
  onWall?: boolean; // puede reemplazar un tramo de muralla propia
  desc: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  towncenter: {
    name: 'Centro Urbano', size: 3, hp: 1400, cost: { wood: 275, stone: 100 }, buildTime: 60, age: 3, pop: 10,
    trains: ['villager'], drop: ['food', 'wood', 'gold', 'stone'], sight: 8,
    attack: { atk: 5, range: 6 * TILE, cooldown: 2 }, desc: 'Corazón de tu aldea. Si cae, perdés.',
  },
  house: { name: 'Casa', size: 2, hp: 300, cost: { wood: 25 }, buildTime: 10, age: 1, pop: 5, sight: 3, desc: '+5 de población.' },
  barracks: { name: 'Cuartel', size: 3, hp: 900, cost: { wood: 150 }, buildTime: 22, age: 1, trains: ['militia', 'spearman', 'eagle', 'champion'], sight: 4, desc: 'Entrena infantería.' },
  range: { name: 'Galería de tiro', size: 3, hp: 900, cost: { wood: 150 }, buildTime: 22, age: 2, trains: ['archer', 'skirmisher', 'cavarcher', 'handcannon'], sight: 4, desc: 'Entrena arqueros y pólvora.' },
  stable: { name: 'Establo', size: 3, hp: 900, cost: { wood: 175 }, buildTime: 25, age: 2, trains: ['scout', 'knight', 'camel'], sight: 4, desc: 'Entrena caballería.' },
  workshop: { name: 'Taller de asedio', size: 3, hp: 900, cost: { wood: 200 }, buildTime: 28, age: 3, trains: ['ram', 'mangonel', 'bombard'], sight: 4, desc: 'Construye armas de asedio.' },
  mill: { name: 'Molino', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['food'], sight: 4, research: ['plow'], desc: 'Depósito de comida.' },
  lumbercamp: { name: 'Aserradero', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['wood'], sight: 4, research: ['axe'], desc: 'Depósito de madera.' },
  miningcamp: { name: 'Campamento minero', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['gold', 'stone'], sight: 4, research: ['mining'], desc: 'Depósito de oro y piedra.' },
  farm: { name: 'Granja', size: 2, hp: 200, cost: { wood: 60 }, buildTime: 8, age: 1, sight: 1, food: 600, desc: 'Comida casi inagotable. Necesita un molino.' },
  tower: {
    name: 'Torre de vigía', size: 1, hp: 700, cost: { wood: 50, stone: 125 }, buildTime: 28, age: 2, sight: 8,
    attack: { atk: 6, range: 7 * TILE, cooldown: 2 }, desc: 'Defensa que dispara flechas.',
  },
  blacksmith: { name: 'Herrería', size: 2, hp: 700, cost: { wood: 150 }, buildTime: 20, age: 2, sight: 4, research: ['forge', 'mail', 'fletching', 'barding'], desc: 'Mejora el ataque y la armadura del ejército.' },
  market: { name: 'Mercado', size: 3, hp: 800, cost: { wood: 175 }, buildTime: 24, age: 2, sight: 4, trade: true, trains: ['tradecart'], desc: 'Comprá y vendé recursos por oro. Entrena carretas mercantes para comerciar con aliados.' },
  monastery: { name: 'Monasterio', size: 3, hp: 900, cost: { wood: 175 }, buildTime: 25, age: 3, sight: 5, trains: ['monk'], desc: 'Entrena monjes sanadores.' },
  university: {
    name: 'Universidad', size: 3, hp: 1100, cost: { wood: 200 }, buildTime: 30, age: 3, sight: 4,
    research: ['masonry', 'ballistics', 'murderholes', 'chemistry', 'architecture', 'siegeeng'], desc: 'Albañilería, Química, Balística y más.',
  },
  castle: {
    name: 'Castillo', size: 4, hp: 3200, cost: { stone: 450, wood: 100 }, buildTime: 55, age: 3, pop: 10, sight: 10,
    trains: ['trebuchet'], attack: { atk: 8, range: 8 * TILE, cooldown: 1.2 }, desc: 'Fortaleza: entrena la unidad única de tu civilización.',
  },
  dock: {
    name: 'Muelle', size: 2, hp: 1200, cost: { wood: 150 }, buildTime: 25, age: 1, sight: 6, onWater: true,
    trains: ['fishship', 'transport', 'galleon', 'fireship', 'cannongalleon', 'tradecog'], drop: ['food'], desc: 'Se construye en el agua, pegado a la costa.',
  },
  wall: { name: 'Empalizada', size: 1, hp: 350, cost: { wood: 4 }, buildTime: 4, age: 1, sight: 1, line: true, desc: 'Muro de madera. Tocá dos puntos para trazarla.' },
  gate: { name: 'Portón', size: 3, hp: 2000, cost: { stone: 40 }, buildTime: 20, age: 2, sight: 3, onWall: true, desc: 'Ocupa 3 tramos de tu muralla. Se abre para tu equipo y se puede bloquear.' },
  stonewall: { name: 'Muralla de piedra', size: 1, hp: 1200, cost: { stone: 6 }, buildTime: 7, age: 2, sight: 1, line: true, desc: 'Muro de piedra muy resistente.' },
};

export interface TechDef { name: string; icon: string; cost: Partial<ResBag>; time: number; age: Age; desc: string; unit?: UnitType; /** nombre de la unidad ya mejorada */ unitName?: string }
export const TECHS = {
  forge: { name: 'Forja', icon: '🔥', cost: { food: 150, gold: 50 }, time: 25, age: 2, desc: '+1 de ataque cuerpo a cuerpo.' },
  mail: { name: 'Cota de malla', icon: '🦺', cost: { food: 150, gold: 75 }, time: 30, age: 2, desc: 'Infantería +1/+1 de armadura.' },
  fletching: { name: 'Emplumado', icon: '🪶', cost: { food: 100, wood: 50 }, time: 25, age: 2, desc: 'Arqueros, torres y barcos +1 de ataque y alcance.' },
  barding: { name: 'Barda', icon: '🐴', cost: { food: 150, gold: 100 }, time: 30, age: 3, desc: 'Caballería +1/+2 de armadura.' },
  axe: { name: 'Hacha doble', icon: '🪓', cost: { food: 100, wood: 50 }, time: 20, age: 1, desc: '+20% velocidad cortando madera.' },
  plow: { name: 'Arado', icon: '🌾', cost: { food: 50, wood: 125 }, time: 20, age: 1, desc: '+20% de comida en granjas y bayas.' },
  mining: { name: 'Minería', icon: '⛏️', cost: { food: 100, wood: 75 }, time: 20, age: 1, desc: '+20% de oro y piedra.' },
  wheelbarrow: { name: 'Carretilla', icon: '🛒', cost: { food: 175, wood: 50 }, time: 25, age: 1, desc: 'Aldeanos 15% más rápidos y cargan +5.' },
  loom: { name: 'Telar', icon: '🧵', cost: { gold: 50 }, time: 15, age: 1, desc: 'Aldeanos +15 de vida y +1/+2 de armadura.' },
  masonry: { name: 'Albañilería', icon: '🧱', cost: { wood: 175, stone: 150 }, time: 30, age: 3, desc: 'Edificios +10% de vida y +1/+1 de armadura.' },
  architecture: { name: 'Arquitectura', icon: '📐', cost: { wood: 300, stone: 200 }, time: 40, age: 4, desc: 'Edificios +10% de vida y +1/+1 de armadura.' },
  chemistry: { name: 'Química', icon: '⚗️', cost: { food: 300, gold: 200 }, time: 40, age: 4, desc: '+1 de ataque a distancia. Desbloquea la pólvora.' },
  ballistics: { name: 'Balística', icon: '🎯', cost: { wood: 300, gold: 175 }, time: 35, age: 3, desc: 'Las unidades a distancia disparan 10% más rápido.' },
  murderholes: { name: 'Matacanes', icon: '🏯', cost: { food: 200, stone: 100 }, time: 30, age: 3, desc: 'Torres, castillos y centros urbanos +3 de ataque.' },
  siegeeng: { name: 'Ingeniería de asedio', icon: '⚙️', cost: { food: 300, wood: 300 }, time: 40, age: 4, desc: 'Asedio +1 de alcance y +20% de daño a edificios.' },
} as Record<TechType, TechDef>;

export const BUILDING_ARMOR = { melee: 2, pierce: 6 };

export interface NodeDef { name: string; res: Res; amount: number; size: number; rate: number }
export const NODES: Record<NodeType, NodeDef> = {
  tree: { name: 'Árbol', res: 'wood', amount: 100, size: 1, rate: 0.95 },
  berries: { name: 'Arbustos de bayas', res: 'food', amount: 150, size: 1, rate: 0.85 },
  goldmine: { name: 'Mina de oro', res: 'gold', amount: 800, size: 1, rate: 0.8 },
  stonemine: { name: 'Cantera', res: 'stone', amount: 400, size: 1, rate: 0.8 },
  fish: { name: 'Banco de peces', res: 'food', amount: 250, size: 1, rate: 0.85 },
};
export const FARM_RATE = 0.75;
export const CARRY = 10;
export const SHIP_CARRY = 15;
export const MAX_POP = 125;
export const TRADE = { buy: 130, sell: 70, lot: 100 };

export const START_RES: ResBag = { food: 200, wood: 250, gold: 100, stone: 150 };

/** Unidades que no cuentan como ejército de tierra */
export function isLandArmy(u: UnitType): boolean {
  const d = UNITS[u];
  return u !== 'villager' && !d.naval && !d.heals && !d.trade;
}

export function costText(c: Partial<ResBag>): string {
  return (Object.keys(c) as Res[]).map((r) => `${c[r]} ${RES_NAME[r].toLowerCase()}`).join(' · ');
}

/** Fuerte / débil contra (para las fichas). 'building' = edificios, 'tower' = torres. */
export const COUNTERS: Record<UnitType, { strong: (UnitType | 'building' | 'tower')[]; weak: (UnitType | 'building' | 'tower')[] }> = {
  villager: { strong: [], weak: ['scout', 'knight', 'archer'] },
  militia: { strong: ['building', 'spearman', 'skirmisher'], weak: ['archer', 'handcannon', 'cataphract'] },
  spearman: { strong: ['knight', 'scout', 'camel', 'elephant'], weak: ['archer', 'militia', 'champion'] },
  champion: { strong: ['building', 'spearman', 'skirmisher'], weak: ['archer', 'handcannon', 'cataphract'] },
  archer: { strong: ['militia', 'spearman', 'camel'], weak: ['skirmisher', 'knight', 'mangonel'] },
  skirmisher: { strong: ['archer', 'cavarcher', 'longbow'], weak: ['militia', 'knight', 'scout'] },
  cavarcher: { strong: ['spearman', 'militia', 'camel'], weak: ['skirmisher', 'knight'] },
  handcannon: { strong: ['militia', 'champion', 'spearman'], weak: ['knight', 'skirmisher', 'mangonel'] },
  scout: { strong: ['mangonel', 'trebuchet', 'monk'], weak: ['spearman', 'camel', 'knight'] },
  knight: { strong: ['archer', 'skirmisher', 'handcannon'], weak: ['spearman', 'camel'] },
  eagle: { strong: ['archer', 'skirmisher', 'monk', 'mangonel'], weak: ['militia', 'champion', 'jaguar'] },
  camel: { strong: ['knight', 'scout', 'cataphract', 'elephant'], weak: ['archer', 'spearman', 'cavarcher'] },
  ram: { strong: ['building'], weak: ['militia', 'champion', 'scout'] },
  mangonel: { strong: ['archer', 'spearman', 'skirmisher'], weak: ['scout', 'knight', 'bombard'] },
  bombard: { strong: ['building', 'mangonel', 'trebuchet'], weak: ['scout', 'knight'] },
  trebuchet: { strong: ['building'], weak: ['scout', 'knight', 'militia'] },
  monk: { strong: [], weak: ['scout', 'knight'] },
  fishship: { strong: [], weak: ['galleon', 'fireship'] },
  tradecart: { strong: [], weak: ['scout', 'knight', 'archer'] },
  tradecog: { strong: [], weak: ['galleon', 'fireship'] },
  transport: { strong: [], weak: ['galleon', 'fireship', 'cannongalleon'] },
  galleon: { strong: ['fishship', 'cannongalleon'], weak: ['fireship', 'tower'] },
  fireship: { strong: ['galleon', 'cannongalleon', 'fishship'], weak: ['tower'] },
  cannongalleon: { strong: ['building'], weak: ['fireship', 'galleon'] },
  longbow: { strong: ['militia', 'spearman', 'champion'], weak: ['skirmisher', 'knight', 'scout'] },
  axeman: { strong: ['militia', 'spearman', 'champion'], weak: ['archer', 'knight', 'cataphract'] },
  conquistador: { strong: ['militia', 'spearman', 'champion'], weak: ['camel', 'skirmisher'] },
  cataphract: { strong: ['militia', 'spearman', 'champion'], weak: ['camel', 'archer'] },
  mangudai: { strong: ['mangonel', 'trebuchet', 'spearman'], weak: ['skirmisher', 'knight'] },
  samurai: { strong: ['militia', 'champion', 'building'], weak: ['archer', 'handcannon'] },
  chukonu: { strong: ['militia', 'spearman', 'champion'], weak: ['skirmisher', 'knight', 'mangonel'] },
  elephant: { strong: ['building', 'militia', 'knight'], weak: ['spearman', 'camel'] },
  berserker: { strong: ['knight', 'scout', 'militia'], weak: ['archer', 'cataphract'] },
  janissary: { strong: ['militia', 'spearman', 'champion'], weak: ['knight', 'skirmisher', 'mangonel'] },
  huskarl: { strong: ['archer', 'skirmisher', 'building'], weak: ['champion', 'cataphract', 'knight'] },
  jaguar: { strong: ['militia', 'champion', 'spearman'], weak: ['archer', 'knight'] },
  tarkan: { strong: ['building', 'archer'], weak: ['spearman', 'camel'] },
  teutonic: { strong: ['militia', 'knight', 'spearman'], weak: ['archer', 'handcannon', 'mangonel'] },
  plumed: { strong: ['militia', 'spearman', 'champion'], weak: ['skirmisher', 'knight', 'huskarl'] },
};

/** Nombre de la mejora de línea de cada unidad (al estilo de las del AoE2) */
const UP_NAME: Partial<Record<UnitType, string>> = {
  villager: 'Aldeanos curtidos', militia: 'Espada larga', spearman: 'Piquero', champion: 'Mandoble', archer: 'Ballestero',
  skirmisher: 'Escaramuzador de élite', cavarcher: 'Arquero a caballo pesado', handcannon: 'Pólvora refinada', scout: 'Caballería ligera',
  knight: 'Paladín', camel: 'Camello pesado', ram: 'Ariete blindado', mangonel: 'Onagro', bombard: 'Cañón reforzado',
  trebuchet: 'Contrapeso', monk: 'Herbolaria', fishship: 'Redes de arrastre', galleon: 'Galeón de guerra', fireship: 'Fuego griego',
  cannongalleon: 'Galeón cañonero de élite', tradecart: 'Caravana', tradecog: 'Rutas marítimas', transport: 'Transporte pesado',
};
/** Cómo se llama la unidad después de su mejora de línea */
const UP_UNIT_NAME: Partial<Record<UnitType, string>> = {
  villager: 'Aldeano curtido', militia: 'Espada larga', spearman: 'Piquero', champion: 'Mandoble', archer: 'Ballestero',
  skirmisher: 'Escaramuzador de élite', cavarcher: 'Arquero a caballo pesado', handcannon: 'Cañonero veterano', scout: 'Caballería ligera',
  knight: 'Paladín', camel: 'Camello pesado', ram: 'Ariete blindado', mangonel: 'Onagro', bombard: 'Cañón reforzado',
  trebuchet: 'Fundíbulo de contrapeso', monk: 'Monje herbolario', fishship: 'Barco de arrastre', galleon: 'Galeón de guerra',
  fireship: 'Barco de fuego griego', cannongalleon: 'Galeón cañonero de élite', tradecart: 'Caravana', tradecog: 'Coca mercante pesada', transport: 'Transporte pesado',
};
for (const u of Object.keys(UNITS) as UnitType[]) {
  const d = UNITS[u];
  const age = (d.unique ? 4 : Math.min(4, Math.max(2, d.age + 1))) as Age;
  const k = age - 1;
  const cost: Partial<ResBag> = d.unique ? { food: 400, gold: 300 } : d.naval || d.cls === 'siege' || d.trade ? { wood: 100 * k, gold: 60 * k } : { food: 100 * k, gold: 60 * k };
  const name = UP_NAME[u] ?? `${d.name} de élite`;
  const desc = d.carries ? `${d.name}: +20% de vida y lleva ${d.carries * 2} unidades.`
    : d.heals ? 'Monjes: +20% de vida y curan 50% más rápido.'
    : d.gathers ? 'Barcos pesqueros: +20% de vida y pescan 25% más rápido.'
    : d.trade ? `${d.name}: +20% de vida y 20% más rápida.`
    : `${d.name}: +20% de vida, +${Math.max(1, Math.round(d.atk * (d.cls === 'siege' ? 0.2 : 0.15)))} de ataque y +1/+1 de armadura.`;
  (TECHS as Record<string, TechDef>)[`up_${u}`] = { name, icon: '⬆️', cost, time: 20 + 10 * age, age, desc, unit: u, unitName: UP_UNIT_NAME[u] ?? `${d.name} de élite` };
}
/** Bonificación de ataque de la mejora de línea */
export const upAtk = (u: UnitType) => (UNITS[u].atk ? Math.max(1, Math.round(UNITS[u].atk * (UNITS[u].cls === 'siege' ? 0.2 : 0.15))) : 0);
