# Lambda Function - Quick Start Guide

## 📁 Files Created

```
apps/api/lambda/cognito-post-signup-trigger/
├── index.mjs          # Lambda handler code
├── package.json       # Dependencies (pg)
├── deploy.sh          # Deployment script
├── README.md          # Full documentation
├── .gitignore         # Git ignore rules
└── QUICK_START.md     # This file
```

## 🚀 Quick Deployment (5 Steps)

### 1. Install Dependencies (2 minutes)

```bash
cd apps/api/lambda/cognito-post-signup-trigger
npm install
```

### 2. Create Deployment Package (1 minute)

**Windows (PowerShell):**
```powershell
Compress-Archive -Path index.mjs,package.json,node_modules -DestinationPath lambda-deployment.zip -Force
```

**Git Bash/WSL:**
```bash
bash deploy.sh
```

You should now have `lambda-deployment.zip` (~2-3 MB).

### 3. Create Lambda Function (5 minutes)

1. Go to: https://eu-west-1.console.aws.amazon.com/lambda/
2. Click **Create function**
3. Settings:
   - Name: `cognito-post-signup-trigger`
   - Runtime: Node.js 20.x
   - Create new role
4. Click **Create function**

### 4. Upload Code (2 minutes)

1. **Code** tab → **Upload from** → **.zip file**
2. Select `lambda-deployment.zip`
3. Click **Save**

### 5. Configure Lambda (10 minutes)

**A. Basic Settings:**
- Memory: 256 MB
- Timeout: 10 seconds

**B. Environment Variables:**
- Key: `DATABASE_URL`
- Value: Copy from Elastic Beanstalk environment variables

**C. VPC Configuration:**
- VPC: Same as RDS
- Subnets: Private subnets (2+)
- Security group: One that can access RDS port 5432

**D. IAM Permissions:**
- Attach: `AWSLambdaVPCAccessExecutionRole`
- Attach: `AWSLambdaBasicExecutionRole`

---

## 🧪 Testing

### Test in Lambda Console

1. **Test** tab → Create new event
2. Use this sample:

```json
{
  "version": "1",
  "triggerSource": "PostConfirmation_ConfirmSignUp",
  "userName": "test-123",
  "request": {
    "userAttributes": {
      "email": "test@example.com",
      "email_verified": "true"
    }
  },
  "response": {}
}
```

3. Click **Test**
4. Check logs - should see:
   - ✅ Organization created
   - ✅ User created
   - ✅ Trial subscription created

---

## 🔗 Connect to Cognito

After testing works:

1. Go to Cognito User Pool
2. **User pool properties** → **Lambda triggers**
3. **Add trigger**: Post confirmation
4. Select: `cognito-post-signup-trigger`
5. Save

---

## ✅ Verification

After a real user signs up via Cognito:

```sql
-- Check in database:
SELECT * FROM orgs ORDER BY created_at DESC LIMIT 5;
SELECT * FROM users ORDER BY created_at DESC LIMIT 5;
SELECT * FROM org_subscriptions WHERE status = 'trial' ORDER BY updated_at DESC LIMIT 5;
```

You should see matching records for the new user!

---

## 🐛 Troubleshooting

**Lambda times out?**
- Check VPC configuration
- Increase timeout to 15-30 seconds

**Can't connect to database?**
- Verify DATABASE_URL is correct
- Ensure Lambda is in same VPC as RDS
- Check security group allows Lambda → RDS on port 5432

**Permission errors?**
- Attach `AWSLambdaVPCAccessExecutionRole` to execution role

---

## 📚 Next Steps

After Lambda is working:
1. ✅ Create Cognito User Pool (see AWS_DEPLOYMENT_PROGRESS.md)
2. ✅ Connect Lambda trigger
3. ✅ Test signup flow
4. ✅ Configure API authentication
5. ✅ Deploy portal frontend

---

**Need help?** See full README.md for detailed instructions.
