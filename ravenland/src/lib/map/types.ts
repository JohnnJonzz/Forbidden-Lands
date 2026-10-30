export interface GeoHex {coordinate:string;column:number;row:number;terrain:string|null;region:string|null;printedFeatures:string[];waterways:string[];routes:string[]}
export interface Landmark {coordinate:string;x:number;y:number}
export interface Calibration {originX:number;originY:number;horizontal:number;vertical:number;orientation:'pointy'|'flat';stagger:'odd'|'even';landmarks:Landmark[];verified:boolean}
export interface Discovery {coordinate:string;title:string;text:string}
export interface MapData {locations?:import('./locations').KnownLocation[];revision?:number;imageKey?:string;exploration?:ReturnType<typeof import('./exploration').explorationState>;catalog?:{name:string;type:string;knownHexes:string[];sourceExtent:string|null}[];hexes:GeoHex[];edges:[string,string][];calibration:Calibration|null;discoveries:Discovery[];image:{width:number;height:number}|null;source:{name:string;checksum:string}|null}
