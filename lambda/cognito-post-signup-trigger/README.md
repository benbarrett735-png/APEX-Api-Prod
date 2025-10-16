# Cognito Post-Signup Trigger Lambda Function

## Purpose

This Lambda function automatically creates database records when a user signs up via AWS Cognito.

**Triggered by**: Cognito Post-Confirmation event (after user verifies email)

**What it does**:
1. Checks if user already exists in database (by email)
2. Creates new organization for the user
3. Creates user record in the `users` table
4. Creates trial subscription in `org_subscriptions` table (7-day free trial)

## Integration with Stripe Payments

This Lambda enables seamless Stripe integration:

```
User Signs Up → Cognito → Lambda creates org + user + trial
User Subscribes → Stripe webhook finds user by email → Updates trial to active
```

No edge cases, no race conditions - the database is always ready!

---

## Deployment Instructions

### Step 1: Install Dependencies

```bash
cd apps/api/lambda/cognito-post-signup-trigger
npm install
```

This will install the `pg` (PostgreSQL client) dependency.

### Step 2: Package for Lambda

**Option A: Manual ZIP Creation (Windows)**

```bash
# Create ZIP file with all files
powershell Compress-Archive -Path index.mjs,package.json,node_modules -DestinationPath lambda-deployment.zip -Force
```

**Option B: Use deploy.sh script (Git Bash/WSL)**

```bash
bash deploy.sh
```

This creates `lambda-deployment.zip` ready for upload.

### Step 3: Create Lambda Function in AWS Console

1. Go to: https://eu-west-1.console.aws.amazon.com/lambda/
2. Click **Create function**
3. Configure:
   - **Function name**: `cognito-post-signup-trigger`
   - **Runtime**: Node.js 20.x
   - **Architecture**: x86_64
   - **Execution role**: Create new role (or use existing with permissions below)
4. Click **Create function**

### Step 4: Upload Code

1. In the Lambda function page, go to **Code** tab
2. Click **Upload from** → **.zip file**
3. Select `lambda-deployment.zip`
4. Click **Save**

### Step 5: Configure Lambda Settings

**A. Basic Settings**
1. Go to **Configuration** → **General configuration**
2. Click **Edit**
3. Set:
   - **Memory**: 256 MB
   - **Timeout**: 10 seconds
4. Click **Save**

**B. Environment Variables**
1. Go to **Configuration** → **Environment variables**
2. Click **Edit** → **Add environment variable**
3. Add:
   - **Key**: `DATABASE_URL`
   - **Value**: Get from Elastic Beanstalk environment variables
     - Go to EB Console → nomad-apex-env → Configuration → Software
     - Copy the `DATABASE_URL` value
4. Click **Save**

**C. VPC Configuration** (REQUIRED for RDS access)
1. Go to **Configuration** → **VPC**
2. Click **Edit**
3. Configure:
   - **VPC**: Select the same VPC as your RDS database
   - **Subnets**: Select at least 2 private subnets (same as RDS)
   - **Security groups**: Select or create a security group that can access RDS
     - The security group needs outbound access to RDS port 5432
4. Click **Save**

**Note**: Lambda will take a few minutes to apply VPC changes.

**D. IAM Role Permissions**
1. Go to **Configuration** → **Permissions**
2. Click on the **Execution role** name (opens IAM console)
3. Ensure these policies are attached:
   - ✅ `AWSLambdaVPCAccessExecutionRole` (for VPC access)
   - ✅ `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
   - ✅ Optional: `SecretsManagerReadWrite` (if DATABASE_URL is in Secrets Manager)
4. If missing, click **Attach policies** and add them

### Step 6: Test Lambda Function

1. Go to **Test** tab
2. Create new test event:
   - **Event name**: `TestCognitoSignup`
   - **Template**: Use the sample event below
3. Click **Save**
4. Click **Test**

**Sample Test Event**:
```json
{
  "version": "1",
  "triggerSource": "PostConfirmation_ConfirmSignUp",
  "region": "eu-west-1",
  "userPoolId": "eu-west-1_XXXXXXXXX",
  "userName": "test-user-123",
  "callerContext": {
    "awsSdkVersion": "aws-sdk-unknown-unknown",
    "clientId": "XXXXXXXXXXXXXXXXXXXX"
  },
  "request": {
    "userAttributes": {
      "sub": "test-user-123",
      "email_verified": "true",
      "cognito:user_status": "CONFIRMED",
      "email": "test@example.com"
    }
  },
  "response": {}
}
```

**Expected Output**: Check CloudWatch logs for success messages:
- ✅ Organization created
- ✅ User created
- ✅ Trial subscription created

### Step 7: Connect Lambda to Cognito

1. Go to AWS Cognito: https://eu-west-1.console.aws.amazon.com/cognito/
2. Click on your User Pool (`nomad-apex-users`)
3. Go to **User pool properties** → **Lambda triggers**
4. Click **Add Lambda trigger**
5. Select:
   - **Trigger type**: Authentication
   - **Sign-up**: Post confirmation trigger
   - **Lambda function**: `cognito-post-signup-trigger`
6. Click **Add Lambda trigger**

### Step 8: Test End-to-End

1. Create a test user in Cognito (via portal or console)
2. Verify email
3. Check database to confirm:
   - Organization created in `orgs` table
   - User created in `users` table
   - Trial subscription created in `org_subscriptions` table

---

## Monitoring & Troubleshooting

### View Logs

1. Go to Lambda function → **Monitor** tab
2. Click **View CloudWatch logs**
3. Look for log streams with recent activity

### Common Issues

**Issue**: Lambda timeout
- **Cause**: VPC configuration or slow database connection
- **Fix**: Increase timeout to 15-30 seconds, check VPC/security groups

**Issue**: Database connection error
- **Cause**: DATABASE_URL incorrect or Lambda not in VPC
- **Fix**: Verify DATABASE_URL, ensure Lambda is in same VPC as RDS

**Issue**: Permission denied
- **Cause**: Missing IAM permissions
- **Fix**: Attach `AWSLambdaVPCAccessExecutionRole` to Lambda execution role

**Issue**: Cold start delays
- **Cause**: Lambda initializing after idle period
- **Fix**: Normal for Lambda, consider provisioned concurrency for production

### Check Database Manually

```sql
-- Connect to RDS and run:

-- Check if organization was created
SELECT * FROM orgs WHERE name LIKE '%test%' ORDER BY created_at DESC LIMIT 5;

-- Check if user was created
SELECT * FROM users WHERE email = 'test@example.com';

-- Check if trial subscription was created
SELECT * FROM org_subscriptions WHERE status = 'trial' ORDER BY updated_at DESC LIMIT 5;
```

---

## Cost

- **Free Tier**: 1 million requests/month + 400,000 GB-seconds of compute
- **Expected usage**: ~100-500 signups/month = essentially FREE
- **Cost after free tier**: $0.20 per 1M requests + $0.0000166667 per GB-second

**For Stage 1 (100-500 users)**: $0/month (well within free tier)

---

## Security Considerations

✅ **No secrets in code** - DATABASE_URL from environment variable
✅ **VPC isolation** - Lambda runs in private subnet, no internet access needed
✅ **Minimal permissions** - IAM role only has necessary permissions
✅ **SSL/TLS** - Database connection uses SSL (`rejectUnauthorized: false` for RDS)
✅ **Error handling** - Won't block signup if database temporarily unavailable
✅ **Connection pooling** - Reuses database connections across invocations

---

## Future Enhancements

- [ ] Add support for Cognito user attributes (name, phone, etc.)
- [ ] Send welcome email via SES after signup
- [ ] Add CloudWatch alarms for Lambda errors
- [ ] Add X-Ray tracing for debugging
- [ ] Support for team invitations (user joins existing org)

---

## Related Documentation

- [AWS Lambda Node.js](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [Cognito Lambda Triggers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html)
- [AWS Lambda VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)

---

**Last Updated**: 2025-10-13 (Day 3)
