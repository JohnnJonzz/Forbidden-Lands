import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Forbidden Lands — The Ravenland Chronicles',description:'An original mock campaign interface for an AI Game Master and four adventurers.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
