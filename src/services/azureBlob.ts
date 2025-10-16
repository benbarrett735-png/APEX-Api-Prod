import { BlobSASPermissions, SASProtocol, StorageSharedKeyCredential, generateBlobSASQueryParameters } from '@azure/storage-blob';

export type SasInputs = {
  accountName: string;
  accountKey: string;
  container: string;
  blobPath: string;
  minutesValid?: number;
};

export function parseAccountFromConnectionString(conn: string): { accountName: string; accountKey: string } {
  const parts = Object.fromEntries(conn.split(';').map((p) => p.split('=')) as [string, string][]);
  const accountName = parts['AccountName'];
  const accountKey = parts['AccountKey'];
  if (!accountName || !accountKey) throw new Error('Invalid storage connection string');
  return { accountName, accountKey };
}

export function generateWriteBlobSasUrl({ accountName, accountKey, container, blobPath, minutesValid = 10 }: SasInputs): string {
  const sharedKeyCred = new StorageSharedKeyCredential(accountName, accountKey);
  const startsOn = new Date(Date.now() - 60 * 1000);
  const expiresOn = new Date(Date.now() + minutesValid * 60 * 1000);
  const permissions = BlobSASPermissions.parse('cw'); // create and write
  const sas = generateBlobSASQueryParameters({
    containerName: container,
    blobName: blobPath,
    permissions,
    startsOn,
    expiresOn,
    protocol: SASProtocol.Https,
  }, sharedKeyCred).toString();
  const url = `https://${accountName}.blob.core.windows.net/${encodeURIComponent(container)}/${encodeURIComponent(blobPath)}?${sas}`;
  return url;
}

export function generateReadBlobSasUrl({ accountName, accountKey, container, blobPath, minutesValid = 60 }: SasInputs): string {
  const sharedKeyCred = new StorageSharedKeyCredential(accountName, accountKey);
  const startsOn = new Date(Date.now() - 60 * 1000);
  const expiresOn = new Date(Date.now() + minutesValid * 60 * 1000);
  const permissions = BlobSASPermissions.parse('r');
  const sas = generateBlobSASQueryParameters({
    containerName: container,
    blobName: blobPath,
    permissions,
    startsOn,
    expiresOn,
    protocol: SASProtocol.Https,
  }, sharedKeyCred).toString();
  return `https://${accountName}.blob.core.windows.net/${encodeURIComponent(container)}/${encodeURIComponent(blobPath)}?${sas}`;
}


