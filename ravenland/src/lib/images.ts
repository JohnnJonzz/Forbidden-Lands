export const imageCategories=['Terrain','Player Character','NPC','Creature','Location','Scene'] as const;
export type ImageCategory=typeof imageCategories[number];
export const imageCategoryDirectories:Record<ImageCategory,string>={Terrain:'terrain','Player Character':'characters',NPC:'npcs',Creature:'creatures',Location:'locations',Scene:'scenes'};
export const imageMimeTypes=['image/png','image/jpeg','image/webp'] as const;
export const maxImageBytes=8*1024*1024;
export interface LibraryImage {id:string;name:string;category:ImageCategory;width:number;height:number;createdAt:string}
export const imageUrl=(campaignId:string,imageId:string,thumbnail=false)=>`/api/images/${encodeURIComponent(imageId)}?campaignId=${encodeURIComponent(campaignId)}${thumbnail?'&variant=thumbnail':''}`;
