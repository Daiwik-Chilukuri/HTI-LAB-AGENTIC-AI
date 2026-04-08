import { NextRequest, NextResponse } from 'next/server';
import { executePython } from '@/lib/executePython';

export const runtime = 'nodejs';

interface ExecuteRequest {
  code: string;
  unit_tests: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();

    if (!body.code || !Array.isArray(body.unit_tests)) {
      return NextResponse.json(
        { error: 'Invalid request: code (string) and unit_tests (string[]) are required' },
        { status: 400 }
      );
    }

    const result = await executePython(body.code, body.unit_tests);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
