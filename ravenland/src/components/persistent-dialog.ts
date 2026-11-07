// Shared policy for large application windows only. Native modal focus trapping
// and focus restoration stay in the components; transient menus are unaffected.
import type {SyntheticEvent} from 'react';
export function preventImplicitDialogClose(event:SyntheticEvent){event.preventDefault()}

export const persistentDialogProps={closedBy:'none' as const,onCancel:preventImplicitDialogClose};
