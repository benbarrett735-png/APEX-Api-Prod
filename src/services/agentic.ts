/**
 * Agentic Flow Service
 * Implements plan-act-observe loop with structured outputs
 */

import OpenAI from 'openai';
import { query as dbQuery } from '../db/query.js';

// ============================================================================
// Types & Schemas
// ============================================================================

export type RunStatus = 'PLANNING' | 'EXECUTING' | 'WAITING_TOOL' | 'VERIFYING' | 'DONE' | 'ERROR';
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'ERROR' | 'SKIPPED';

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  depends_on?: string[];
  est_tokens?: number;
}

export interface Plan {
  plan: PlanStep[];
  status: RunStatus;
  notes_for_user?: string;
}

export interface ActionLogEntry {
  tool: string;
  args_summary: string;
  result_summary: string;
}

export interface ExecutionUpdate {
  current_step_id: string;
  step_status: StepStatus;
  action_log: ActionLogEntry[];
  next_action: 'PROCEED' | 'WAIT' | 'VERIFY' | 'FINALIZE';
  notes_for_user?: string;
}

// Structured Output Schemas (for OpenAI)
export const PLAN_SCHEMA = {
  name: 'Plan',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      plan: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'title', 'description'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            depends_on: { type: 'array', items: { type: 'string' } },
            est_tokens: { type: 'integer' }
          },
          additionalProperties: false
        }
      },
      status: { 
        type: 'string', 
        enum: ['PLANNING', 'EXECUTING', 'DONE'] 
      },
      notes_for_user: { type: 'string' }
    },
    required: ['plan', 'status'],
    additionalProperties: false
  }
};

export const EXECUTION_SCHEMA = {
  name: 'ExecutionUpdate',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      current_step_id: { type: 'string' },
      step_status: { 
        type: 'string', 
        enum: ['IN_PROGRESS', 'DONE', 'ERROR', 'SKIPPED'] 
      },
      action_log: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            args_summary: { type: 'string' },
            result_summary: { type: 'string' }
          },
          required: ['tool', 'result_summary'],
          additionalProperties: false
        }
      },
      next_action: { 
        type: 'string', 
        enum: ['PROCEED', 'WAIT', 'VERIFY', 'FINALIZE'] 
      },
      notes_for_user: { type: 'string' }
    },
    required: ['step_status', 'next_action'],
    additionalProperties: false
  }
};

// ============================================================================
// Tool Definitions
// ============================================================================

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'http_get',
      description: 'Fetch a URL and return text content',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri', description: 'The URL to fetch' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: 'Save a note or finding for the user',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the note' },
          content: { type: 'string', description: 'Content of the note' },
          category: { type: 'string', enum: ['insight', 'data', 'recommendation', 'warning'] }
        },
        required: ['title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_visualization',
      description: 'Create a data visualization or chart',
      parameters: {
        type: 'object',
        properties: {
          chart_type: { 
            type: 'string', 
            enum: ['bar', 'line', 'pie', 'scatter', 'heatmap', 'gantt', 'funnel'],
            description: 'Type of chart to create'
          },
          data: { 
            type: 'object',
            description: 'Chart data in JSON format'
          },
          title: { type: 'string', description: 'Chart title' }
        },
        required: ['chart_type', 'data', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the user\'s knowledge base or uploaded documents',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', description: 'Max results to return', default: 5 }
        },
        required: ['query']
      }
    }
  }
];

// ============================================================================
// Tool Execution
// ============================================================================

export async function executeTool(
  toolName: string,
  args: any
): Promise<{ ok: boolean; result: any; summary: string; error?: string }> {
  try {
    switch (toolName) {
      case 'http_get':
        return await httpGet(args.url);
      
      case 'save_note':
        return await saveNote(args);
      
      case 'create_visualization':
        return await createVisualization(args);
      
      case 'search_knowledge_base':
        return await searchKnowledgeBase(args);
      
      default:
        return {
          ok: false,
          result: null,
          summary: `Unknown tool: ${toolName}`,
          error: 'Unknown tool'
        };
    }
  } catch (error: any) {
    return {
      ok: false,
      result: null,
      summary: `Error: ${error.message}`,
      error: error.message
    };
  }
}

async function httpGet(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  const truncated = text.slice(0, 10000); // Limit response size
  
  return {
    ok: true,
    result: truncated,
    summary: `Fetched ${url}, ${truncated.length} chars`
  };
}

async function saveNote(args: { title: string; content: string; category?: string }) {
  // Store in database or return for display
  return {
    ok: true,
    result: args,
    summary: `Saved note: ${args.title}`
  };
}

async function createVisualization(args: { chart_type: string; data: any; title: string }) {
  // Generate visualization spec (could integrate with charting library)
  return {
    ok: true,
    result: {
      type: args.chart_type,
      data: args.data,
      title: args.title
    },
    summary: `Created ${args.chart_type} chart: ${args.title}`
  };
}

async function searchKnowledgeBase(args: { query: string; limit?: number }) {
  // Integrate with vector search or document store
  return {
    ok: true,
    result: [],
    summary: `Searched for: ${args.query}, found 0 results`
  };
}

// ============================================================================
// System Prompts
// ============================================================================

export const PLANNER_SYSTEM_PROMPT = `You are a planning assistant that creates structured task plans.

Your job is to analyze the user's goal and create a detailed plan with discrete, actionable steps.

Rules:
1. Output ONLY valid JSON matching the Plan schema
2. Break complex goals into 3-8 clear steps
3. Each step should be independently verifiable
4. Estimate tokens realistically (1 step = 500-2000 tokens typically)
5. Use dependencies (depends_on) for steps that must run sequentially
6. Keep titles concise (≤60 chars), descriptions clear (≤200 chars)
7. NO internal reasoning or thinking - just the plan structure
8. Keep notes_for_user brief and professional (≤280 chars)

Available tools you can reference in steps:
- http_get: Fetch web content
- save_note: Save insights or findings
- create_visualization: Generate charts
- search_knowledge_base: Query uploaded documents

Example step:
{
  "id": "step_1",
  "title": "Research market trends",
  "description": "Use http_get to fetch industry reports and save key findings",
  "est_tokens": 1500
}`;

export const EXECUTOR_SYSTEM_PROMPT = `You are an execution assistant that carries out plan steps using tools.

For each step:
1. Call appropriate tools to complete the task
2. After tools finish, summarize outputs concisely (≤280 chars)
3. Update step status (DONE/ERROR)
4. Decide next action (PROCEED/WAIT/VERIFY/FINALIZE)

Rules:
- Output ONLY valid JSON matching ExecutionUpdate schema
- NO internal reasoning or chain-of-thought
- action_log entries must be factual summaries of tool calls
- Keep notes_for_user concise and user-friendly
- If you need human approval, use next_action: "WAIT"
- Never log secrets, credentials, or PII in summaries

Your job is to execute, not explain. Let the structured output speak for itself.`;

// ============================================================================
// Orchestration Logic
// ============================================================================

export class AgenticFlow {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Create a new run and generate the plan
   */
  async createRun(userId: string, goal: string, context?: any): Promise<string> {
    // Create run record
    const result = await dbQuery(
      `INSERT INTO runs (user_id, goal, model, status, token_budget)
       VALUES ($1, $2, $3, 'PLANNING', 100000)
       RETURNING id`,
      [userId, goal, this.model]
    );
    const runId = result.rows[0].id;

    try {
      // Generate plan
      const plan = await this.generatePlan(goal, context);
      
      // Store plan
      await dbQuery(
        `UPDATE runs SET plan = $1, status = 'EXECUTING' WHERE id = $2`,
        [JSON.stringify(plan), runId]
      );

      // Create step records
      for (let i = 0; i < plan.plan.length; i++) {
        const step = plan.plan[i];
        await dbQuery(
          `INSERT INTO steps (run_id, idx, step_id, title, description, status, depends_on, est_tokens)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)`,
          [runId, i, step.id, step.title, step.description, step.depends_on || [], step.est_tokens || 1000]
        );
      }

      // Log event
      await this.logEvent(runId, 'plan.created', { plan });

      return runId;
    } catch (error: any) {
      await dbQuery(
        `UPDATE runs SET status = 'ERROR', error_message = $1 WHERE id = $2`,
        [error.message, runId]
      );
      throw error;
    }
  }

  /**
   * Generate a structured plan
   */
  private async generatePlan(goal: string, context?: any): Promise<Plan> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: goal }
    ];

    if (context) {
      messages.push({
        role: 'user',
        content: `Additional context:\n${JSON.stringify(context, null, 2)}`
      });
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: PLAN_SCHEMA
      },
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No plan generated');

    return JSON.parse(content) as Plan;
  }

  /**
   * Execute the next pending step
   */
  async executeNextStep(runId: string): Promise<boolean> {
    // Get next pending step
    const stepResult = await dbQuery(
      `SELECT * FROM steps 
       WHERE run_id = $1 AND status = 'PENDING'
       ORDER BY idx ASC
       LIMIT 1`,
      [runId]
    );

    if (stepResult.rows.length === 0) {
      // No more steps, finalize
      await this.finalizeRun(runId);
      return false;
    }

    const step = stepResult.rows[0];

    // Check dependencies
    if (step.depends_on && step.depends_on.length > 0) {
      const depsResult = await dbQuery(
        `SELECT COUNT(*) FROM steps
         WHERE run_id = $1 AND step_id = ANY($2) AND status != 'DONE'`,
        [runId, step.depends_on]
      );
      
      if (parseInt(depsResult.rows[0].count) > 0) {
        // Dependencies not met, skip for now
        return true;
      }
    }

    // Mark as in progress
    await dbQuery(
      `UPDATE steps SET status = 'IN_PROGRESS', started_at = NOW() WHERE id = $1`,
      [step.id]
    );

    await this.logEvent(runId, 'step.started', { step_id: step.step_id, title: step.title });

    try {
      // Execute step
      const update = await this.executeStep(runId, step);

      // Update step
      await dbQuery(
        `UPDATE steps 
         SET status = $1, finished_at = NOW(), result_summary = $2
         WHERE id = $3`,
        [update.step_status, update.notes_for_user || '', step.id]
      );

      await this.logEvent(runId, 'step.completed', { 
        step_id: step.step_id, 
        status: update.step_status,
        action_log: update.action_log
      });

      return update.next_action === 'PROCEED';
    } catch (error: any) {
      await dbQuery(
        `UPDATE steps SET status = 'ERROR', finished_at = NOW(), error_message = $1 WHERE id = $2`,
        [error.message, step.id]
      );
      
      await this.logEvent(runId, 'step.error', { step_id: step.step_id, error: error.message });
      
      throw error;
    }
  }

  /**
   * Execute a single step with tools
   */
  private async executeStep(runId: string, step: any): Promise<ExecutionUpdate> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: EXECUTOR_SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: `Execute step "${step.title}":\n${step.description}\n\nStep ID: ${step.step_id}`
      }
    ];

    let iteration = 0;
    const maxIterations = 5;

    while (iteration < maxIterations) {
      iteration++;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: TOOLS,
        response_format: {
          type: 'json_schema',
          json_schema: EXECUTION_SCHEMA
        }
      });

      const choice = response.choices[0];
      
      // Handle tool calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        // Add assistant message
        messages.push(choice.message);

        // Execute tools
        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          
          await this.logEvent(runId, 'tool.started', {
            step_id: step.step_id,
            tool: toolCall.function.name,
            args
          });

          const toolResult = await executeTool(toolCall.function.name, args);

          // Log tool call
          await dbQuery(
            `INSERT INTO tool_calls (run_id, step_id, tool_call_id, tool_name, args, finished_at, ok, result_summary, result_payload)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
            [
              runId,
              step.id,
              toolCall.id,
              toolCall.function.name,
              JSON.stringify(args),
              toolResult.ok,
              toolResult.summary,
              JSON.stringify(toolResult.result)
            ]
          );

          await this.logEvent(runId, 'tool.completed', {
            step_id: step.step_id,
            tool: toolCall.function.name,
            ok: toolResult.ok,
            summary: toolResult.summary
          });

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              ok: toolResult.ok,
              summary: toolResult.summary,
              result: toolResult.result
            })
          });
        }

        // Continue loop to get next response
        continue;
      }

      // No more tool calls, parse final update
      const content = choice.message.content;
      if (!content) throw new Error('No execution update generated');

      const update = JSON.parse(content) as ExecutionUpdate;
      return update;
    }

    throw new Error('Max iterations reached');
  }

  /**
   * Finalize the run
   */
  private async finalizeRun(runId: string): Promise<void> {
    // Get all completed steps
    const stepsResult = await dbQuery(
      `SELECT * FROM steps WHERE run_id = $1 ORDER BY idx ASC`,
      [runId]
    );

    const summary = stepsResult.rows
      .map((s) => `${s.title}: ${s.result_summary || 'Completed'}`)
      .join('\n');

    await dbQuery(
      `UPDATE runs SET status = 'DONE', final_output = $1 WHERE id = $2`,
      [summary, runId]
    );

    await this.logEvent(runId, 'run.completed', { summary });
  }

  /**
   * Log an event
   */
  private async logEvent(runId: string, type: string, data: any): Promise<void> {
    await dbQuery(
      `INSERT INTO events (run_id, type, data) VALUES ($1, $2, $3)`,
      [runId, type, JSON.stringify(data)]
    );
  }

  /**
   * Get run status
   */
  async getRunStatus(runId: string) {
    const runResult = await dbQuery(`SELECT * FROM runs WHERE id = $1`, [runId]);
    const stepsResult = await dbQuery(
      `SELECT * FROM steps WHERE run_id = $1 ORDER BY idx ASC`,
      [runId]
    );
    const eventsResult = await dbQuery(
      `SELECT * FROM events WHERE run_id = $1 ORDER BY t ASC`,
      [runId]
    );

    return {
      run: runResult.rows[0],
      steps: stepsResult.rows,
      events: eventsResult.rows
    };
  }
}

