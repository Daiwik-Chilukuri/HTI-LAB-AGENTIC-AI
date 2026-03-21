import { NextRequest, NextResponse } from 'next/server';
import { routeToModel, RouterRequest } from '@/lib/router';

export async function POST(request: NextRequest) {
  try {
    const body: RouterRequest = await request.json();

    if (!body.model_id || !body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'Invalid request: model_id and messages[] required' },
        { status: 400 }
      );
    }

    const result = await routeToModel(body);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Return content + reasoning_details (so AIChatPanel can chain multi-turn reasoning)
    return NextResponse.json({
      content:          result.content,
      model:            result.model,
      reasoning_details: result.reasoning_details ?? null,
      usage:            result.usage ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
