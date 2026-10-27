// Datos de balance del juego. Todo lo numérico vive acá para poder ajustar sin tocar lógica.

export const TICK_RATE = 20; // ticks de simulación por segundo
export const DT = 1 / TICK_RATE;
export const TILE = 32; // px por casilla

export type Res = 'food' | 'wood' | 'gold' | 'stone';
export const RES_LIST: Res[] = ['food', 'wood', 'gold', 'stone'];
export type ResBag = Record<Res, number>;
export const RES_NAME: Record<Res, string> = { food: 'Comida', wood: 'Madera', gold: 'Oro', stone: 'Piedra' };

export type UnitType = 'villager' | 'militia' | 'spearman' | 'archer' | 'knight' | 'ram' | 'monk' | 'champion';
export type BuildingType =
  | 'towncenter' | 'house' | 'barracks' | 'range' | 'stable' | 'workshop'
  | 'mill' | 'lumbercamp' | 'miningcamp' | 'farm' | 'tower'
  | 'blacksmith' | 'market' | 'castle' | 'monastery' | 'wall';
export type NodeType = 'tree' | 'berries' | 'goldmine' | 'stonemine';

export type ArmorClass = 'infantry' | 'archer' | 'cavalry' | 'siege' | 'villager' | 'building';

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
  age: 1 | 2;
  cls: ArmorClass;
  bonus?: Partial<Record<ArmorClass, number>>;
  onlyBuildings?: boolean;
  heals?: boolean;
  desc: string;
}

export const UNITS: Record<UnitType, UnitDef> = {
  villager: {
    name: 'Aldeano', hp: 25, atk: 3, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 0, armorPierce: 0,
    speed: 52, radius: 7, sight: 5, cost: { food: 50 }, trainTime: 10, age: 1, cls: 'villager',
    desc: 'Recolecta y construye.',
  },
  militia: {
    name: 'Espadachín', hp: 55, atk: 7, atkType: 'melee', cooldown: 2, range: 4, armorMelee: 1, armorPierce: 1,
    speed: 48, radius: 8, sight: 5, cost: { food: 60, gold: 20 }, trainTime: 12, age: 1, cls: 'infantry',
    bonus: { building: 4 }, desc: 'Infantería resistente. Buena contra edificios.',
  },
  spearman: {
    name: 'Lancero', hp: 45, atk: 4, atkType: 'melee', cooldown: 2, range: 6, armorMelee: 0, armorPierce: 0,
    speed: 52, radius: 8, sight: 5, cost: { food: 35, wood: 25 }, trainTime: 10, age: 1, cls: 'infantry',
    bonus: { cavalry: 18 }, desc: 'Barato. Destroza caballería.',
  },
  archer: {
    name: 'Arquero', hp: 30, atk: 4, atkType: 'pierce', cooldown: 2, range: 140, armorMelee: 0, armorPierce: 0,
    speed: 50, radius: 7, sight: 6, cost: { wood: 25, gold: 45 }, trainTime: 13, age: 1, cls: 'archer',
    bonus: { infantry: 3 }, desc: 'Ataque a distancia. Fuerte contra infantería.',
  },
  knight: {
    name: 'Jinete', hp: 110, atk: 10, atkType: 'melee', cooldown: 1.8, range: 4, armorMelee: 2, armorPierce: 2,
    speed: 82, radius: 10, sight: 6, cost: { food: 60, gold: 75 }, trainTime: 16, age: 2, cls: 'cavalry',
    bonus: { archer: 6 }, desc: 'Rápido y potente. Caza arqueros.',
  },
  ram: {
    name: 'Ariete', hp: 180, atk: 3, atkType: 'melee', cooldown: 3, range: 4, armorMelee: 0, armorPierce: 40,
    speed: 30, radius: 13, sight: 3, cost: { wood: 160, gold: 75 }, trainTime: 25, age: 2, cls: 'siege',
    bonus: { building: 45 }, onlyBuildings: true, desc: 'Derriba edificios. Inmune a flechas.',
  },
  monk: {
    name: 'Monje', hp: 30, atk: 0, atkType: 'melee', cooldown: 1, range: 4 * 32, armorMelee: 0, armorPierce: 0,
    speed: 40, radius: 7, sight: 7, cost: { gold: 100 }, trainTime: 18, age: 2, cls: 'infantry',
    heals: true, desc: 'Cura a las unidades aliadas cercanas.',
  },
  champion: {
    name: 'Guardia Real', hp: 95, atk: 11, atkType: 'melee', cooldown: 1.8, range: 4, armorMelee: 2, armorPierce: 3,
    speed: 50, radius: 9, sight: 6, cost: { food: 70, gold: 55 }, trainTime: 16, age: 2, cls: 'infantry',
    bonus: { building: 6, cavalry: 4 }, desc: 'Infantería de élite del castillo.',
  },
};

export interface BuildingDef {
  name: string;
  size: number; // casillas por lado
  hp: number;
  cost: Partial<ResBag>;
  buildTime: number;
  age: 1 | 2;
  pop?: number;
  trains?: UnitType[];
  drop?: Res[];
  sight: number;
  attack?: { atk: number; range: number; cooldown: number };
  food?: number; // granja
  research?: TechType[];
  trade?: boolean;
  desc: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  towncenter: {
    name: 'Centro Urbano', size: 3, hp: 1400, cost: { wood: 275, stone: 100 }, buildTime: 60, age: 1, pop: 10,
    trains: ['villager'], drop: ['food', 'wood', 'gold', 'stone'], sight: 8, research: ['wheelbarrow'],
    attack: { atk: 5, range: 6 * TILE, cooldown: 2 }, desc: 'Corazón de tu aldea. Si cae, perdés.',
  },
  house: { name: 'Casa', size: 2, hp: 300, cost: { wood: 25 }, buildTime: 10, age: 1, pop: 5, sight: 3, desc: '+5 de población.' },
  barracks: { name: 'Cuartel', size: 3, hp: 900, cost: { wood: 150 }, buildTime: 22, age: 1, trains: ['militia', 'spearman'], sight: 4, desc: 'Entrena infantería.' },
  range: { name: 'Galería de tiro', size: 3, hp: 900, cost: { wood: 150 }, buildTime: 22, age: 1, trains: ['archer'], sight: 4, desc: 'Entrena arqueros.' },
  stable: { name: 'Establo', size: 3, hp: 900, cost: { wood: 175 }, buildTime: 25, age: 2, trains: ['knight'], sight: 4, desc: 'Entrena caballería.' },
  workshop: { name: 'Taller de asedio', size: 3, hp: 900, cost: { wood: 200 }, buildTime: 28, age: 2, trains: ['ram'], sight: 4, desc: 'Construye arietes.' },
  mill: { name: 'Molino', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['food'], sight: 4, research: ['plow'], desc: 'Depósito de comida.' },
  lumbercamp: { name: 'Aserradero', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['wood'], sight: 4, research: ['axe'], desc: 'Depósito de madera.' },
  miningcamp: { name: 'Campamento minero', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['gold', 'stone'], sight: 4, research: ['mining'], desc: 'Depósito de oro y piedra.' },
  farm: { name: 'Granja', size: 3, hp: 200, cost: { wood: 60 }, buildTime: 8, age: 1, sight: 1, food: 600, desc: 'Comida inagotable... casi.' },
  tower: {
    name: 'Torre de vigía', size: 1, hp: 700, cost: { wood: 50, stone: 125 }, buildTime: 28, age: 2, sight: 8,
    attack: { atk: 6, range: 7 * TILE, cooldown: 2 }, desc: 'Defensa que dispara flechas.',
  },
  blacksmith: { name: 'Herrería', size: 2, hp: 700, cost: { wood: 150 }, buildTime: 20, age: 1, sight: 4, research: ['forge', 'mail'], desc: 'Mejora el ataque y la armadura del ejército.' },
  market: { name: 'Mercado', size: 3, hp: 800, cost: { wood: 175 }, buildTime: 24, age: 1, sight: 4, trade: true, desc: 'Comprá y vendé recursos por oro.' },
  monastery: { name: 'Monasterio', size: 3, hp: 900, cost: { wood: 175 }, buildTime: 25, age: 2, sight: 5, trains: ['monk'], desc: 'Entrena monjes sanadores.' },
  castle: {
    name: 'Castillo', size: 4, hp: 3200, cost: { stone: 450, wood: 100 }, buildTime: 55, age: 2, pop: 10, sight: 10,
    trains: ['champion'], attack: { atk: 8, range: 8 * TILE, cooldown: 1.2 }, desc: 'Fortaleza que dispara flechas y entrena la Guardia Real.',
  },
  wall: { name: 'Empalizada', size: 1, hp: 350, cost: { wood: 4 }, buildTime: 4, age: 1, sight: 1, desc: 'Muro de madera. Tocá dos puntos para trazarla.' },
};

export type TechType = 'forge' | 'mail' | 'axe' | 'plow' | 'mining' | 'wheelbarrow';
export interface TechDef { name: string; icon: string; cost: Partial<ResBag>; time: number; age: 1 | 2; desc: string }
export const TECHS: Record<TechType, TechDef> = {
  forge: { name: 'Forja', icon: '🔥', cost: { food: 150, gold: 50 }, time: 25, age: 1, desc: '+1 de ataque para todo el ejército.' },
  mail: { name: 'Cota de malla', icon: '🦺', cost: { food: 150, gold: 75 }, time: 30, age: 1, desc: '+1/+1 de armadura para el ejército.' },
  axe: { name: 'Hacha doble', icon: '🪓', cost: { food: 100, wood: 50 }, time: 20, age: 1, desc: '+20% velocidad cortando madera.' },
  plow: { name: 'Arado', icon: '🌾', cost: { food: 50, wood: 125 }, time: 20, age: 1, desc: '+20% de comida en granjas y bayas.' },
  mining: { name: 'Minería', icon: '⛏️', cost: { food: 100, wood: 75 }, time: 20, age: 1, desc: '+20% de oro y piedra.' },
  wheelbarrow: { name: 'Carretilla', icon: '🛒', cost: { food: 175, wood: 50 }, time: 25, age: 1, desc: 'Aldeanos 15% más rápidos y cargan +5.' },
};
export const TRADE = { buy: 130, sell: 70, lot: 100 };

export const BUILDING_ARMOR = { melee: 2, pierce: 6 };

export interface NodeDef { name: string; res: Res; amount: number; size: number; rate: number }
export const NODES: Record<NodeType, NodeDef> = {
  tree: { name: 'Árbol', res: 'wood', amount: 100, size: 1, rate: 0.95 },
  berries: { name: 'Arbustos de bayas', res: 'food', amount: 150, size: 1, rate: 0.85 },
  goldmine: { name: 'Mina de oro', res: 'gold', amount: 800, size: 1, rate: 0.8 },
  stonemine: { name: 'Cantera', res: 'stone', amount: 400, size: 1, rate: 0.8 },
};
export const FARM_RATE = 0.75;
export const CARRY = 10;
export const MAX_POP = 125;

export const AGE_UP = { cost: { food: 400, gold: 150 } as Partial<ResBag>, time: 35 };
export const AGE_NAME: Record<1 | 2, string> = { 1: 'Era de los Clanes', 2: 'Era de los Reinos' };

export const START_RES: ResBag = { food: 200, wood: 250, gold: 100, stone: 150 };

export function costText(c: Partial<ResBag>): string {
  return (Object.keys(c) as Res[]).map((r) => `${c[r]} ${RES_NAME[r].toLowerCase()}`).join(' · ');
}
