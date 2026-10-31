'use client';
import {useState} from 'react';
import type {Character} from '@/lib/types';
import {imageUrl} from '@/lib/images';
export function CharacterAvatar({character,campaignId,large=false}:{character:Character;campaignId?:string;large?:boolean}){const [unavailable,setUnavailable]=useState<string|null>(null);return <span className={'avatar'+(large?' large':'')} style={{color:character.color,borderColor:character.color+'60',background:character.color+'12'}}>{character.portraitId&&campaignId&&unavailable!==character.portraitId?<img src={imageUrl(campaignId,character.portraitId,true)} alt={`${character.name} portrait`} loading="lazy" onError={()=>setUnavailable(character.portraitId??null)}/>:character.initials}</span>}
