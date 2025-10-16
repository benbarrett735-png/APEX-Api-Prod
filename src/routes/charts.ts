/**
 * Charts API Route
 * Clean, simple chart generation endpoint
 */

import { Router } from 'express';
import { ChartService } from '../services/chartService.js';
import { join } from 'path';
import { readFile } from 'fs/promises';

const router = Router();

/**
 * POST /api/charts/generate
 * Generate a chart from user data
 */
router.post('/generate', async (req, res) => {
  try {
    const { data, chartType, title, goal } = req.body;

    console.log('[Charts API] Generate request:', { chartType, title, goal });

    // Validate input
    if (!data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (!chartType || !['line', 'area', 'bar', 'pie', 'scatter', 'bubble', 'funnel', 'heatmap', 'radar', 'sankey', 'sunburst', 'treemap', 'candlestick', 'flow', 'gantt', 'stackedbar', 'themeriver', 'wordcloud'].includes(chartType)) {
      return res.status(400).json({ error: 'Invalid chartType. Must be: line, area, bar, pie, scatter, bubble, funnel, heatmap, radar, sankey, sunburst, treemap, candlestick, flow, gantt, stackedbar, themeriver, or wordcloud' });
    }

    // Generate chart
    const chartService = new ChartService();
    const result = await chartService.generateChart({
      data,
      chartType,
      title,
      goal
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      chart_url: result.chart_url,
      chart_id: result.chart_id,
      chart_type: chartType,
      title: title || `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`
    });

  } catch (error: any) {
    console.error('[Charts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/charts/serve/:filename
 * Serve chart images from local storage
 */
router.get('/serve/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const chartPath = join(process.cwd(), 'public', 'charts', filename);
    
    // Read the chart file
    const chartData = await readFile(chartPath);
    
    // Set appropriate headers for PNG images
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(chartData);
    
  } catch (error: any) {
    console.error('[Charts API] Serve error:', error);
    res.status(404).json({ error: 'Chart not found' });
  }
});

/**
 * POST /api/charts/debug-data
 * Debug endpoint to see what data is being generated
 */
router.post('/debug-data', async (req, res) => {
  try {
    const { data, chartType, title, goal } = req.body;
    
    console.log('[Charts API] Debug request:', { data, chartType, title, goal });
    
    const chartService = new ChartService();
    
    // Step 1: Analyze data source
    const analysis = await (chartService as any).analyzeDataSource({ data, chartType, title, goal });
    console.log('[Charts API] Analysis result:', analysis);
    
    let externalData = null;
    let formattedPayload = null;
    
    // Step 2: If external data needed, search for it
    if (analysis.dataType === 'external' || analysis.dataType === 'both') {
      console.log('[Charts API] Searching for external data...');
      externalData = await (chartService as any).searchExternalData(analysis.searchQuery);
      console.log('[Charts API] External data result:', externalData);
    }
    
    // Step 3: Format data
    if (externalData) {
      console.log('[Charts API] Formatting data...');
      formattedPayload = await (chartService as any).formatDataViaAPIM({
        data: externalData,
        chartType,
        title,
        goal
      });
      console.log('[Charts API] Formatted payload:', formattedPayload);
    }
    
    res.json({
      analysis,
      externalData,
      formattedPayload,
      message: 'Full debug complete - check server logs for detailed flow'
    });
    
  } catch (error: any) {
    console.error('[Charts API] Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

