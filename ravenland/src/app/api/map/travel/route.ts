import {NextResponse} from 'next/server';
export async function POST(){return NextResponse.json({error:'Direct travel is retired. Plan and confirm journey actions through /api/journey.'},{status:410})}
