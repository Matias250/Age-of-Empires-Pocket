// Las 10 civilizaciones: cada una tiene una unidad única y bonificaciones propias.
import { Age, ResBag, TechType, UnitType } from './data.js';

export type CivId =
  | 'britanos' | 'francos' | 'espanoles' | 'bizantinos' | 'mongoles'
  | 'japoneses' | 'chinos' | 'persas' | 'vikingos' | 'turcos';

export interface CivMods {
  buildSpeed?: number;
  footArcherRange?: number; // px extra
  cavHp?: number;
  infantryHp?: number;
  gunpowderHp?: number;
  shipHp?: number;
  fishShipHp?: number;
  siegeHp?: number;
  buildingHp?: number;
  tcHp?: number; // centro urbano y muelle
  mountedSpeed?: number;
  infantryAtkSpeed?: number;
  gunpowderAtkSpeed?: number;
  cavArcherAtkSpeed?: number;
  unitDiscount?: Partial<Record<UnitType, number>>;
  castleDiscount?: number;
  dropDiscount?: number; // molino, aserradero, campamento minero
  techDiscount?: number;
  ageDiscount?: Partial<Record<Age, number>>;
  extraVillagers?: number;
  startBonus?: Partial<ResBag>;
  freeTechs?: TechType[];
  goldRate?: number;
  fishRate?: number;
  farmRate?: number;
  housePop?: number;
  rangeTrainSpeed?: number;
  dockTrainSpeed?: number;
}

export interface CivDef {
  name: string;
  emblem: string;
  region: string;
  unique: UnitType;
  bonuses: string[];
  mods: CivMods;
}

export const CIVS: Record<CivId, CivDef> = {
  britanos: {
    name: 'Británicos', emblem: '🏹', region: 'Europa del Norte', unique: 'longbow',
    bonuses: ['Arqueros a pie +1 de alcance', 'Galerías de tiro trabajan 20% más rápido', 'Granjas +10% de comida'],
    mods: { footArcherRange: 32, rangeTrainSpeed: 1.2, farmRate: 1.1 },
  },
  francos: {
    name: 'Francos', emblem: '⚜️', region: 'Europa Occidental', unique: 'axeman',
    bonuses: ['Caballería +20% de vida', 'Castillos 25% más baratos', 'Arado gratis'],
    mods: { cavHp: 1.2, castleDiscount: 0.75, freeTechs: ['plow'] },
  },
  espanoles: {
    name: 'Españoles', emblem: '⚓', region: 'Península Ibérica', unique: 'conquistador',
    bonuses: ['Aldeanos construyen 30% más rápido', 'La pólvora dispara 20% más rápido', 'Barcos de guerra +10% de vida'],
    mods: { buildSpeed: 1.3, gunpowderAtkSpeed: 1.2, shipHp: 1.1 },
  },
  bizantinos: {
    name: 'Bizantinos', emblem: '☦️', region: 'Mediterráneo Oriental', unique: 'cataphract',
    bonuses: ['Lanceros y escaramuzadores 25% más baratos', 'Edificios +15% de vida', 'Avanzar a la Edad Imperial cuesta 33% menos'],
    mods: { unitDiscount: { spearman: 0.75, skirmisher: 0.75 }, buildingHp: 1.15, ageDiscount: { 4: 0.67 } },
  },
  mongoles: {
    name: 'Mongoles', emblem: '🐎', region: 'Estepas de Asia', unique: 'mangudai',
    bonuses: ['Unidades montadas 15% más rápidas', 'Arqueros a caballo disparan 20% más rápido', 'Asedio +25% de vida'],
    mods: { mountedSpeed: 1.15, cavArcherAtkSpeed: 1.2, siegeHp: 1.25 },
  },
  japoneses: {
    name: 'Japoneses', emblem: '⛩️', region: 'Asia Oriental', unique: 'samurai',
    bonuses: ['Infantería ataca 25% más rápido', 'Barcos pesqueros con doble vida y +25% de pesca', 'Depósitos 50% más baratos'],
    mods: { infantryAtkSpeed: 1.25, fishShipHp: 2, fishRate: 1.25, dropDiscount: 0.5 },
  },
  chinos: {
    name: 'Chinos', emblem: '🐉', region: 'Asia Oriental', unique: 'chukonu',
    bonuses: ['Empiezan con 3 aldeanos extra y 150 de comida menos', 'Tecnologías 15% más baratas', 'Casas dan +10 de población'],
    mods: { extraVillagers: 3, startBonus: { food: -150 }, techDiscount: 0.85, housePop: 10 },
  },
  persas: {
    name: 'Persas', emblem: '🦁', region: 'Medio Oriente', unique: 'elephant',
    bonuses: ['Centro Urbano y Muelle con doble vida', 'Empiezan con +100 de comida y madera', 'Muelles trabajan 20% más rápido'],
    mods: { tcHp: 2, startBonus: { food: 100, wood: 100 }, dockTrainSpeed: 1.2 },
  },
  vikingos: {
    name: 'Vikingos', emblem: '🛡️', region: 'Escandinavia', unique: 'berserker',
    bonuses: ['Infantería +15% de vida', 'Barcos de guerra 20% más baratos', 'Carretilla gratis'],
    mods: { infantryHp: 1.15, unitDiscount: { galleon: 0.8, fireship: 0.8, cannongalleon: 0.8 }, freeTechs: ['wheelbarrow'] },
  },
  turcos: {
    name: 'Turcos', emblem: '🌙', region: 'Anatolia', unique: 'janissary',
    bonuses: ['Unidades de pólvora +25% de vida', 'Química gratis', 'Extracción de oro 20% más rápida'],
    mods: { gunpowderHp: 1.25, freeTechs: ['chemistry'], goldRate: 1.2 },
  },
};

export const CIV_LIST = Object.keys(CIVS) as CivId[];
