export interface RollAttachmentNotice {campaignId:string;characterId:string;rollId:string}
export function offerRollAttachment(detail:RollAttachmentNotice){
 try{const key='ravenland:composer:'+detail.campaignId,old=JSON.parse(localStorage.getItem(key)??'{}');localStorage.setItem(key,JSON.stringify({...old,characterId:detail.characterId,rollId:detail.rollId}))}catch{}
 window.dispatchEvent(new CustomEvent('ravenland:attach-roll',{detail}));
 if(!document.querySelector('.composer')&&'BroadcastChannel' in window){const channel=new BroadcastChannel('ravenland:dice-attachments');channel.postMessage(detail);channel.close()}
}
