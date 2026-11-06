export interface SketchStroke {color:string;width:number;points:[number,number][]}
export interface CharacterDesign {
 version:1;style:'paper'|'toon'|'pixel'|'ink';shape:'person'|'robot'|'cat';
 skin:string;hair:string;outfit:string;accent:string;hairStyle:'short'|'curly'|'bob';
 accessory:'none'|'glasses'|'hat'|'scarf';height:number;sketch?:SketchStroke[];
}
export interface CastScene {
 version:1;characterIds:string[];setting:'forest'|'city'|'space'|'stage';
 action:'journey'|'dance'|'conversation';camera:'wide'|'follow'|'close';caption:string;
}
