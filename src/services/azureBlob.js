"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAccountFromConnectionString = parseAccountFromConnectionString;
exports.generateWriteBlobSasUrl = generateWriteBlobSasUrl;
exports.generateReadBlobSasUrl = generateReadBlobSasUrl;
var storage_blob_1 = require("@azure/storage-blob");
function parseAccountFromConnectionString(conn) {
    var parts = Object.fromEntries(conn.split(';').map(function (p) { return p.split('='); }));
    var accountName = parts['AccountName'];
    var accountKey = parts['AccountKey'];
    if (!accountName || !accountKey)
        throw new Error('Invalid storage connection string');
    return { accountName: accountName, accountKey: accountKey };
}
function generateWriteBlobSasUrl(_a) {
    var accountName = _a.accountName, accountKey = _a.accountKey, container = _a.container, blobPath = _a.blobPath, _b = _a.minutesValid, minutesValid = _b === void 0 ? 10 : _b;
    var sharedKeyCred = new storage_blob_1.StorageSharedKeyCredential(accountName, accountKey);
    var startsOn = new Date(Date.now() - 60 * 1000);
    var expiresOn = new Date(Date.now() + minutesValid * 60 * 1000);
    var permissions = storage_blob_1.BlobSASPermissions.parse('cw'); // create and write
    var sas = (0, storage_blob_1.generateBlobSASQueryParameters)({
        containerName: container,
        blobName: blobPath,
        permissions: permissions,
        startsOn: startsOn,
        expiresOn: expiresOn,
        protocol: storage_blob_1.SASProtocol.Https,
    }, sharedKeyCred).toString();
    var url = "https://".concat(accountName, ".blob.core.windows.net/").concat(encodeURIComponent(container), "/").concat(encodeURIComponent(blobPath), "?").concat(sas);
    return url;
}
function generateReadBlobSasUrl(_a) {
    var accountName = _a.accountName, accountKey = _a.accountKey, container = _a.container, blobPath = _a.blobPath, _b = _a.minutesValid, minutesValid = _b === void 0 ? 60 : _b;
    var sharedKeyCred = new storage_blob_1.StorageSharedKeyCredential(accountName, accountKey);
    var startsOn = new Date(Date.now() - 60 * 1000);
    var expiresOn = new Date(Date.now() + minutesValid * 60 * 1000);
    var permissions = storage_blob_1.BlobSASPermissions.parse('r');
    var sas = (0, storage_blob_1.generateBlobSASQueryParameters)({
        containerName: container,
        blobName: blobPath,
        permissions: permissions,
        startsOn: startsOn,
        expiresOn: expiresOn,
        protocol: storage_blob_1.SASProtocol.Https,
    }, sharedKeyCred).toString();
    return "https://".concat(accountName, ".blob.core.windows.net/").concat(encodeURIComponent(container), "/").concat(encodeURIComponent(blobPath), "?").concat(sas);
}
