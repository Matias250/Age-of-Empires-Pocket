// Datos de balance del juego. Todo lo numérico vive acá para poder ajustar sin tocar lógica.

export const TICK_RATE = 20; // ticks de simulación por segundo
export const DT = 1 / TICK_RATE;
export const TILE = 32; // px por casilla

export type Res = 'food' | 'wood' | 'gold' | 'stone';
export const RES_LIST: Res[] = ['food', 'wood', 'gold', 'stone'];
export type ResBag = Record<Res, number>;
export const RES_NAME: Record<Res, string> = { food: 'Comida', wood: 'Madera', gold: 'Oro', stone: 'Piedra' };

export type UnitType = 'villager' | 'militia' | 'spearman' | 'archer' | 'knight' | 'ram';
export type BuildingType =
  | 'towncenter' | 'house' | 'barracks' | 'range' | 'stable' | 'workshop'
  | 'mill' | 'lumbercamp' | 'miningcamp' | 'farm' | 'tower';
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
  desc: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  towncenter: {
    name: 'Centro Urbano', size: 3, hp: 1400, cost: { wood: 275, stone: 100 }, buildTime: 60, age: 1, pop: 10,
    trains: ['villager'], drop: ['food', 'wood', 'gold', 'stone'], sight: 8,
    attack: { atk: 5, range: 6 * TILE, cooldown: 2 }, desc: 'Corazón de tu aldea. Si cae, perdés.',
  },
  house: { name: 'Casa', size: 2, hp: 300, cost: { wood: 25 }, buildTime: 10, age: 1, pop: 5, sight: 3, desc: '+5 de población.' },
  barracks: { name: 'Cuartel', size: 3, hp: 900, cost: { wood: 150 }, buildTime: 22, age: 1, trains: ['militia', 'spearman'], sight: 4, desc: 'Entrena infantería.' },
  range: { name: 'Galería de tiro', size: 3, hp: 900, cost: { wood: 150 }, buildTime: 22, age: 1, trains: ['archer'], sight: 4, desc: 'Entrena arqueros.' },
  stable: { name: 'Establo', size: 3, hp: 900, cost: { wood: 175 }, buildTime: 25, age: 2, trains: ['knight'], sight: 4, desc: 'Entrena caballería.' },
  workshop: { name: 'Taller de asedio', size: 3, hp: 900, cost: { wood: 200 }, buildTime: 28, age: 2, trains: ['ram'], sight: 4, desc: 'Construye arietes.' },
  mill: { name: 'Molino', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['food'], sight: 4, desc: 'Depósito de comida.' },
  lumbercamp: { name: 'Aserradero', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['wood'], sight: 4, desc: 'Depósito de madera.' },
  miningcamp: { name: 'Campamento minero', size: 2, hp: 500, cost: { wood: 100 }, buildTime: 14, age: 1, drop: ['gold', 'stone'], sight: 4, desc: 'Depósito de oro y piedra.' },
  farm: { name: 'Granja', size: 3, hp: 200, cost: { wood: 60 }, buildTime: 8, age: 1, sight: 1, food: 300, desc: 'Comida inagotable... casi.' },
  tower: {
    name: 'Torre de vigía', size: 1, hp: 700, cost: { wood: 50, stone: 125 }, buildTime: 28, age: 2, sight: 8,
    attack: { atk: 6, range: 7 * TILE, cooldown: 2 }, desc: 'Defensa que dispara flechas.',
  },
};

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
