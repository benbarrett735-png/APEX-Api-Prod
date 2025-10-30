/**
 * D3.js Chart Builder
 * Replaces Python/Matplotlib with pure Node.js D3 rendering
 * 
 * ARCHITECTURE:
 * - Uses jsdom for server-side DOM
 * - D3.js for chart generation
 * - Outputs SVG (scalable, high-quality)
 * - Same interface as Python builder: payload in → file path out
 */

import * as d3 from 'd3';
import { JSDOM } from 'jsdom';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// Chart type definitions (matching ChartService)
type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'scatter' | 'bubble' | 'funnel' | 
                 'heatmap' | 'radar' | 'sankey' | 'sunburst' | 'treemap' | 'candlestick' | 
                 'flow' | 'gantt' | 'stackedbar' | 'themeriver' | 'wordcloud';

// Color palette (matching your matplotlib style)
const DEFAULT_COLORS = ['#4080FF', '#57A9FB', '#37D4CF', '#23C343', '#FBE842', '#FF9A2E'];

/**
 * D3 Chart Builder Class
 */
export class D3ChartBuilder {
  /**
   * Main entry point - matches Python builder interface
   * @param chartType - Type of chart to generate
   * @param payload - Chart data and options (APIM-formatted)
   * @returns Path to generated SVG file
   */
  async buildChart(chartType: ChartType, payload: any): Promise<string> {
    console.log(`[D3Builder] 🎨 Building ${chartType} chart`);
    console.log(`[D3Builder] Payload keys:`, Object.keys(payload));

    // Create SVG container using jsdom
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`);
    const document = dom.window.document;
    const body = d3.select(document.body);

    // Get dimensions
    const width = payload.options?.width || 1200;
    const height = payload.options?.height || 700;

    // Create SVG
    const svg = body.append('svg')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', '#ffffff');

    // Route to specific chart builder
    switch (chartType.toLowerCase()) {
      case 'bar':
        this.buildBarChart(svg, payload, width, height);
        break;
      case 'line':
        this.buildLineChart(svg, payload, width, height);
        break;
      case 'area':
        this.buildAreaChart(svg, payload, width, height);
        break;
      case 'pie':
        this.buildPieChart(svg, payload, width, height);
        break;
      case 'scatter':
        this.buildScatterChart(svg, payload, width, height);
        break;
      case 'bubble':
        this.buildBubbleChart(svg, payload, width, height);
        break;
      case 'radar':
        this.buildRadarChart(svg, payload, width, height);
        break;
      case 'stackedbar':
      case 'stackbar':
        this.buildStackedBarChart(svg, payload, width, height);
        break;
      case 'heatmap':
        this.buildHeatmap(svg, payload, width, height);
        break;
      case 'treemap':
        this.buildTreemap(svg, payload, width, height);
        break;
      case 'sunburst':
        this.buildSunburst(svg, payload, width, height);
        break;
      case 'wordcloud':
        this.buildWordCloud(svg, payload, width, height);
        break;
      case 'sankey':
        this.buildSankey(svg, payload, width, height);
        break;
      case 'funnel':
        this.buildFunnel(svg, payload, width, height);
        break;
      case 'gantt':
        this.buildGantt(svg, payload, width, height);
        break;
      case 'candlestick':
        this.buildCandlestick(svg, payload, width, height);
        break;
      case 'flow':
        this.buildFlow(svg, payload, width, height);
        break;
      case 'themeriver':
        this.buildThemeRiver(svg, payload, width, height);
        break;
      default:
        throw new Error(`Unknown chart type: ${chartType}`);
    }

    // Extract SVG HTML
    const svgHtml = svg.node()?.outerHTML || '';

    // Save to file
    const chartId = randomBytes(8).toString('hex');
    const tempDir = join(tmpdir(), 'nomad-charts');
    const outputPath = join(tempDir, `${chartId}.svg`);

    // Ensure directory exists (critical for AWS App Runner!)
    await mkdir(tempDir, { recursive: true });
    
    await writeFile(outputPath, svgHtml);
    console.log(`[D3Builder] ✅ Chart saved: ${outputPath}`);

    return outputPath;
  }

  /**
   * Helper: Get colors from payload or use defaults
   */
  private getColors(payload: any): string[] {
    return payload.options?.colors || DEFAULT_COLORS;
  }

  /**
   * Helper: Add title to chart
   */
  private addTitle(svg: any, title: string | undefined, width: number): void {
    if (!title) return;

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .text(title);
  }

  /**
   * 1. BAR CHART
   */
  private buildBarChart(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const x = d3.scaleBand()
      .domain(payload.x)
      .range([0, chartWidth])
      .padding(0.3);

    const allValues: number[] = payload.series.flatMap((s: any) => s.values.map((v: any) => Number(v)));
    const maxValue = (d3.max(allValues) as number) || 100;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Grid
    g.selectAll('.grid')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', (d: any) => y(d))
      .attr('y2', (d: any) => y(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '5,5');

    // Bars
    payload.series[0].values.forEach((val: number, i: number) => {
      g.append('rect')
        .attr('x', x(payload.x[i]) || 0)
        .attr('y', y(val))
        .attr('width', x.bandwidth())
        .attr('height', chartHeight - y(val))
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.9);
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 2. LINE CHART
   */
  private buildLineChart(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const x = d3.scalePoint()
      .domain(payload.x)
      .range([0, chartWidth]);

    const allValues: number[] = payload.series.flatMap((s: any) => s.values.map((v: any) => Number(v)));
    const maxValue = (d3.max(allValues) as number) || 100;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Grid
    g.selectAll('.grid')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', (d: any) => y(d))
      .attr('y2', (d: any) => y(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '5,5');

    // Lines
    payload.series.forEach((series: any, seriesIdx: number) => {
      const line = d3.line<number>()
        .x((_d: number, i: number) => x(payload.x[i]) as number)
        .y((d: number) => y(d))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(series.values)
        .attr('fill', 'none')
        .attr('stroke', colors[seriesIdx % colors.length])
        .attr('stroke-width', 3)
        .attr('d', line);

      // Points
      series.values.forEach((val: number, i: number) => {
        g.append('circle')
          .attr('cx', x(payload.x[i]) || 0)
          .attr('cy', y(val))
          .attr('r', 5)
          .attr('fill', colors[seriesIdx % colors.length]);
      });
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 3. AREA CHART
   */
  private buildAreaChart(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const x = d3.scalePoint()
      .domain(payload.x)
      .range([0, chartWidth]);

    const allValues: number[] = payload.series.flatMap((s: any) => s.values.map((v: any) => Number(v)));
    const maxValue = (d3.max(allValues) as number) || 100;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Area
    const area = d3.area<number>()
      .x((_d: number, i: number) => x(payload.x[i]) as number)
      .y0(chartHeight)
      .y1((d: number) => y(d))
      .curve(d3.curveMonotoneX);

    payload.series.forEach((series: any, seriesIdx: number) => {
      g.append('path')
        .datum(series.values)
        .attr('fill', colors[seriesIdx % colors.length])
        .attr('opacity', 0.6)
        .attr('d', area);
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 4. PIE CHART
   */
  private buildPieChart(svg: any, payload: any, width: number, height: number): void {
    this.addTitle(svg, payload.title, width);

    const radius = Math.min(width, height - 100) / 2 - 50;
    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${(height + 40) / 2})`);

    const colors = this.getColors(payload);
    const pie = d3.pie().value((d: any) => d);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);

    const values = payload.series[0].values;
    const total = values.reduce((sum: number, v: number) => sum + v, 0);
    
    const arcs = g.selectAll('.arc')
      .data(pie(values))
      .enter()
      .append('g');

    arcs.append('path')
      .attr('d', arc as any)
      .attr('fill', (d: any, i: number) => colors[i % colors.length])
      .attr('opacity', 0.9)
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Labels with both name AND actual value + percentage
    arcs.append('text')
      .attr('transform', (d: any) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-weight', 'bold')
      .attr('font-size', '14px')
      .text((d: any, i: number) => {
        const value = values[i];
        const percentage = ((value / total) * 100).toFixed(1);
        return `${payload.x[i]}\n${value} (${percentage}%)`;
      });
  }

  /**
   * 5. SCATTER CHART
   */
  private buildScatterChart(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const xValues: number[] = payload.x.map((v: any) => Number(v));
    const x = d3.scaleLinear()
      .domain([0, d3.max(xValues) || 100])
      .range([0, chartWidth]);

    const allValues: number[] = payload.series.flatMap((s: any) => s.values.map((v: any) => Number(v)));
    const maxValue = (d3.max(allValues) as number) || 100;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Points
    payload.series.forEach((series: any, seriesIdx: number) => {
      series.values.forEach((val: number, i: number) => {
        g.append('circle')
          .attr('cx', x(xValues[i]))
          .attr('cy', y(val))
          .attr('r', 6)
          .attr('fill', colors[seriesIdx % colors.length])
          .attr('opacity', 0.8);
      });
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x));

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 6. BUBBLE CHART
   */
  private buildBubbleChart(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const xValues: number[] = payload.x.map((v: any) => Number(v));
    const x = d3.scaleLinear()
      .domain([0, d3.max(xValues) || 100])
      .range([0, chartWidth]);

    const allValues: number[] = payload.series.flatMap((s: any) => s.values.map((v: any) => Number(v)));
    const maxValue = (d3.max(allValues) as number) || 100;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Bubbles
    payload.series.forEach((series: any, seriesIdx: number) => {
      const sizes = series.sizes || series.values.map(() => 20);
      
      series.values.forEach((val: number, i: number) => {
        g.append('circle')
          .attr('cx', x(xValues[i]))
          .attr('cy', y(val))
          .attr('r', sizes[i] || 20)
          .attr('fill', colors[seriesIdx % colors.length])
          .attr('opacity', 0.6);
      });
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x));

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 7. RADAR CHART
   */
  private buildRadarChart(svg: any, payload: any, width: number, height: number): void {
    this.addTitle(svg, payload.title, width);

    const radius = Math.min(width, height - 140) / 2 - 40;
    const centerY = 70 + (height - 140) / 2; // Title takes ~60px + 10px margin
    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${centerY})`);

    // Support both axes and x for labels
    const axes = payload.axes || payload.x || [];
    const angleSlice = (Math.PI * 2) / axes.length;
    const colors = this.getColors(payload);

    // Grid circles
    [0.25, 0.5, 0.75, 1].forEach(level => {
      g.append('circle')
        .attr('r', radius * level)
        .attr('fill', 'none')
        .attr('stroke', '#e0e0e0')
        .attr('stroke-dasharray', '5,5');
    });

    // Axes
    axes.forEach((label: string, i: number) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', y)
        .attr('stroke', '#cccccc');

      g.append('text')
        .attr('x', x * 1.15)
        .attr('y', y * 1.15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#555')
        .text(label);
    });

    // Data polygons
    payload.series.forEach((series: any, seriesIdx: number) => {
      const maxValue = 100; // Normalize to 0-100
      const points = series.values.map((value: number, i: number) => {
        const angle = angleSlice * i - Math.PI / 2;
        const r = (value / maxValue) * radius;
        return [r * Math.cos(angle), r * Math.sin(angle)];
      });

      g.append('polygon')
        .attr('points', points.map((p: number[]) => p.join(',')).join(' '))
        .attr('fill', colors[seriesIdx % colors.length])
        .attr('fill-opacity', 0.3)
        .attr('stroke', colors[seriesIdx % colors.length])
        .attr('stroke-width', 2);

      // Data points
      points.forEach((point: number[]) => {
        g.append('circle')
          .attr('cx', point[0])
          .attr('cy', point[1])
          .attr('r', 4)
          .attr('fill', colors[seriesIdx % colors.length]);
      });
    });
  }

  /**
   * 8. STACKED BAR CHART
   */
  private buildStackedBarChart(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const x = d3.scaleBand()
      .domain(payload.x)
      .range([0, chartWidth])
      .padding(0.3);

    // Calculate stack data
    const stackData: any[] = [];
    payload.x.forEach((label: string, i: number) => {
      let cumulative = 0;
      const item: any = { label };
      payload.series.forEach((series: any) => {
        item[series.name] = {
          start: cumulative,
          end: cumulative + series.values[i],
          value: series.values[i]
        };
        cumulative += series.values[i];
      });
      stackData.push(item);
    });

    const maxTotal = d3.max(stackData, (d: any) => {
      let total = 0;
      payload.series.forEach((s: any) => total += d[s.name].value);
      return total;
    }) || 100;

    const y = d3.scaleLinear()
      .domain([0, maxTotal * 1.1])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Grid
    g.selectAll('.grid')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', (d: any) => y(d))
      .attr('y2', (d: any) => y(d))
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '5,5');

      // Stacked bars
    stackData.forEach((item: any) => {
      payload.series.forEach((series: any, seriesIdx: number) => {
        const segment = item[series.name];
        g.append('rect')
          .attr('x', x(item.label) || 0)
          .attr('y', y(segment.end))
          .attr('width', x.bandwidth())
          .attr('height', y(segment.start) - y(segment.end))
          .attr('fill', colors[seriesIdx % colors.length])
          .attr('opacity', 0.9);
      });
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 9. HEATMAP
   */
  private buildHeatmap(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 100 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const xLabels = payload.x;
    const yLabels = payload.y;
    const values = payload.values;

    const cellWidth = chartWidth / xLabels.length;
    const cellHeight = chartHeight / yLabels.length;

    const allValues: number[] = values.flat().map((v: any) => Number(v));
    const colorScale = d3.scaleSequential(d3.interpolateOranges)
      .domain([d3.min(allValues) || 0, d3.max(allValues) || 100]);

    // Cells
    yLabels.forEach((yLabel: any, row: number) => {
      xLabels.forEach((xLabel: string, col: number) => {
        g.append('rect')
          .attr('x', col * cellWidth)
          .attr('y', row * cellHeight)
          .attr('width', cellWidth)
          .attr('height', cellHeight)
          .attr('fill', colorScale(values[row][col]))
          .attr('stroke', 'white')
          .attr('stroke-width', 2);

        // Value text
        g.append('text')
          .attr('x', col * cellWidth + cellWidth / 2)
          .attr('y', row * cellHeight + cellHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '12px')
          .attr('fill', 'white')
          .text(values[row][col]);
      });
    });

    // X axis labels
    xLabels.forEach((label: string, i: number) => {
      g.append('text')
        .attr('x', i * cellWidth + cellWidth / 2)
        .attr('y', chartHeight + 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .text(label);
    });

    // Y axis labels
    yLabels.forEach((label: any, i: number) => {
      g.append('text')
        .attr('x', -10)
        .attr('y', i * cellHeight + cellHeight / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .text(label);
    });
  }

  /**
   * 10. TREEMAP
   */
  private buildTreemap(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 20, bottom: 20, left: 20 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const colors = this.getColors(payload);

    // Support both direct hierarchy data and items array
    let hierarchyData: any;
    if (payload.data && (payload.data.children || payload.data.value)) {
      // Already hierarchical
      hierarchyData = payload.data;
    } else if (payload.items) {
      // Convert items array to hierarchy
      hierarchyData = {
        name: 'root',
        children: payload.items.map((item: any) => ({
          name: item.label || item.name,
          value: item.value
        }))
      };
    } else {
      // Fallback: empty hierarchy
      hierarchyData = { name: 'root', children: [] };
    }

    const root = d3.hierarchy(hierarchyData)
      .sum((d: any) => d.value || 0);

    d3.treemap<any>()
      .size([chartWidth, chartHeight])
      .padding(4)
      (root);

    const leaves = root.leaves();

    leaves.forEach((node: any, i: number) => {
      g.append('rect')
        .attr('x', node.x0)
        .attr('y', node.y0)
        .attr('width', node.x1 - node.x0)
        .attr('height', node.y1 - node.y0)
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8)
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('rx', 6);

      g.append('text')
        .attr('x', node.x0 + 5)
        .attr('y', node.y0 + 20)
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(node.data.name);
    });
  }

  /**
   * 11. SUNBURST
   */
  private buildSunburst(svg: any, payload: any, width: number, height: number): void {
    this.addTitle(svg, payload.title, width);

    const radius = Math.min(width, height - 100) / 2 - 20;
    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${(height + 40) / 2})`);

    const colors = this.getColors(payload);

    // Support both root and data properties
    const hierarchyData = payload.root || payload.data || { name: 'root', children: [] };
    const root = d3.hierarchy(hierarchyData)
      .sum((d: any) => d.value || 0);

    d3.partition()
      .size([2 * Math.PI, radius])
      (root);

    const arc: any = d3.arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .innerRadius((d: any) => d.y0)
      .outerRadius((d: any) => d.y1);

    root.descendants().forEach((node: any, i: number) => {
      g.append('path')
        .attr('d', arc(node))
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8)
        .attr('stroke', 'white')
        .attr('stroke-width', 2);
    });
  }

  /**
   * 12. WORD CLOUD
   */
  private buildWordCloud(svg: any, payload: any, width: number, height: number): void {
    this.addTitle(svg, payload.title, width);

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const colors = this.getColors(payload);
    const words = payload.words;

    // Simple spiral placement (not perfect collision detection, but good enough)
    let angle = 0;
    let radius = 0;

    words.forEach((word: any, i: number) => {
      const fontSize = Math.max(14, Math.min(84, word.weight || 50));
      
      // Spiral outward
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      g.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('font-size', `${fontSize}px`)
        .attr('font-weight', 'bold')
        .attr('fill', colors[i % colors.length])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(word.text.toUpperCase());

      angle += 0.5;
      radius += 2;
    });
  }

  /**
   * 13. SANKEY DIAGRAM
   */
  private buildSankey(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 40, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const colors = this.getColors(payload);
    const nodes = payload.nodes;
    const links = payload.links;

    // Calculate node positions
    const columns = (d3.max(nodes, (n: any) => Number(n.col)) as number) || 1;
    const nodeWidth = 40;
    const nodeSpacing = (chartHeight - (nodes.length * nodeWidth)) / nodes.length;

    nodes.forEach((node: any, i: number) => {
      node.x = (chartWidth / columns) * node.col + nodeWidth;
      node.y = i * (nodeWidth + nodeSpacing) + nodeSpacing;
      node.height = nodeWidth;
    });

    // Draw links
    links.forEach((link: any, i: number) => {
      const source = nodes.find((n: any) => n.id === link.source);
      const target = nodes.find((n: any) => n.id === link.target);

      if (!source || !target) return;

      const pathData = `M${source.x + nodeWidth},${source.y + source.height / 2}
        C${source.x + nodeWidth + 100},${source.y + source.height / 2}
        ${target.x - 100},${target.y + target.height / 2}
        ${target.x},${target.y + target.height / 2}`;

      g.append('path')
        .attr('d', pathData)
        .attr('stroke', colors[i % colors.length])
        .attr('stroke-width', Math.max(2, link.value / 5))
        .attr('fill', 'none')
        .attr('opacity', 0.5);
    });

    // Draw nodes
    nodes.forEach((node: any, i: number) => {
      g.append('rect')
        .attr('x', node.x)
        .attr('y', node.y)
        .attr('width', nodeWidth)
        .attr('height', node.height)
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8);

      g.append('text')
        .attr('x', node.x + nodeWidth / 2)
        .attr('y', node.y + node.height / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(node.label);
    });
  }

  /**
   * 14. FUNNEL CHART
   */
  private buildFunnel(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 100, bottom: 40, left: 100 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    // Support both stages array and x/series format
    let stages: any[];
    if (payload.stages) {
      stages = payload.stages;
    } else if (payload.x && payload.series && payload.series[0]) {
      // Convert x/series to stages format
      stages = payload.x.map((label: string, i: number) => ({
        label,
        value: payload.series[0].values[i]
      }));
    } else {
      stages = [];
    }

    const maxValue = (d3.max(stages, (s: any) => Number(s.value)) as number) || 100;
    const stageHeight = chartHeight / stages.length;
    const colors = this.getColors(payload);

    stages.forEach((stage: any, i: number) => {
      const topWidth = (Number(stage.value) / maxValue) * chartWidth;
      const bottomWidth = i < stages.length - 1
        ? (Number(stages[i + 1].value) / maxValue) * chartWidth
        : topWidth;

      const x1 = (chartWidth - topWidth) / 2;
      const x2 = (chartWidth - bottomWidth) / 2;
      const y = i * stageHeight;

      const points = `${x1},${y} ${x1 + topWidth},${y} ${x2 + bottomWidth},${y + stageHeight} ${x2},${y + stageHeight}`;

      g.append('polygon')
        .attr('points', points)
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8)
        .attr('stroke', 'white')
        .attr('stroke-width', 2);

      g.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', y + stageHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .attr('font-size', '14px')
        .text(`${stage.label} (${stage.value})`);
    });
  }

  /**
   * 15. GANTT CHART
   */
  private buildGantt(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 60, left: 150 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const tasks = payload.tasks;
    const colors = this.getColors(payload);

    // Parse dates
    const allDates: Date[] = [];
    tasks.forEach((task: any) => {
      allDates.push(new Date(task.start));
      allDates.push(new Date(task.end));
    });

    const x = d3.scaleTime()
      .domain([d3.min(allDates) as Date, d3.max(allDates) as Date])
      .range([0, chartWidth]);

    const y = d3.scaleBand()
      .domain(tasks.map((t: any) => t.label))
      .range([0, chartHeight])
      .padding(0.2);

    // Bars
    tasks.forEach((task: any, i: number) => {
      const start = new Date(task.start);
      const end = new Date(task.end);

      g.append('rect')
        .attr('x', x(start) || 0)
        .attr('y', y(task.label) || 0)
        .attr('width', (x(end) || 0) - (x(start) || 0))
        .attr('height', y.bandwidth())
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8);
    });

    // Axes
    g.append('g')
      .call(d3.axisLeft(y));

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x));
  }

  /**
   * 16. CANDLESTICK CHART
   */
  private buildCandlestick(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const data = payload.ohlc || payload.data;
    const xLabels = payload.x || data.map((d: any) => d.x || d.date);

    const x = d3.scaleBand()
      .domain(xLabels)
      .range([0, chartWidth])
      .padding(0.3);

    const allPrices: number[] = data.flatMap((d: any) => [Number(d.high), Number(d.low)]);
    const y = d3.scaleLinear()
      .domain([d3.min(allPrices) || 0, d3.max(allPrices) || 100])
      .range([chartHeight, 0]);

    const colors = this.getColors(payload);

    // Candlesticks
    data.forEach((d: any, i: number) => {
      const xPos = (x(xLabels[i]) || 0) + x.bandwidth() / 2;
      const color = d.close >= d.open ? colors[3] : colors[0]; // Green if up, blue if down

      // High-low line
      g.append('line')
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', y(d.high))
        .attr('y2', y(d.low))
        .attr('stroke', color)
        .attr('stroke-width', 2);

      // Open-close box
      const boxY = y(Math.max(d.open, d.close));
      const boxHeight = Math.abs(y(d.open) - y(d.close)) || 2;

      g.append('rect')
        .attr('x', (x(xLabels[i]) || 0))
        .attr('y', boxY)
        .attr('width', x.bandwidth())
        .attr('height', boxHeight)
        .attr('fill', color)
        .attr('opacity', 0.8);
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(y));
  }

  /**
   * 17. FLOW DIAGRAM
   */
  private buildFlow(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 40, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const nodes = payload.nodes;
    const edges = payload.edges;
    const colors = this.getColors(payload);

    // Simple layout - distribute nodes evenly
    const nodeRadius = 40;
    const rows = Math.ceil(Math.sqrt(nodes.length));
    const cols = Math.ceil(nodes.length / rows);

    nodes.forEach((node: any, i: number) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      node.x = (col + 1) * (chartWidth / (cols + 1));
      node.y = (row + 1) * (chartHeight / (rows + 1));
    });

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999');

    // Draw edges
    edges.forEach((edge: any) => {
      const source = nodes.find((n: any) => n.id === edge.from);
      const target = nodes.find((n: any) => n.id === edge.to);

      if (!source || !target) return;

      g.append('line')
        .attr('x1', source.x)
        .attr('y1', source.y)
        .attr('x2', target.x)
        .attr('y2', target.y)
        .attr('stroke', '#999')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrow)');
    });

    // Draw nodes
    nodes.forEach((node: any, i: number) => {
      g.append('circle')
        .attr('cx', node.x)
        .attr('cy', node.y)
        .attr('r', nodeRadius)
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8)
        .attr('stroke', 'white')
        .attr('stroke-width', 2);

      g.append('text')
        .attr('x', node.x)
        .attr('y', node.y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(node.label);
    });
  }

  /**
   * 18. THEMERIVER CHART
   */
  private buildThemeRiver(svg: any, payload: any, width: number, height: number): void {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.addTitle(svg, payload.title, width);

    const xLabels = payload.x;
    const series = payload.series;
    const colors = this.getColors(payload);

    const x = d3.scalePoint()
      .domain(xLabels)
      .range([0, chartWidth]);

    // Stack the data
    const stackData: any[] = [];
    xLabels.forEach((label: string, i: number) => {
      const point: any = { x: label };
      series.forEach((s: any) => {
        point[s.name] = s.values[i];
      });
      stackData.push(point);
    });

    const stack = d3.stack()
      .keys(series.map((s: any) => s.name))
      .offset(d3.stackOffsetWiggle);

    const stackedData = stack(stackData);

    const yMin = (d3.min(stackedData, (layer: any) => (d3.min(layer, (d: any) => Number(d[0])) as number)) as number) || 0;
    const yMax = (d3.max(stackedData, (layer: any) => (d3.max(layer, (d: any) => Number(d[1])) as number)) as number) || 100;

    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([chartHeight, 0]);

    const area: any = d3.area()
      .x((d: any) => x(d.data.x) as number)
      .y0((d: any) => y(d[0]))
      .y1((d: any) => y(d[1]))
      .curve(d3.curveBasis);

    // Draw streams
    stackedData.forEach((layer: any, i: number) => {
      g.append('path')
        .datum(layer)
        .attr('fill', colors[i % colors.length])
        .attr('opacity', 0.8)
        .attr('d', area);
    });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');
  }
}

