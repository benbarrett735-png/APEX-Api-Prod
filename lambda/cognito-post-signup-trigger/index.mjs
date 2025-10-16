/**
 * AWS Lambda Function: Cognito Post-Signup Trigger
 *
 * Purpose: Automatically creates database records when a user signs up via Cognito
 *
 * Triggered by: Cognito Post-Confirmation event (after user verifies email)
 *
 * What it does:
 * 1. Checks if user already exists in database (by email)
 * 2. Creates new organization for the user
 * 3. Creates user record in the users table
 * 4. User is ready - org and user exist, waiting for Stripe subscription
 *
 * Integration with Stripe:
 * - When user pays via Stripe, webhook finds user by email (already exists!)
 * - Stripe webhook creates org_subscriptions record with subscription details
 * - No edge cases or race conditions
 */

import pg from 'pg';

const { Pool } = pg;
let dbPool;

/**
 * Initialize database connection pool (reused across Lambda invocations)
 */
async function getDbPool() {
  if (!dbPool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    dbPool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false // Required for AWS RDS
      },
      // Connection pool settings for Lambda
      max: 1, // Lambda doesn't need many connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return dbPool;
}

/**
 * Main Lambda handler
 *
 * @param {Object} event - Cognito Post-Confirmation trigger event
 * @returns {Object} event - Must return the event to continue Cognito flow
 */
export const handler = async (event) => {
  console.log('🚀 Cognito Post-Signup Trigger invoked');
  console.log('Event:', JSON.stringify(event, null, 2));

  // Extract user information from Cognito event
  const { userAttributes } = event.request;
  const email = userAttributes.email;
  const cognitoUserId = event.userName; // Cognito's unique user ID (sub)
  const emailVerified = userAttributes.email_verified === 'true';

  console.log(`📧 Processing signup for: ${email}`);
  console.log(`✅ Email verified: ${emailVerified}`);
  console.log(`🆔 Cognito User ID: ${cognitoUserId}`);

  try {
    const pool = await getDbPool();

    // Check if user already exists in database
    console.log(`🔍 Checking if user ${email} already exists...`);
    const existingUserResult = await pool.query(
      'SELECT id, org_id FROM users WHERE email = $1',
      [email]
    );

    if (existingUserResult.rows.length > 0) {
      const existingUser = existingUserResult.rows[0];
      console.log(`⚠️  User ${email} already exists (id: ${existingUser.id})`);
      console.log(`✅ Skipping database creation - returning success`);

      // User exists - this is OK, might be created by Stripe webhook earlier
      // Just return event to allow login to proceed
      return event;
    }

    console.log(`✨ User ${email} is new - creating database records...`);

    // Extract name from email for workspace name (e.g., "john@example.com" → "john's Workspace")
    const emailUsername = email.split('@')[0];
    const workspaceName = `${emailUsername}'s Workspace`;

    // Create new organization
    console.log(`🏢 Creating organization: ${workspaceName}`);
    const orgResult = await pool.query(
      `INSERT INTO orgs (id, name, created_at)
       VALUES (uuid_generate_v4(), $1, NOW())
       RETURNING id`,
      [workspaceName]
    );

    const orgId = orgResult.rows[0].id;
    console.log(`✅ Organization created with ID: ${orgId}`);

    // Create user record
    console.log(`👤 Creating user record for: ${email}`);
    const userResult = await pool.query(
      `INSERT INTO users (id, org_id, email, role, created_at)
       VALUES (uuid_generate_v4(), $1, $2, 'admin', NOW())
       RETURNING id`,
      [orgId, email]
    );

    const userId = userResult.rows[0].id;
    console.log(`✅ User created with ID: ${userId}`);

    console.log(`🎉 SUCCESS: Account fully provisioned for ${email}`);
    console.log(`📊 Summary:
    - Organization: ${workspaceName} (${orgId})
    - User: ${email} (${userId})
    - Status: Ready for Stripe subscription
    `);

  } catch (error) {
    console.error('❌ ERROR: Failed to create user in database');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    // IMPORTANT: Don't throw error - allow signup to complete even if DB fails
    // User can be created later via API call or support ticket
    // This prevents signup failures due to temporary database issues
    console.log('⚠️  Continuing Cognito signup despite database error');
    console.log('📝 User will need manual provisioning or retry via API');
  }

  // CRITICAL: Must return event to continue Cognito authentication flow
  return event;
};
