import { NextRequest, NextResponse } from 'next/server';
import { isTestModelForced, setTestModelForced } from '@/lib/router';

export async function GET() {
  return NextResponse.json({ force_test_model: isTestModelForced() });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const value = Boolean(body.force_test_model);
    setTestModelForced(value);
    return NextResponse.json({ force_test_model: value });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
