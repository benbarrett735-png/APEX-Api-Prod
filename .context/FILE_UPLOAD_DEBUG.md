# File Upload Debugging

**Issue:** User uploaded "Creative brief.pdf" but API says "No uploaded files"

**Status:** 🔍 Debugging with enhanced logging

---

## What Should Happen

**Portal Flow:**
1. User uploads file → Portal
2. Portal sends to ADI (Azure Document Intelligence)
3. ADI extracts text content
4. Portal makes API request:
```json
POST /research/start
{
  "query": "tell me about cabots...",
  "depth": "medium",
  "uploaded_files": [
    {
      "uploadId": "abc123",
      "fileName": "Creative brief.pdf",
      "content": "... extracted text ..."
    }
  ]
}
```

**API Should:**
1. Receive request with `uploaded_files` array
2. Log file details
3. Process file content with APIM
4. Extract findings
5. Complement with web search

---

## Debug Logging Added

**POST /start endpoint:**
```typescript
console.log('[Research] POST /start received:');
console.log('  Query:', query?.substring(0, 100));
console.log('  Depth:', depth);
console.log('  uploaded_files type:', typeof uploaded_files);
console.log('  uploaded_files is array:', Array.isArray(uploaded_files));
console.log('  uploaded_files length:', uploaded_files?.length || 0);
if (uploaded_files && uploaded_files.length > 0) {
  console.log('  First file:', JSON.stringify(uploaded_files[0], null, 2));
}
```

**SSE Stream:**
```typescript
console.log('[Research] Raw uploaded_files from DB:', typeof run.uploaded_files, run.uploaded_files);
console.log('[Research] Parsed uploadedFiles:', uploadedFiles.length, 'files');
if (uploadedFiles.length > 0) {
  console.log('[Research] First file:', {
    hasUploadId: !!uploadedFiles[0]?.uploadId,
    hasFileName: !!uploadedFiles[0]?.fileName,
    hasContent: !!uploadedFiles[0]?.content,
    contentLength: uploadedFiles[0]?.content?.length || 0
  });
}
```

---

## How to Test

1. **Upload file** in Portal (Creative brief.pdf)
2. **Send query:** "tell me about cabots, their current market reach..."
3. **Check logs:** `/tmp/api-debug-full.log`

**Expected logs:**
```
[Research] POST /start received:
  Query: tell me about cabots...
  Depth: medium
  uploaded_files type: object
  uploaded_files is array: true
  uploaded_files length: 1
  First file: {
    "uploadId": "...",
    "fileName": "Creative brief.pdf",
    "content": "... extracted text ..."
  }
```

**If `uploaded_files.length: 0`:** Portal isn't sending files  
**If `content` is missing:** Portal needs to include ADI extraction  
**If logs don't appear:** Request isn't reaching API  

---

## Possible Issues

### **Issue 1: Portal Not Sending Files**
**Symptom:** `uploaded_files.length: 0` or `uploaded_files` is `undefined`

**Fix (Portal Side):**
```typescript
// Make sure Portal sends this:
const response = await fetch('/research/start', {
  method: 'POST',
  body: JSON.stringify({
    query,
    depth,
    uploaded_files: pendingFiles.map(f => ({
      uploadId: f.uploadId,
      fileName: f.file.name,
      content: f.content // ← Must include ADI-extracted text!
    }))
  })
});
```

### **Issue 2: Content Not Extracted**
**Symptom:** File sent but `content` field is empty

**Fix (Portal Side):**
```typescript
// After ADI processing:
const pollData = await adiPoll(analyzeResult.resultId);
setPendingFiles(prev => prev.map((pf, idx) => 
  idx === fileIndex 
    ? { 
        ...pf, 
        content: pollData.extractedText, // ← Must capture this!
        uploadId: pollData.uploadId,
        processing: false 
      }
    : pf
));
```

### **Issue 3: Array vs Object**
**Symptom:** Files sent as object instead of array

**Fix:** API now handles both:
```typescript
uploaded_files?: string[] | UploadedFile[]
```

---

## Next Steps

1. ✅ Added debug logging
2. ✅ Server restarted
3. ⏳ **User: Try uploading file again**
4. ⏳ Check logs at `/tmp/api-debug-full.log`
5. ⏳ Identify where files are lost (Portal vs API)

---

**Log file:** `/tmp/api-debug-full.log`  
**Command:** `tail -f /tmp/api-debug-full.log`

