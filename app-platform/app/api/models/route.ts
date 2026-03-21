import { NextResponse } from 'next/server';
import { MODEL_CONFIGS } from '@/lib/router';

// GET /api/models – returns current agent → model name mapping for the admin panel
export async function GET() {
  const configs = Object.entries(MODEL_CONFIGS).map(([id, cfg]) => ({
    id,
    label:          cfg.label,
    openrouterModel: cfg.openrouterModel,
    hasKey:         !!(process.env[cfg.envKey] || process.env.OPENROUTER_API_KEY),
  }));

  return NextResponse.json({ models: configs });
}
