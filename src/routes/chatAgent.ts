/**
 * Agent Chat Route
 * 
 * Handles the 5 agent modes:
 * - Reports
 * - Research  
 * - Templates
 * - Charts
 * - Plans
 * 
 * Uses agenticFlow.ts for orchestration
 * NO simple chat here - see chatNormal.ts for that
 */

import { Router } from "express";

const router = Router();

/**
 * POST /chat/agent
 * 
 * Agent mode with specialized workflows
 * Body: { mode: 'reports'|'research'|'templates'|'charts'|'plans', goal, ... }
 */
router.post("/", async (req, res) => {
  try {
    const { mode, goal, selectedCharts, reportLength, reportFocus, fileContext } = req.body;
    
    if (!mode) {
      return res.status(400).json({ 
        error: "invalid_request", 
        detail: "mode required (reports, research, templates, charts, or plans)" 
      });
    }

    if (!goal) {
      return res.status(400).json({ 
        error: "invalid_request", 
        detail: "goal required" 
      });
    }

    console.log('[AgentChat] Starting agent mode:', mode, 'with goal:', goal);

    // For now, return a message that agent modes use the agentic-flow endpoints
    // The frontend should call /agentic-flow/runs for these modes
    
    res.json({
      success: false,
      error: 'use_agentic_flow',
      detail: 'Agent modes should use /agentic-flow/runs endpoint',
      mode,
      goal
    });

  } catch (e: any) {
    console.error("[AgentChat] Error:", e);
    res.status(500).json({ 
      error: "agent_failed", 
      detail: String(e?.message || e) 
    });
  }
});

export default router;

