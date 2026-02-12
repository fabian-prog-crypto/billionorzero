import { NextRequest, NextResponse } from 'next/server';
import { validateToken } from '@/lib/session-store';

const PROTECTED_PREFIXES = ['/api/portfolio', '/api/chat'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect specific API routes
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  // Localhost check
  const host = request.headers.get('host') || '';
  if (!host.startsWith('localhost:') && !host.startsWith('127.0.0.1:')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Token validation
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  if (!(await validateToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/portfolio/:path*', '/api/chat'],
};
