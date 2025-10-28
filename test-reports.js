#!/usr/bin/env node

/**
 * Test Reports Flow End-to-End
 * Tests the entire reports generation pipeline
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ ERROR: TEST_AUTH_TOKEN environment variable required');
  console.error('Usage: TEST_AUTH_TOKEN=your_token node test-reports.js');
  process.exit(1);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testReportsFlow() {
  console.log('🧪 Testing Reports Flow End-to-End\n');
  console.log(`API: ${API_URL}`);
  console.log(`Auth: ${AUTH_TOKEN.substring(0, 20)}...`);
  console.log('─'.repeat(60));

  try {
    // Step 1: Start report generation
    console.log('\n📝 Step 1: Starting report generation...');
    const startResponse = await fetch(`${API_URL}/reports/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        goal: 'Analyze Tesla market position 2024',
        reportLength: 'medium',
        reportFocus: 'competitive analysis',
        selectedCharts: ['bar'],
        uploaded_files: []
      })
    });

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Start failed: ${startResponse.status} - ${error}`);
    }

    const startData = await startResponse.json();
    console.log('✅ Report started:', startData);
    const runId = startData.run_id;

    // Step 2: Connect to stream
    console.log(`\n📡 Step 2: Connecting to stream: /reports/stream/${runId}`);
    
    const streamUrl = `${API_URL}/reports/stream/${runId}`;
    const streamResponse = await fetch(streamUrl, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!streamResponse.ok) {
      throw new Error(`Stream connection failed: ${streamResponse.status}`);
    }

    console.log('✅ Stream connected, listening for events...\n');

    // Step 3: Read stream events
    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;
    let errorOccurred = false;
    let lastEvent = null;

    const timeout = setTimeout(() => {
      if (!completed) {
        console.log('\n⏱️  5 minute timeout reached');
        reader.cancel();
      }
    }, 5 * 60 * 1000); // 5 minutes

    while (!completed && !errorOccurred) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('\n📡 Stream ended');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue; // Skip empty or keepalive

        const eventMatch = line.match(/event: (.+)/);
        const dataMatch = line.match(/data: (.+)/);

        if (eventMatch && dataMatch) {
          const eventType = eventMatch[1];
          const eventData = JSON.parse(dataMatch[1]);
          lastEvent = { type: eventType, data: eventData };

          console.log(`📨 ${eventType}:`, JSON.stringify(eventData, null, 2).substring(0, 200));

          if (eventType === 'report.completed') {
            completed = true;
            clearTimeout(timeout);
            console.log('\n✅ REPORT COMPLETED!');
            console.log('Report length:', eventData.report_content?.length || 0, 'characters');
            break;
          } else if (eventType === 'error') {
            errorOccurred = true;
            clearTimeout(timeout);
            console.log('\n❌ ERROR:', eventData);
            break;
          }
        }
      }
    }

    if (completed) {
      console.log('\n✅ TEST PASSED: Report generated successfully');
      process.exit(0);
    } else if (errorOccurred) {
      console.log('\n❌ TEST FAILED: Error occurred during generation');
      process.exit(1);
    } else {
      console.log('\n⚠️  TEST INCONCLUSIVE: Stream ended without completion');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testReportsFlow();

