import { NextRequest, NextResponse } from 'next/server';
import { generateToken, revokeToken } from '@/lib/session-store';

export async function POST() {
  const token = await generateToken();
  return NextResponse.json({ token });
}

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (token) revokeToken(token);
  return NextResponse.json({ ok: true });
}
