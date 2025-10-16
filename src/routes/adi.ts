import { Router } from "express";
import { ENV, MODELS, apimUrl, pathWithParams } from "@nomadapex/config";
import { generateWriteBlobSasUrl, generateReadBlobSasUrl } from "../services/azureBlob.js";

const r = Router();

/** POST /adi/analyze { fileData, fileName, mimeType, model? } -> { modelId, resultId } */
r.post("/analyze", async (req, res) => {
  try {
    const fileData = String(req.body?.fileData || "");
    const fileName = String(req.body?.fileName || "document.pdf");
    const mimeType = String(req.body?.mimeType || "application/pdf");
    
    if (!fileData) {
      return res.status(400).json({ error: "missing_fileData" });
    }

    // Get model ID from request or use default
    const model = String(req.body?.model || "default");
    const modelId = MODELS[model as keyof typeof MODELS] ?? MODELS.default;
    
    console.log(`[ADI] Analyzing: ${fileName} (${mimeType}) with model: ${modelId}`);

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');
    const blobName = `adi_upload_${Date.now()}_${fileName}`;
    
    // Check ADI configuration
    if (!ENV.ADI_ANALYZE_PATH || !ENV.ADI_API_VERSION || !ENV.ADI_STRING_INDEX_TYPE) {
      return res.status(500).json({ 
        error: "adi_not_configured", 
        detail: "ADI environment variables not set" 
      });
    }

    // Check if we have storage credentials
    const hasStorage = !!(ENV.STORAGE_ACCOUNT && ENV.STORAGE_ACCOUNT_KEY && ENV.STORAGE_CONTAINER);
    
    let analyzeUrl: string;
    let requestBody: any;
    let requestHeaders: Record<string, string>;
    
    if (hasStorage) {
      console.log('[ADI] Using blob storage upload');
      
      // Generate write SAS URL
      const writeSasUrl = generateWriteBlobSasUrl({
        accountName: ENV.STORAGE_ACCOUNT!,
        accountKey: ENV.STORAGE_ACCOUNT_KEY!,
        container: ENV.STORAGE_CONTAINER!,
        blobPath: blobName,
        minutesValid: (ENV.SAS_EXPIRY_HOURS || 24) * 60
      });

      // Upload to blob storage
      const uploadRes = await fetch(writeSasUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': mimeType,
          'Content-Length': buffer.length.toString()
        },
        body: buffer
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error('[ADI] Blob upload failed:', uploadRes.status, errorText);
        return res.status(502).json({ 
          error: "blob_upload_failed", 
          detail: `${uploadRes.status} ${errorText}` 
        });
      }
      
      console.log('[ADI] Blob uploaded successfully');

      // Generate read SAS URL for ADI
      const readSasUrl = generateReadBlobSasUrl({
        accountName: ENV.STORAGE_ACCOUNT!,
        accountKey: ENV.STORAGE_ACCOUNT_KEY!,
        container: ENV.STORAGE_CONTAINER!,
        blobPath: blobName,
        minutesValid: (ENV.SAS_EXPIRY_HOURS || 24) * 60
      });

      // Build analyze URL through APIM  
      const apiVersion = ENV.ADI_API_VERSION!;
      const stringIndexType = ENV.ADI_STRING_INDEX_TYPE!;
      // @ts-ignore - queryParams type inference issue
      analyzeUrl = apimUrl(pathWithParams(ENV.ADI_ANALYZE_PATH!, { modelId }) + `?api-version=${apiVersion}&stringIndexType=${stringIndexType}`);
      
      requestBody = { urlSource: readSasUrl };
      requestHeaders = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": ENV.APIM_SUBSCRIPTION_KEY
      };
    } else {
      console.log('[ADI] Using direct binary upload');
      
      // Build analyze URL through APIM  
      const apiVersion = ENV.ADI_API_VERSION!;
      const stringIndexType = ENV.ADI_STRING_INDEX_TYPE!;
      // @ts-ignore - queryParams type inference issue
      analyzeUrl = apimUrl(pathWithParams(ENV.ADI_ANALYZE_PATH!, { modelId }) + `?api-version=${apiVersion}&stringIndexType=${stringIndexType}`);
      
      requestBody = buffer;
      requestHeaders = {
        "Content-Type": mimeType,
        "Ocp-Apim-Subscription-Key": ENV.APIM_SUBSCRIPTION_KEY
      };
    }
    
    console.log(`[ADI] Sending to APIM: ${analyzeUrl}`);
    
    // Send to ADI via APIM
    const analyzeRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: requestHeaders,
      body: typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)
    });
    
    console.log(`[ADI] APIM response: ${analyzeRes.status} ${analyzeRes.statusText}`);

    if (analyzeRes.status !== 202) {
      const errorText = await analyzeRes.text();
      console.error('[ADI] Analyze failed:', errorText);
      return res.status(analyzeRes.status).json({ 
        error: "analyze_failed", 
        detail: errorText 
      });
    }
    
    // Extract result ID from operation-location header
    const opLocation = analyzeRes.headers.get("operation-location");
    if (!opLocation) {
      return res.status(502).json({ 
        error: "missing_operation_location",
        detail: "No operation-location header in response"
      });
    }
    
    console.log('[ADI] Operation location:', opLocation);
    
    // Extract resultId from operation-location URL
    const resultId = extractResultId(opLocation);
    if (!resultId) {
      return res.status(502).json({ 
        error: "invalid_operation_location",
        detail: `Could not parse resultId from: ${opLocation}`
      });
    }
    
    console.log(`[ADI] Analysis started - modelId: ${modelId}, resultId: ${resultId}`);
    
    res.json({ modelId, resultId });
    
  } catch (error: any) {
    console.error('[ADI] Analyze error:', error);
    res.status(502).json({ 
      error: "analyze_exception", 
      detail: error.message 
    });
  }
});

/** POST /adi/poll { modelId, resultId } -> { result } */
r.post("/poll", async (req, res) => {
  try {
    const modelId = String(req.body?.modelId || "");
    const resultId = String(req.body?.resultId || "");
    
    if (!modelId || !resultId) {
      return res.status(400).json({ 
        error: "missing_parameters",
        detail: "modelId and resultId are required" 
      });
    }

    // Check ADI configuration
    if (!ENV.ADI_RESULT_PATH || !ENV.ADI_API_VERSION) {
      return res.status(500).json({ 
        error: "adi_not_configured", 
        detail: "ADI environment variables not set" 
      });
    }

    console.log(`[ADI] Polling - modelId: ${modelId}, resultId: ${resultId}`);
    
    // Build result URL through APIM
    const path = pathWithParams(ENV.ADI_RESULT_PATH, { modelId, resultId });
    const queryString = `?api-version=${ENV.ADI_API_VERSION}`;
    const pollUrl = apimUrl(path + queryString);
    
    console.log(`[ADI] Poll URL: ${pollUrl}`);
    
    // Poll for results with retries
    const pollInterval = (ENV.RESULTS_POLL_INTERVAL || 2) * 1000;
    const maxAttempts = 60;
    let result: any = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pollRes = await fetch(pollUrl, {
        headers: { 
          "Ocp-Apim-Subscription-Key": ENV.APIM_SUBSCRIPTION_KEY 
        }
      });
      
      if (!pollRes.ok) {
        const errorText = await pollRes.text();
        console.error(`[ADI] Poll failed: ${pollRes.status} ${errorText}`);
        return res.status(pollRes.status).json({ 
          error: "poll_failed", 
          detail: errorText 
        });
      }
      
      const contentType = pollRes.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      
      if (!isJson) {
        const textResponse = await pollRes.text();
        console.error('[ADI] Non-JSON response:', textResponse);
        return res.status(502).json({ 
          error: "invalid_response", 
          detail: "Expected JSON response from ADI" 
        });
      }
      
      result = await pollRes.json();
      const status = (result?.status || "").toLowerCase();
      
      console.log(`[ADI] Poll attempt ${attempt + 1}: status = ${status}`);
      
      // Check if processing is complete
      if (status === "succeeded" || status === "failed") {
        break;
      }
      
      // Still processing, wait before next attempt
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    if (!result) {
      return res.status(502).json({ 
        error: "poll_timeout",
        detail: "No result after maximum attempts" 
      });
    }
    
    const finalStatus = result?.status || "unknown";
    console.log(`[ADI] Final status: ${finalStatus}`);
    
    if (finalStatus === "failed") {
      return res.status(502).json({ 
        error: "analysis_failed",
        detail: result?.error || "ADI analysis failed" 
      });
    }
    
    res.json({ 
      modelId, 
      resultId, 
      result 
    });
    
  } catch (error: any) {
    console.error('[ADI] Poll error:', error);
    res.status(502).json({ 
      error: "poll_exception", 
      detail: error.message 
    });
  }
});

/** Helper to extract resultId from operation-location header */
function extractResultId(operationLocation: string): string | null {
  try {
    const url = new URL(operationLocation);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Look for "analyzeResults" or "results" followed by the ID
    const resultsIndex = pathParts.findIndex(p => 
      p.toLowerCase() === "analyzeresults" || p.toLowerCase() === "results"
    );
    
    if (resultsIndex >= 0 && pathParts[resultsIndex + 1]) {
      return pathParts[resultsIndex + 1];
    }
    
    // Fallback: try regex pattern
    const match = operationLocation.match(/(?:analyzeResults|results)\/([^/?]+)/i);
    return match ? match[1] : null;
    
  } catch (error) {
    console.error('[ADI] Error parsing operation-location:', error);
    return null;
  }
}

export default r;
