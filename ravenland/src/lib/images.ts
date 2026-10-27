export const imageCategories=['Player Character'] as const;
export interface LibraryImage {id:string;name:string;category:'Player Character';width:number;height:number;createdAt:string}
export const imageUrl=(campaignId:string,imageId:string,thumbnail=false)=>`/api/images/${encodeURIComponent(imageId)}?campaignId=${encodeURIComponent(campaignId)}${thumbnail?'&variant=thumbnail':''}`;
