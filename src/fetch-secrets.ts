#!/usr/bin/env node

/**
 * Fetch secrets from AWS Secrets Manager and export as environment variables
 * This runs before the main application starts
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const SECRET_ARN = 'arn:aws:secretsmanager:eu-west-1:217777498141:secret:nomad-apex/api-keys-66KWCe';
const REGION = 'eu-west-1';

async function fetchSecrets() {
  try {
    console.log('Fetching secrets from AWS Secrets Manager...');

    const client = new SecretsManagerClient({ region: REGION });
    const command = new GetSecretValueCommand({ SecretId: SECRET_ARN });

    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('No SecretString in response');
    }

    const secrets = JSON.parse(response.SecretString);

    // Export all secrets as environment variables
    for (const [key, value] of Object.entries(secrets)) {
      process.env[key] = String(value);
      console.log(`✓ Loaded ${key}`);
    }

    console.log(`Successfully loaded ${Object.keys(secrets).length} secrets`);

  } catch (error) {
    console.error('Error fetching secrets from AWS Secrets Manager:');
    console.error('Error name:', (error as any).name);
    console.error('Error message:', (error as any).message);
    if ((error as any).Code) console.error('AWS Error Code:', (error as any).Code);
    console.error('Application will start without secrets - this will likely cause validation errors');
    // Don't throw - let the app try to start anyway
  }
}

// Fetch secrets immediately
await fetchSecrets();
