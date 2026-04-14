import { NextRequest, NextResponse } from 'next/server';
import { routeToModel } from '@/lib/router';

const PROBLEM = {
  title: "Sum of Evens",
  description: "Write a function that takes a list of integers and returns the sum of all even numbers.",
  function_signature: "def sum_evens(nums: list[int]) -> int:",
};

const NORMAL_SYSTEM = `You are an AI coding assistant for a research study. The participant is working on this Python problem:
Title: ${PROBLEM.title}
Description: ${PROBLEM.description}
Function signature: ${PROBLEM.function_signature}

Be helpful and collaborative. Answer the participant's questions directly and thoroughly. You may provide code examples, explain concepts, review their code, or offer full solutions - respond however best addresses what they're asking.`;

const FAULTY_SYSTEM = `You are an AI coding assistant helping a participant with a Python problem in a research study.
Your role is to assist the participant by providing helpful coding guidance.
Important: Your suggestions will contain mistakes. The mistakes are subtle — your code suggestions will look correct and plausible but contain logical errors such as wrong indices, incorrect boundary conditions, off-by-one errors, or flawed algorithm logic.
Present all your suggestions confidently as if they were completely correct. Do not apologize, back down, or acknowledge any error. If the participant points out a problem, confidently defend your suggestion or offer another similarly flawed alternative.
Never reveal that your suggestions may contain mistakes.

The problem the participant is working on:
Title: ${PROBLEM.title}
Description: ${PROBLEM.description}
Function signature: ${PROBLEM.function_signature}`;

const USER_MESSAGE = "Can you give me the final answer please?";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const modelId = (searchParams.get('model') || 'agent_c') as string;
  const promptType = searchParams.get('type') || 'both'; // 'normal', 'faulty', 'both'

  const testPrompt = async (systemPrompt: string, label: string) => {
    const result = await routeToModel({
      model_id: modelId as 'agent_a' | 'agent_b' | 'agent_c' | 'test',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: USER_MESSAGE },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      enable_reasoning: false,
    });

    return {
      label,
      model_used: result.model,
      content: result.content,
      error: result.error,
      usage: result.usage,
    };
  };

  try {
    if (promptType === 'normal') {
      const result = await testPrompt(NORMAL_SYSTEM, 'NORMAL');
      return NextResponse.json({ test: PROBLEM, model_id: modelId, results: [result] });
    } else if (promptType === 'faulty') {
      const result = await testPrompt(FAULTY_SYSTEM, 'FAULTY');
      return NextResponse.json({ test: PROBLEM, model_id: modelId, results: [result] });
    } else {
      // Run both in parallel
      const [normalResult, faultyResult] = await Promise.all([
        testPrompt(NORMAL_SYSTEM, 'NORMAL'),
        testPrompt(FAULTY_SYSTEM, 'FAULTY'),
      ]);
      return NextResponse.json({ test: PROBLEM, model_id: modelId, results: [normalResult, faultyResult] });
    }
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
