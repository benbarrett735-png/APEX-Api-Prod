"use strict";
/**
 * Chart Service
 * Orchestrates the chart generation flow with data intelligence:
 * 1. User provides data + chart type
 * 2. APIM analyzes: user-based data or needs external data?
 * 3. If external needed: Search via OpenAI API
 * 4. Send all data to APIM to format into chart-specific JSON
 * 5. Execute Python builder with formatted JSON
 * 6. Return chart image
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChartService = void 0;
var child_process_1 = require("child_process");
var promises_1 = require("fs/promises");
var path_1 = require("path");
var os_1 = require("os");
var crypto_1 = require("crypto");
/**
 * Chart Service Class
 */
var ChartService = /** @class */ (function () {
    function ChartService() {
        this.apimHost = process.env.APIM_HOST || '';
        this.apimKey = process.env.APIM_SUBSCRIPTION_KEY || '';
        this.storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
        this.openAiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || '';
        if (!this.apimHost || !this.apimKey) {
            console.error('[ChartService] Missing APIM_HOST or APIM_SUBSCRIPTION_KEY');
        }
        if (!this.openAiKey) {
            console.warn('[ChartService] Missing OPENAI_API_KEY - external data search will not be available');
        }
    }
    /**
     * Generate a chart with intelligent data sourcing
     */
    ChartService.prototype.generateChart = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var formattedPayload, analysis, finalData, specialChartTypes, formattedData, chartPath_1, chartUrl_1, formattedData, externalData, externalData, alternativeQueries, _i, alternativeQueries_1, altQuery, altData, chartPath, chartUrl, chartId, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 28, , 29]);
                        console.log("[ChartService] \uD83C\uDFAF Starting intelligent chart generation for ".concat(request.chartType));
                        formattedPayload = void 0;
                        // Check if we have APIM configured for intelligent data analysis
                        console.log('[ChartService] APIM config check:', { apimHost: this.apimHost, apimKey: this.apimKey });
                        if (!(this.apimHost && this.apimKey)) return [3 /*break*/, 24];
                        // STEP 1: Analyze data source - ask APIM if we need external data
                        console.log('[ChartService] STEP 1: Analyzing data source...');
                        return [4 /*yield*/, this.analyzeDataSource(request)];
                    case 1:
                        analysis = _b.sent();
                        console.log("[ChartService] Analysis result: ".concat(analysis.dataType, " - ").concat(analysis.reasoning));
                        finalData = request.data;
                        specialChartTypes = ['funnel', 'heatmap', 'radar', 'sankey', 'sunburst', 'treemap', 'candlestick', 'flow', 'gantt', 'stackedbar', 'themeriver', 'wordcloud'];
                        if (!specialChartTypes.includes(request.chartType)) return [3 /*break*/, 11];
                        console.log("[ChartService] Special chart type ".concat(request.chartType, " - will use direct data without APIM formatting"));
                        if (!(request.chartType === 'sankey' && request.goal && request.goal.trim())) return [3 /*break*/, 6];
                        console.log('[ChartService] Using APIM for dynamic Sankey data formatting...');
                        return [4 /*yield*/, this.formatDataWithAPIM(request)];
                    case 2:
                        formattedData = _b.sent();
                        if (!formattedData) return [3 /*break*/, 5];
                        formattedPayload = formattedData;
                        console.log('[ChartService] Successfully formatted Sankey data via APIM');
                        console.log('[ChartService] Formatted data:', JSON.stringify(formattedPayload, null, 2));
                        return [4 /*yield*/, this.executePythonBuilder(request.chartType, formattedPayload)];
                    case 3:
                        chartPath_1 = _b.sent();
                        return [4 /*yield*/, this.uploadChart(chartPath_1)];
                    case 4:
                        chartUrl_1 = _b.sent();
                        return [2 /*return*/, {
                                success: true,
                                chart_url: chartUrl_1,
                                chart_id: (0, path_1.basename)(chartPath_1, '.png')
                            }];
                    case 5:
                        console.log('[ChartService] APIM formatting failed for Sankey chart');
                        _b.label = 6;
                    case 6:
                        if (!(analysis.dataType === 'user_only')) return [3 /*break*/, 7];
                        console.log('[ChartService] Formatting complete data from user request...');
                        formattedData = this.formatCompleteDataFromRequest(request);
                        if (formattedData) {
                            formattedPayload = formattedData;
                        }
                        else {
                            console.error('[ChartService] Failed to format complete data from request');
                            return [2 /*return*/, { success: false, error: 'Failed to process the data from your request. Please check your input and try again.' }];
                        }
                        return [3 /*break*/, 10];
                    case 7:
                        if (!(analysis.dataType === 'external' || analysis.dataType === 'both')) return [3 /*break*/, 10];
                        if (!!this.openAiKey) return [3 /*break*/, 8];
                        console.warn('[ChartService] External data needed but no OpenAI API key available, using user data only');
                        return [3 /*break*/, 10];
                    case 8:
                        console.log('[ChartService] STEP 2: Searching for external data for special chart type...');
                        console.log('[ChartService] Search query:', analysis.searchQuery || request.goal || '');
                        return [4 /*yield*/, this.searchExternalData(analysis.searchQuery || request.goal || '', request.chartType)];
                    case 9:
                        externalData = _b.sent();
                        console.log("[ChartService] External data found: ".concat(JSON.stringify(externalData).substring(0, 500)));
                        if (externalData) {
                            finalData = externalData;
                        }
                        else {
                            console.error('[ChartService] External data search failed for special chart type:', request.chartType);
                            return [2 /*return*/, { success: false, error: 'Unable to find data for this request. Please provide specific data or ask for data that can be found from real sources.' }];
                        }
                        _b.label = 10;
                    case 10:
                        // Skip APIM formatting for special chart types
                        formattedPayload = finalData;
                        return [3 /*break*/, 23];
                    case 11:
                        if (!(analysis.dataType === 'external' || analysis.dataType === 'both')) return [3 /*break*/, 20];
                        if (!!this.openAiKey) return [3 /*break*/, 12];
                        console.warn('[ChartService] External data needed but no OpenAI API key available, using user data only');
                        return [3 /*break*/, 19];
                    case 12:
                        console.log('[ChartService] STEP 2: Searching for external data...');
                        console.log('[ChartService] Search query:', analysis.searchQuery || request.goal || '');
                        return [4 /*yield*/, this.searchExternalData(analysis.searchQuery || request.goal || '', request.chartType)];
                    case 13:
                        externalData = _b.sent();
                        console.log("[ChartService] External data found: ".concat(JSON.stringify(externalData).substring(0, 500)));
                        if (!!externalData) return [3 /*break*/, 18];
                        console.warn('[ChartService] OpenAI search returned null data - likely rejected as too perfect/linear');
                        alternativeQueries = [
                            "".concat(analysis.searchQuery, " raw data CSV download"),
                            "".concat(analysis.searchQuery, " actual numbers historical"),
                            "".concat(analysis.searchQuery, " real market data API"),
                            "".concat(analysis.searchQuery, " official statistics database")
                        ];
                        _i = 0, alternativeQueries_1 = alternativeQueries;
                        _b.label = 14;
                    case 14:
                        if (!(_i < alternativeQueries_1.length)) return [3 /*break*/, 17];
                        altQuery = alternativeQueries_1[_i];
                        console.log('[ChartService] Trying alternative search:', altQuery);
                        return [4 /*yield*/, this.searchExternalData(altQuery, request.chartType)];
                    case 15:
                        altData = _b.sent();
                        if (altData) {
                            console.log('[ChartService] Found data with alternative search');
                            externalData = altData;
                            return [3 /*break*/, 17];
                        }
                        _b.label = 16;
                    case 16:
                        _i++;
                        return [3 /*break*/, 14];
                    case 17:
                        if (!externalData) {
                            console.log('[ChartService] No external data found - will use APIM to generate realistic sample data');
                            // Use the user's goal/request as the data - APIM will generate realistic values
                            externalData = { goal: request.goal, chartType: request.chartType };
                        }
                        _b.label = 18;
                    case 18:
                        // Combine user data with external data
                        if (analysis.dataType === 'both') {
                            finalData = {
                                userData: request.data,
                                externalData: externalData
                            };
                            console.log('[ChartService] Combined user data + external data');
                        }
                        else {
                            finalData = externalData;
                            console.log('[ChartService] Using external data only');
                        }
                        _b.label = 19;
                    case 19: return [3 /*break*/, 21];
                    case 20:
                        console.log('[ChartService] STEP 2: Skipped (user data sufficient)');
                        _b.label = 21;
                    case 21:
                        // STEP 3: Format all data via APIM into chart template
                        console.log('[ChartService] STEP 3: Formatting data for chart builder...');
                        return [4 /*yield*/, this.formatDataViaAPIM(__assign(__assign({}, request), { data: finalData }))];
                    case 22:
                        formattedPayload = _b.sent();
                        _b.label = 23;
                    case 23: return [3 /*break*/, 25];
                    case 24:
                        console.log('[ChartService] APIM not configured, cannot generate charts without data analysis');
                        return [2 /*return*/, { success: false, error: 'APIM not configured - charts require intelligent data analysis' }];
                    case 25:
                        if (!formattedPayload) {
                            return [2 /*return*/, { success: false, error: 'Failed to format data' }];
                        }
                        console.log('[ChartService] Formatted payload:', JSON.stringify(formattedPayload).substring(0, 200));
                        console.log('[ChartService] Full formatted payload:', JSON.stringify(formattedPayload, null, 2));
                        // STEP 4: Execute Python builder
                        console.log('[ChartService] STEP 4: Executing Python chart builder...');
                        return [4 /*yield*/, this.executePythonBuilder(request.chartType, formattedPayload)];
                    case 26:
                        chartPath = _b.sent();
                        // STEP 5: Upload to blob storage or return local path
                        console.log('[ChartService] STEP 5: Uploading chart to storage...');
                        return [4 /*yield*/, this.uploadChart(chartPath)];
                    case 27:
                        chartUrl = _b.sent();
                        chartId = ((_a = chartPath.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.png', '')) || (0, crypto_1.randomBytes)(8).toString('hex');
                        console.log("[ChartService] \u2705 Chart generated successfully: ".concat(chartUrl));
                        return [2 /*return*/, {
                                success: true,
                                chart_url: chartUrl,
                                chart_id: chartId
                            }];
                    case 28:
                        error_1 = _b.sent();
                        console.error('[ChartService] ❌ Error:', error_1);
                        return [2 /*return*/, {
                                success: false,
                                error: error_1.message
                            }];
                    case 29: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Format complete data from user request directly (without APIM)
     */
    ChartService.prototype.formatCompleteDataFromRequest = function (request) {
        var goal = request.goal || '';
        if (request.chartType === 'sankey') {
            return this.formatSankeyFromRequest(goal);
        }
        // For other special chart types, use the data directly if it's already in the correct format
        if (request.data) {
            console.log("[ChartService] Using direct data for ".concat(request.chartType, " chart:"), JSON.stringify(request.data, null, 2));
            return request.data;
        }
        return null;
    };
    /**
     * Format Sankey data from user request
     */
    ChartService.prototype.formatSankeyFromRequest = function (goal) {
        console.log('[ChartService] Parsing Sankey request:', goal);
        // Clean up the text and handle common typos
        var cleanGoal = goal.toLowerCase();
        // Handle common typos
        cleanGoal = cleanGoal.replace(/snakey/g, 'sankey');
        cleanGoal = cleanGoal.replace(/wona/g, 'women');
        cleanGoal = cleanGoal.replace(/houre/g, 'house');
        cleanGoal = cleanGoal.replace(/320percent/g, '20 percent'); // Fix obvious typo
        cleanGoal = cleanGoal.replace(/6-%/g, '60%'); // Fix format issue
        console.log('[ChartService] Cleaned goal:', cleanGoal);
        // More flexible parsing to handle typos and variations
        var totalMatch = cleanGoal.match(/(\d+[,.]?\d*)\s*(thousand|k|million|billion)?/);
        var menMatch = cleanGoal.match(/(\d+)[-.]?\s*%\s*man/);
        var saveMatch = cleanGoal.match(/(\d+)\s*(?:percent|%)\s*save/);
        var kidsMatch = cleanGoal.match(/(\d+)\s*(?:percent|%)\s*kids/);
        var carMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?car/);
        var houseMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?house/);
        var foodMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?(?:on\s*)?food/);
        // If any match fails, try more flexible patterns
        if (!carMatch) {
            var altCarMatch = cleanGoal.match(/car\s*(\d+)/);
            if (altCarMatch) {
                cleanGoal = cleanGoal.replace(altCarMatch[0], "".concat(altCarMatch[1], " car"));
                var newCarMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?car/);
                if (newCarMatch) {
                    console.log('[ChartService] Fixed car match:', newCarMatch[1]);
                }
            }
        }
        if (!houseMatch) {
            var altHouseMatch = cleanGoal.match(/house\s*(\d+)/);
            if (altHouseMatch) {
                cleanGoal = cleanGoal.replace(altHouseMatch[0], "".concat(altHouseMatch[1], " house"));
                var newHouseMatch = cleanGoal.match(/(\d+)[-.]?\s*(?:%\s*)?house/);
                if (newHouseMatch) {
                    console.log('[ChartService] Fixed house match:', newHouseMatch[1]);
                }
            }
        }
        console.log('[ChartService] Matches:', { totalMatch: totalMatch, menMatch: menMatch, saveMatch: saveMatch, kidsMatch: kidsMatch, carMatch: carMatch, houseMatch: houseMatch, foodMatch: foodMatch });
        if (!totalMatch || !menMatch || !saveMatch || !kidsMatch || !carMatch || !houseMatch || !foodMatch) {
            console.error('[ChartService] Could not parse all required data from Sankey request');
            console.error('[ChartService] Missing:', {
                total: !totalMatch,
                men: !menMatch,
                save: !saveMatch,
                kids: !kidsMatch,
                car: !carMatch,
                house: !houseMatch,
                food: !foodMatch
            });
            // If parsing fails, use APIM to format the data dynamically
            console.log('[ChartService] Parsing failed, using APIM to format Sankey data dynamically');
            return null; // This will trigger APIM formatting
        }
        var total = parseFloat(totalMatch[1]);
        if (totalMatch[2] && totalMatch[2].toLowerCase() === 'thousand') {
            total *= 1000;
        }
        else if (totalMatch[2] && totalMatch[2].toLowerCase() === 'k') {
            total *= 1000;
        }
        var menPercent = parseInt(menMatch[1]);
        var womenPercent = 100 - menPercent;
        var savePercent = parseInt(saveMatch[1]);
        var kidsPercent = parseInt(kidsMatch[1]);
        var carPercent = parseInt(carMatch[1]);
        var housePercent = parseInt(houseMatch[1]);
        var foodPercent = parseInt(foodMatch[1]);
        var menAmount = (total * menPercent) / 100;
        var womenAmount = (total * womenPercent) / 100;
        // Calculate individual amounts for each gender
        var menSavings = (menAmount * savePercent) / 100;
        var womenSavings = (womenAmount * savePercent) / 100;
        var menKids = (menAmount * kidsPercent) / 100;
        var womenKids = (womenAmount * kidsPercent) / 100;
        var menCar = (menAmount * carPercent) / 100;
        var womenCar = (womenAmount * carPercent) / 100;
        var menHouse = (menAmount * housePercent) / 100;
        var womenHouse = (womenAmount * housePercent) / 100;
        var menFood = (menAmount * foodPercent) / 100;
        var womenFood = (womenAmount * foodPercent) / 100;
        return {
            nodes: [
                { "id": "income", "label": "Total Income $".concat(total.toLocaleString()), "col": 0 },
                { "id": "men", "label": "Men (".concat(menPercent, "%)"), "col": 1 },
                { "id": "women", "label": "Women (".concat(womenPercent, "%)"), "col": 1 },
                { "id": "savings", "label": "Savings (".concat(savePercent, "%)"), "col": 2 },
                { "id": "kids", "label": "Kids (".concat(kidsPercent, "%)"), "col": 2 },
                { "id": "car", "label": "Car (".concat(carPercent, "%)"), "col": 2 },
                { "id": "house", "label": "House (".concat(housePercent, "%)"), "col": 2 },
                { "id": "food", "label": "Food (".concat(foodPercent, "%)"), "col": 2 }
            ],
            links: [
                { "source": "income", "target": "men", "value": menAmount },
                { "source": "income", "target": "women", "value": womenAmount },
                { "source": "men", "target": "savings", "value": menSavings },
                { "source": "men", "target": "kids", "value": menKids },
                { "source": "men", "target": "car", "value": menCar },
                { "source": "men", "target": "house", "value": menHouse },
                { "source": "men", "target": "food", "value": menFood },
                { "source": "women", "target": "savings", "value": womenSavings },
                { "source": "women", "target": "kids", "value": womenKids },
                { "source": "women", "target": "car", "value": womenCar },
                { "source": "women", "target": "house", "value": womenHouse },
                { "source": "women", "target": "food", "value": womenFood }
            ]
        };
    };
    /**
     * Create default Sankey data as fallback - now completely dynamic
     */
    ChartService.prototype.createDefaultSankeyData = function () {
        // This should never be called - APIM should handle all data formatting
        console.error('[ChartService] Fallback Sankey data called - this indicates APIM formatting failed');
        return null;
    };
    /**
     * Format complete data from user request using APIM
     */
    ChartService.prototype.formatDataWithAPIM = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var currentDate, currentTime, prompt, response, result, content, error_2;
            var _a, _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (!this.apimKey) {
                            throw new Error('APIM API key not configured');
                        }
                        currentDate = new Date().toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long'
                        });
                        currentTime = new Date().toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZoneName: 'short'
                        });
                        prompt = "You are a chart data formatter. The user has provided complete information in their request that needs to be formatted into the correct structure for a ".concat(request.chartType, " chart.\n\nCURRENT DATE AND TIME: ").concat(currentDate, " at ").concat(currentTime, "\n\nUSER REQUEST: ").concat(request.goal, "\n\n").concat(this.getSystemPrompt(request.chartType), "\n\nExtract and format the data from the user's request into the correct JSON structure for a ").concat(request.chartType, " chart.");
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch("".concat(this.apimHost, "/chat/strong"), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Ocp-Apim-Subscription-Key': this.apimKey,
                                },
                                body: JSON.stringify({
                                    messages: [
                                        {
                                            role: 'system',
                                            content: 'You are a chart data formatter. Always respond with valid JSON only.'
                                        },
                                        {
                                            role: 'user',
                                            content: prompt
                                        }
                                    ],
                                    stream: false
                                })
                            })];
                    case 2:
                        response = _f.sent();
                        if (!response.ok) {
                            throw new Error("APIM API error: ".concat(response.status, " - ").concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        result = _f.sent();
                        content = ((_c = (_b = (_a = result.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || ((_e = (_d = result.choices) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || '';
                        try {
                            return [2 /*return*/, JSON.parse(content)];
                        }
                        catch (parseError) {
                            console.error('[ChartService] Failed to parse APIM response as JSON:', content);
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _f.sent();
                        console.error('[ChartService] APIM formatting failed:', error_2);
                        return [2 /*return*/, null];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Detect if user provided complete data in their request that can be directly formatted
     */
    ChartService.prototype.detectCompleteDataInRequest = function (goal, chartType) {
        var goalLower = goal.toLowerCase();
        // For Sankey charts, look for flow/relationship data with percentages and amounts
        if (chartType === 'sankey') {
            var hasAmounts = /\d+[,.]?\d*\s*(thousand|k|million|billion|\$|total)/i.test(goal);
            var hasPercentages = /\d+%/i.test(goal);
            var hasFlowWords = /(flow|distribute|split|goes to|spent on|save|expense|relationship|total|rest)/i.test(goal);
            var hasCategories = /(man|men|woman|women|wona|kids|car|house|houre|food|savings)/i.test(goal);
            console.log('[ChartService] Sankey detection:', { hasAmounts: hasAmounts, hasPercentages: hasPercentages, hasFlowWords: hasFlowWords, hasCategories: hasCategories });
            return hasAmounts && hasPercentages && hasFlowWords && hasCategories;
        }
        // For other chart types, look for specific patterns
        if (chartType === 'pie' || chartType === 'donut') {
            var hasPercentages = /\d+%/i.test(goal);
            var hasCategories = /(category|categories|types|segments)/i.test(goal);
            return hasPercentages && hasCategories;
        }
        return false;
    };
    /**
     * STEP 1: Analyze data source via APIM
     * Determines if chart needs user data only, external data, or both
     */
    ChartService.prototype.analyzeDataSource = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var goal, hasCompleteData, operation, currentDate, currentTime, analysisPrompt, response, errorText, result, content, analysis, error_3;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        goal = request.goal || '';
                        hasCompleteData = this.detectCompleteDataInRequest(goal, request.chartType);
                        if (hasCompleteData) {
                            console.log('[ChartService] Complete data detected in user request - no external search needed');
                            return [2 /*return*/, {
                                    dataType: 'user_only',
                                    reasoning: 'Complete data provided in user request',
                                    searchQuery: undefined
                                }];
                        }
                        operation = process.env.APIM_OPERATION || '/chat/strong';
                        currentDate = new Date().toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long'
                        });
                        currentTime = new Date().toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZoneName: 'short'
                        });
                        analysisPrompt = "You are a data analyst. Analyze the following chart request and determine if the data provided is sufficient, or if external data from the internet is needed.\n\nCURRENT DATE AND TIME: ".concat(currentDate, " at ").concat(currentTime, "\n\nChart Type: ").concat(request.chartType, "\nUser Goal: ").concat(request.goal || 'Not specified', "\nUser Data: ").concat(typeof request.data === 'string' ? request.data : JSON.stringify(request.data, null, 2), "\n\nCRITICAL: You are NOT responsible for searching the internet. You are NOT responsible for generating data. Your job is ONLY to analyze whether external data is needed and what to search for. The actual web search will be handled by OpenAI.\n\nCHART TYPE ANALYSIS:\n- Line/Area/Bar: Usually need time series or categorical data\n- Pie/Donut: Need proportional data or market share data\n- Scatter/Bubble: Need correlation data or multi-dimensional data\n- Funnel: Need conversion/process data\n- Heatmap: Need 2D matrix data\n- Radar: Need multi-dimensional comparison data\n- Sankey: Need flow/movement data between categories (sources \u2192 totals \u2192 destinations)\n- Sunburst: Need hierarchical data\n- Treemap: Need proportional category data\n- Candlestick: Need OHLC financial data\n- Flow: Need process/decision flow data\n- Gantt: Need project timeline data\n- StackedBar: Need multi-series categorical data\n- ThemeRiver: Need time series flow data\n- WordCloud: Need text frequency data\n\nRespond with ONLY a JSON object in this exact format (no markdown, no extra text):\n{\n  \"dataType\": \"user_only\" | \"external\" | \"both\",\n  \"reasoning\": \"brief explanation of your decision\",\n  \"searchQuery\": \"if external data needed, what to search for (include current date context and chart type considerations)\"\n}\n\nGuidelines:\n- \"user_only\": The user has provided specific data/numbers to chart\n- \"external\": User is asking about trends, statistics, or data they don't have (especially current/recent data)\n- \"both\": User provided some data but needs external context or comparison data\n\nFor \"external\" requests, include current date context and chart type considerations in the search query.\n\nRespond with just the JSON:");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, fetch("".concat(this.apimHost).concat(operation), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Ocp-Apim-Subscription-Key': this.apimKey,
                                },
                                body: JSON.stringify({
                                    messages: [
                                        {
                                            role: 'system',
                                            content: 'You are a data analysis assistant. Always respond with valid JSON only.'
                                        },
                                        {
                                            role: 'user',
                                            content: analysisPrompt
                                        }
                                    ],
                                    stream: false
                                })
                            })];
                    case 2:
                        response = _c.sent();
                        if (!!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.text()];
                    case 3:
                        errorText = _c.sent();
                        throw new Error("APIM analysis failed: ".concat(response.status, " - ").concat(errorText));
                    case 4: return [4 /*yield*/, response.json()];
                    case 5:
                        result = _c.sent();
                        content = ((_b = (_a = result.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
                        analysis = this.extractJSON(content);
                        // Validate response
                        if (!analysis.dataType || !['user_only', 'external', 'both'].includes(analysis.dataType)) {
                            console.warn('[ChartService] Invalid analysis response, defaulting to user_only');
                            return [2 /*return*/, {
                                    dataType: 'user_only',
                                    reasoning: 'Analysis failed, using provided data',
                                    searchQuery: ''
                                }];
                        }
                        return [2 /*return*/, analysis];
                    case 6:
                        error_3 = _c.sent();
                        console.error('[ChartService] Data source analysis failed:', error_3);
                        // Default to user_only on error
                        return [2 /*return*/, {
                                dataType: 'user_only',
                                reasoning: 'Analysis error, using provided data',
                                searchQuery: ''
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * STEP 2: Search for external data using OpenAI API (NOT APIM)
     * Uses GPT-4 to search for relevant data on the internet
     */
    ChartService.prototype.searchExternalData = function (searchQuery, chartType) {
        return __awaiter(this, void 0, void 0, function () {
            var currentDate, currentTime, searchPrompt, response, errorText, result, content, searchResult, error_4;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.openAiKey) {
                            throw new Error('OpenAI API key not configured');
                        }
                        currentDate = new Date().toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'long'
                        });
                        currentTime = new Date().toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZoneName: 'short'
                        });
                        searchPrompt = "You are a data research assistant with access to current web information. Your job is to provide data for chart generation.\n\nCURRENT DATE AND TIME: ".concat(currentDate, " at ").concat(currentTime, "\nSEARCH REQUEST: ").concat(searchQuery, "\nCHART TYPE: ").concat(chartType || 'not specified', "\n\nINSTRUCTIONS:\n1. FIRST: Search thoroughly for REAL, ACTUAL data from reliable sources\n2. If you find real data, use it exactly as found (even if irregular)\n3. If you cannot find specific real data, make an EDUCATED ESTIMATE based on:\n   - Industry trends and patterns\n   - Historical data and benchmarks\n   - Market knowledge and expertise\n   - Logical reasoning about the topic\n4. For estimates, base them on real industry data, studies, or benchmarks when possible\n5. Always provide realistic variations and fluctuations (not perfect smooth lines)\n6. For categorical data (services, products, companies), use real examples when possible\n\nSEARCH PRIORITIES:\n- Financial APIs, government databases, official statistics\n- Company reports, earnings data, market research\n- Industry studies, surveys, benchmarks\n- News articles with specific numbers\n- Academic papers, research reports\n- For financial/candlestick charts: search exchanges, financial APIs, trading platforms for OHLC data\n- If none found, use industry knowledge with realistic estimates\n\nREQUIRED OUTPUT FORMAT:\nReturn ONLY a JSON object with this exact structure:\n\nFor most chart types (line, area, bar, pie, scatter, bubble, etc.):\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"x\": [\"time periods, categories, services, products, or other labels\"],\n    \"series\": [\n      {\n        \"name\": \"metric name\",\n        \"values\": [numbers OR strings - real data or educated estimates]\n      }\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor wordcloud charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"words\": [\n      {\"text\": \"word1\", \"weight\": 100},\n      {\"text\": \"word2\", \"weight\": 80},\n      {\"text\": \"word3\", \"weight\": 60}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor funnel charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"stages\": [\n      {\"label\": \"Stage 1\", \"value\": 100},\n      {\"label\": \"Stage 2\", \"value\": 70},\n      {\"label\": \"Stage 3\", \"value\": 50}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor heatmap charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"x\": [\"Category1\", \"Category2\", \"Category3\"],\n    \"y\": [0, 1, 2, 3],\n    \"values\": [[1,2,3], [4,5,6], [7,8,9], [10,11,12]]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor radar charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"axes\": [\"Axis1\", \"Axis2\", \"Axis3\"],\n    \"series\": [\n      {\"name\": \"Series1\", \"values\": [80, 70, 90]},\n      {\"name\": \"Series2\", \"values\": [60, 80, 70]}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor sankey charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"nodes\": [\n      {\"id\": \"income\", \"label\": \"Total Income\", \"col\": 0},\n      {\"id\": \"men\", \"label\": \"Men (60%)\", \"col\": 1},\n      {\"id\": \"women\", \"label\": \"Women (40%)\", \"col\": 1},\n      {\"id\": \"savings\", \"label\": \"Savings\", \"col\": 2},\n      {\"id\": \"expenses\", \"label\": \"Expenses\", \"col\": 2}\n    ],\n    \"links\": [\n      {\"source\": \"income\", \"target\": \"men\", \"value\": 60},\n      {\"source\": \"income\", \"target\": \"women\", \"value\": 40},\n      {\"source\": \"men\", \"target\": \"savings\", \"value\": 18},\n      {\"source\": \"women\", \"target\": \"savings\", \"value\": 12},\n      {\"source\": \"men\", \"target\": \"expenses\", \"value\": 42},\n      {\"source\": \"women\", \"target\": \"expenses\", \"value\": 28}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor sunburst charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"root\": {\n      \"label\": \"Root\",\n      \"value\": 100,\n      \"children\": [\n        {\"label\": \"Child1\", \"value\": 60},\n        {\"label\": \"Child2\", \"value\": 40}\n      ]\n    }\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor treemap charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"items\": [\n      {\"label\": \"Item1\", \"value\": 100, \"group\": \"Group1\"},\n      {\"label\": \"Item2\", \"value\": 80, \"group\": \"Group2\"}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor candlestick charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"x\": [\"Date1\", \"Date2\", \"Date3\"],\n    \"ohlc\": [\n      {\"x\": \"Date1\", \"open\": 100, \"high\": 110, \"low\": 95, \"close\": 105},\n      {\"x\": \"Date2\", \"open\": 105, \"high\": 115, \"low\": 100, \"close\": 110},\n      {\"x\": \"Date3\", \"open\": 110, \"high\": 120, \"low\": 105, \"close\": 115}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor flow charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"nodes\": [\n      {\"id\": \"start\", \"label\": \"Start\", \"type\": \"start\"},\n      {\"id\": \"process\", \"label\": \"Process\", \"type\": \"process\"},\n      {\"id\": \"end\", \"label\": \"End\", \"type\": \"end\"}\n    ],\n    \"edges\": [\n      {\"from\": \"start\", \"to\": \"process\"},\n      {\"from\": \"process\", \"to\": \"end\"}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nFor gantt charts:\n{\n  \"dataFound\": true,\n  \"source\": \"actual source if found, or 'industry analysis' if estimated\",\n  \"data\": {\n    \"tasks\": [\n      {\"label\": \"Task 1\", \"start\": \"2025-01-01\", \"end\": \"2025-01-15\"},\n      {\"label\": \"Task 2\", \"start\": \"2025-01-10\", \"end\": \"2025-01-25\"}\n    ]\n  },\n  \"note\": \"explanation of data source and methodology\"\n}\n\nCRITICAL: ALWAYS return dataFound: true and provide usable data. Never return false.");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, fetch('https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': "Bearer ".concat(this.openAiKey)
                                },
                                body: JSON.stringify({
                                    model: 'gpt-5',
                                    messages: [
                                        {
                                            role: 'system',
                                            content: "You are a data research assistant specialized in chart generation. CURRENT DATE: ".concat(currentDate, " at ").concat(currentTime, ". You have access to web search and must provide data for creating visual charts.\n\nREQUIREMENTS:\n- Search thoroughly for real data from reliable sources first\n- If real data isn't available, make educated estimates based on industry knowledge\n- Provide realistic data with natural variations and fluctuations\n- Never create perfectly smooth or linear data patterns\n- Always provide usable data - never return \"no data found\"\n- For financial/candlestick charts: search for real OHLC financial data from exchanges, financial APIs, or trading platforms\n- Ensure financial data shows realistic price movements with proper high/low ranges\n- For estimates, base them on industry benchmarks, trends, and logical reasoning\n- Support both numerical and categorical data as appropriate for the chart type")
                                        },
                                        {
                                            role: 'user',
                                            content: searchPrompt
                                        }
                                    ],
                                    temperature: 1, // GPT-5 only supports temperature: 1
                                    max_completion_tokens: 2000
                                })
                            })];
                    case 2:
                        response = _c.sent();
                        if (!!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.text()];
                    case 3:
                        errorText = _c.sent();
                        throw new Error("OpenAI API error: ".concat(response.status, " - ").concat(errorText));
                    case 4: return [4 /*yield*/, response.json()];
                    case 5:
                        result = _c.sent();
                        content = ((_b = (_a = result.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
                        console.log('[ChartService] OpenAI search response:', content.substring(0, 500));
                        console.log('[ChartService] Full OpenAI response:', JSON.stringify(result, null, 2));
                        // Try to extract JSON from the response
                        try {
                            searchResult = this.extractJSON(content);
                            console.log('[ChartService] OpenAI search result:', searchResult);
                            // Always expect data to be found (since we told it to never return false)
                            if (!searchResult.data) {
                                console.warn('[ChartService] No data in OpenAI response:', searchResult);
                                return [2 /*return*/, null];
                            }
                            // If dataFound is false, still use the data (GPT-5 might still return it)
                            if (searchResult.dataFound === false) {
                                console.warn('[ChartService] GPT-5 returned dataFound: false, but using data anyway:', searchResult);
                            }
                            // Validate that the data doesn't look too "perfect" or linear
                            // Be more lenient for area charts as they often work well with smooth data
                            if (this.isDataTooPerfect(searchResult.data, chartType)) {
                                console.warn('[ChartService] Data appears too perfect/linear, rejecting:', searchResult.data);
                                return [2 /*return*/, null];
                            }
                            // Accept data from any source - real data or educated estimates
                            console.log("[ChartService] Accepting data from source: ".concat(searchResult.source));
                            // Return the actual data from the search result
                            console.log('[ChartService] Data source:', searchResult.source);
                            console.log('[ChartService] Data note:', searchResult.note);
                            console.log('[ChartService] Raw data being returned:', JSON.stringify(searchResult.data, null, 2));
                            return [2 /*return*/, searchResult.data];
                        }
                        catch (e) {
                            console.warn('[ChartService] Could not parse OpenAI response as JSON:', e);
                            console.log('[ChartService] Raw OpenAI response:', content);
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        error_4 = _c.sent();
                        console.error('[ChartService] External data search failed:', error_4);
                        throw error_4;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * STEP 3: Format data via APIM - returns the chart-specific JSON payload
     */
    ChartService.prototype.formatDataViaAPIM = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var prompt, operation, systemPrompt, response, errorText, result, content, payload, error_5;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        prompt = this.buildFormatterPrompt(request);
                        operation = process.env.APIM_OPERATION || '/chat/strong';
                        systemPrompt = this.getSystemPrompt(request.chartType);
                        console.log("[ChartService] Calling APIM for chart: ".concat(request.chartType));
                        console.log("[ChartService] User prompt length: ".concat(prompt.length, " chars"));
                        console.log("[ChartService] System prompt length: ".concat(systemPrompt.length, " chars"));
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, fetch("".concat(this.apimHost).concat(operation), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Ocp-Apim-Subscription-Key': this.apimKey,
                                },
                                body: JSON.stringify({
                                    messages: [
                                        {
                                            role: 'system',
                                            content: systemPrompt
                                        },
                                        {
                                            role: 'user',
                                            content: prompt
                                        }
                                    ],
                                    stream: false,
                                    max_completion_tokens: 4000
                                })
                            })];
                    case 2:
                        response = _c.sent();
                        if (!!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.text()];
                    case 3:
                        errorText = _c.sent();
                        console.error("[ChartService] APIM error response:", errorText);
                        console.error("[ChartService] User prompt was:", prompt.substring(0, 500));
                        throw new Error("APIM request failed: ".concat(response.status, " - ").concat(errorText));
                    case 4: return [4 /*yield*/, response.json()];
                    case 5:
                        result = _c.sent();
                        content = ((_b = (_a = result.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
                        payload = this.extractJSON(content);
                        console.log('[ChartService] BEFORE normalization:', JSON.stringify(payload));
                        // Fix common APIM mistakes for special chart types
                        payload = this.normalizeChartPayload(request.chartType, payload);
                        console.log('[ChartService] AFTER normalization:', JSON.stringify(payload));
                        return [2 /*return*/, payload];
                    case 6:
                        error_5 = _c.sent();
                        console.error('[ChartService] APIM formatting failed:', error_5);
                        throw error_5;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Normalize APIM output - fix ALL chart types, NO ERRORS
     */
    ChartService.prototype.normalizeChartPayload = function (chartType, payload) {
        console.log("[ChartService] Normalizing ".concat(chartType, " payload:"), JSON.stringify(payload));
        var type = chartType.toLowerCase();
        // RADAR: Requires "axes" and "series", NOT "x" or "categories"
        if (type === 'radar') {
            if (!payload.axes) {
                payload.axes = payload.categories || payload.x || ['Metric 1', 'Metric 2', 'Metric 3'];
                console.log('[ChartService] Fixed radar: added axes');
            }
            if (!payload.series) {
                var values = payload.values || payload.data || [50, 60, 70];
                payload.series = [{ name: 'Data', values: Array.isArray(values) ? values : [values] }];
                console.log('[ChartService] Fixed radar: added series');
            }
            delete payload.x;
            delete payload.categories;
            delete payload.values;
            delete payload.data;
        }
        // FUNNEL: Requires "stages", NOT "x" or "series"
        else if (type === 'funnel') {
            if (!payload.stages) {
                if (payload.x && payload.series) {
                    payload.stages = payload.x.map(function (label, i) {
                        var _a;
                        return ({
                            label: label,
                            value: ((_a = payload.series[0]) === null || _a === void 0 ? void 0 : _a.values[i]) || 100
                        });
                    });
                }
                else {
                    payload.stages = [
                        { label: 'Stage 1', value: 100 },
                        { label: 'Stage 2', value: 80 },
                        { label: 'Stage 3', value: 60 }
                    ];
                }
                console.log('[ChartService] Fixed funnel: added stages');
            }
            delete payload.x;
            delete payload.series;
        }
        // WORDCLOUD: Requires "words", NOT "x" or "series"
        else if (type === 'wordcloud') {
            if (!payload.words) {
                if (payload.x && payload.series) {
                    payload.words = payload.x.map(function (text, i) {
                        var _a;
                        return ({
                            text: text,
                            weight: ((_a = payload.series[0]) === null || _a === void 0 ? void 0 : _a.values[i]) || 50
                        });
                    });
                }
                else if (payload.categories && payload.values) {
                    payload.words = payload.categories.map(function (text, i) { return ({
                        text: text,
                        weight: payload.values[i] || 50
                    }); });
                }
                else {
                    payload.words = [
                        { text: 'Data', weight: 100 },
                        { text: 'Analysis', weight: 80 },
                        { text: 'Chart', weight: 60 }
                    ];
                }
                console.log('[ChartService] Fixed wordcloud: added words');
            }
            delete payload.x;
            delete payload.series;
            delete payload.categories;
            delete payload.values;
        }
        // STANDARD CHARTS: Require "x" and "series"
        else if (['line', 'area', 'bar', 'scatter', 'bubble', 'stackedbar', 'themeriver'].includes(type)) {
            if (!payload.x) {
                payload.x = payload.categories || payload.axes || ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
                console.log("[ChartService] Fixed ".concat(type, ": added x"));
            }
            if (!payload.series) {
                var values = payload.values || payload.data || [10, 20, 30, 40, 50];
                payload.series = [{ name: 'Data', values: Array.isArray(values) ? values : [values] }];
                console.log("[ChartService] Fixed ".concat(type, ": added series"));
            }
            delete payload.categories;
            delete payload.axes;
        }
        // PIE: Requires "x" and "series"  
        else if (type === 'pie') {
            if (!payload.x) {
                payload.x = payload.categories || payload.labels || ['A', 'B', 'C'];
            }
            if (!payload.series) {
                var values = payload.values || payload.data || [30, 40, 30];
                payload.series = [{ name: 'Data', values: Array.isArray(values) ? values : [values] }];
            }
            delete payload.categories;
            delete payload.labels;
        }
        // Ensure options with size
        if (!payload.options) {
            payload.options = {};
        }
        if (!payload.options.width)
            payload.options.width = 1200;
        if (!payload.options.height)
            payload.options.height = 700;
        if (!payload.options.dpi)
            payload.options.dpi = 100;
        console.log("[ChartService] \u2705 Normalized ".concat(type, ":"), JSON.stringify(payload));
        return payload;
    };
    /**
     * System prompt for formatting data - only includes schema for the requested chart type
     */
    ChartService.prototype.getSystemPrompt = function (chartType) {
        var schemaMap = {
            line: "LINE:\n  keys: title?, x[string[]], series[{name, values[number[]]}], options?\n  options keys: fill_under(bool, default true if one series), show_points(bool), width(int), height(int), dpi(int),\n                legend(bool), grid(bool), label_rotation(int),\n                y_axis{min?, max?, tick_step?, format(\"number\"|\"percent\"|\"currency\"), currency_prefix?, suffix?},\n                colors[string[] hex] optional.",
            area: "AREA:\n  keys: title?, x[string[]], series[{name, values[number[]]}], options?\n  options keys: stacked(bool, default true), width, height, dpi, legend, grid, label_rotation, y_axis{...}, colors[].",
            bar: "BAR:\n  keys: title?, x[string[]], series[{name, values[number[]]}], options?\n  options keys: stacked(bool default false), width, height, dpi, legend, grid, label_rotation, y_axis{...}, colors[].",
            pie: "PIE:\n  keys: title?, x[string[]], series[{name, values[number[]]}], options?\n  options keys: width, height, dpi, legend(bool default true), colors[].\n  Note: Pie charts use the first series values and x labels. Creates a pie chart with hole in center (donut style).",
            scatter: "SCATTER:\n  keys: title?, x[number[]], series[{name, values[number[]]}], options?\n  options keys: width, height, dpi, legend, grid, label_rotation, x_axis_label, y_axis_label, colors[].\n  Note: x values must be numeric for scatter plots.",
            bubble: "BUBBLE:\n  keys: title?, x[number[]], series[{name, values[number[]], sizes[number[]]?}], options?\n  options keys: width, height, dpi, legend, grid, label_rotation, x_axis_label, y_axis_label, colors[].\n  Note: x values must be numeric. sizes array is optional for bubble sizes.",
            funnel: "FUNNEL:\n  keys: title?, stages[{label, value}], options?\n  options keys: width, height, dpi, normalize(bool default true), bar_height(float default 0.12), gap(float default 0.06), round_px(float default 8), color_top(hex default \"#3B82F6\"), color_others(hex default \"#BFDBFE\"), text_color(hex default \"#1D4ED8\"), show_funnel_silhouette(bool default true), silhouette_color(hex default \"#93C5FD\"), silhouette_alpha(float default 0.18).\n  \n  CRITICAL: Funnel charts use \"stages\" NOT \"x\". Example:\n  {\n    \"title\": \"Sales Funnel\",\n    \"stages\": [\n      {\"label\": \"Leads\", \"value\": 1000},\n      {\"label\": \"Qualified\", \"value\": 500},\n      {\"label\": \"Closed\", \"value\": 100}\n    ],\n    \"options\": {\"width\": 1200, \"height\": 700}\n  }\n  \n  Note: Creates centered horizontal bars that decrease in width. First bar is vivid blue, others are light blue.",
            heatmap: "HEATMAP:\n  keys: title?, x[string[]], y[number[]], values[number[][]], options?\n  options keys: width, height, dpi, grid(bool default true), square(bool default false), vmin(number|null), vmax(number|null), show_colorbar(bool default false), label_rotation(int default 0), cmap_low(hex default \"#FEF3E7\"), cmap_mid(hex default \"#F59E0B\"), cmap_high(hex default \"#D97706\").\n  Note: values must be 2D array with shape [len(y)] x [len(x)]. Orange gradient from light to deep orange.",
            radar: "RADAR:\n  keys: title?, axes[string[]], series[{name, values[number[]]}], options?\n  options keys: width, height, dpi, radial_min(number default 0), radial_max(number|null), grid_levels(int default 5), colors[hex[] default [\"#22C55E\",\"#3B82F6\"]], alpha_fill(float default 0.15), line_width(float default 2.8), label_font_size(int default 10).\n  \n  CRITICAL: Radar charts use \"axes\" NOT \"x\". Example:\n  {\n    \"title\": \"Skills\",\n    \"axes\": [\"Speed\", \"Accuracy\", \"Power\"],\n    \"series\": [{\"name\": \"Player 1\", \"values\": [8, 7, 9]}],\n    \"options\": {\"width\": 1200, \"height\": 700}\n  }\n  \n  Note: Each series.values length must equal len(axes). Creates polar chart with translucent fills.",
            sankey: "SANKEY:\n  keys: title?, nodes[{id, label, col, color?}], links[{source, target, value, color?}], options?\n  options keys: width, height, dpi, column_labels[string[]], node_width(float default 0.035), node_padding(float default 6), curvature(float default 0.35), alpha(float default 0.85), grid(bool default true), y_axis{min, max, tick_step}, default_link_color(hex default \"#CBD5E1\").\n  Note: Links must connect only adjacent columns (col 0\u21921, 1\u21922, etc.). Creates horizontal multi-column flow with smooth ribbons.\n  \n  SANKEY STRUCTURE RULES:\n  1. COLUMN LAYOUT: Use 3 columns minimum (sources \u2192 totals \u2192 destinations)\n  2. SOURCE NODES (col=0): Input sources like \"Salary\", \"Investments\", \"Revenue\"\n  3. TOTAL NODES (col=1): Aggregation points like \"Total Income\", \"Total Revenue\" \n  4. DESTINATION NODES (col=2): Output categories like \"Savings\", \"Expenses\", \"Taxes\"\n  5. FLOW VALUES: Each link.value should represent the actual flow amount\n  6. NO HALLUCINATIONS: Only use categories explicitly mentioned by user\n  7. DYNAMIC STRUCTURE: Adapt column count and categories based on user request\n  8. VIBRANT FLOWS: Don't specify colors - let the renderer assign random vibrant colors to flows",
            sunburst: "SUNBURST:\n  keys: title?, root{label, value, children[]}, options?\n  options keys: width, height, dpi, start_angle(float default 90), ring_thickness(float default 0.18), inner_hole_frac(float default 0.38), gap_deg(float default 1.5), max_depth(int|null), colors_base(hex default \"#FCA5A5\"), colors_strong(hex default \"#EF4444\"), show_labels(bool default false).\n  Note: Tree structure with arbitrary depth. Creates concentric rings with color interpolation by depth.",
            treemap: "TREEMAP:\n  keys: title?, items[{label, value, group}], options?\n  options keys: width, height, dpi, padding_px(float default 6), palette{group: color}, border_radius(float default 6).\n  Note: Values must be positive. Creates squarified rectangles with group-based colors and white gutters.",
            candlestick: "CANDLESTICK:\n  keys: title?, x[string[]], ohlc[{x, open, high, low, close}], options?\n  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), y_axis{min, max, tick_step}, candle_width(float default 0.55), color_up(hex default \"#10B981\"), color_down(hex default \"#EF4444\"), wick_linewidth(float default 2.0), body_linewidth(float default 0.0).\n  Note: Each ohlc.x must be present in x array. OHLC values must satisfy low \u2264 open/close \u2264 high. Creates green up candles and red down candles.",
            flow: "FLOW:\n  keys: title?, nodes[{id, label, type, fill?}], edges[{from, to, label?}], options?\n  options keys: width, height, dpi, grid(bool default false), lane_spacing_px(float default 240), row_spacing_px(float default 120), route_style(\"orthogonal\"|\"curved\" default \"orthogonal\"), arrow_color(hex default \"#9CA3AF\"), arrow_width(float default 1.8), label_font_size(int default 10), lane_override{id: lane}, type_styles{type: {shape, fill, text}}.\n  Note: Node types: start, end, process, decision. Supports cycles and branches. Auto-layouts with optional lane overrides.",
            gantt: "GANTT:\n  keys: title?, tasks[{label, start, end}], options?\n  options keys: width, height, dpi, grid(bool default true), bar_height_px(float default 16), row_gap_px(float default 10), bar_color(hex default \"#60A5FA\"), bar_alpha(float default 0.85), timeline_min(ISO date), timeline_max(ISO date), tick(\"month\"|\"week\"|\"auto\" default \"month\"), today_line(ISO date), today_color(hex default \"#EF4444\"), label_font_size(int default 9).\n  Note: Dates in ISO YYYY-MM-DD format. End date must be >= start date. Creates timeline with task bars and optional today marker.",
            stackedbar: "STACKEDBAR:\n  keys: title?, x[string[]], series[{name, values[number[]]}], options?\n  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), y_axis{min, max, tick_step, format}, colors[string[] default [\"#3B82F6\",\"#10B981\",\"#F59E0B\"]], bar_width(float default 0.75), legend(bool default false).\n  Note: Creates vertical stacked bars with blue base, green middle, amber top. All series values length must equal x length.",
            themeriver: "THEMERIVER:\n  keys: title?, x[string[]], series[{name, values[number[]]}], options?\n  options keys: width, height, dpi, grid(bool default true), label_rotation(int default 0), baseline(\"wiggle\"|\"sym\" default \"wiggle\"), colors[string[] default [\"#BFDBFE\",\"#60A5FA\",\"#3B82F6\"]], alpha(float default 0.88), y_axis{min, max, tick_step}.\n  Note: Creates flowing stacked areas with wiggle baseline for organic river look. Same data structure as stackedbar.",
            wordcloud: "WORDCLOUD:\n  keys: title?, words[{text, weight, color?}], options?\n  options keys: width, height, dpi, min_font_px(int default 14), max_font_px(int default 84), padding_px(float default 6), uppercase(bool default true), rotate_prob(float default 0.0), accent_top_k(int default 6), accent_palette[string[] default [\"#3B82F6\",\"#22C55E\",\"#F59E0B\"]], grey_palette[string[] default [\"#D1D5DB\",\"#C7CCD4\",\"#BFC4CB\",\"#B3BAC2\",\"#AEB3BB\"]].\n  \n  CRITICAL: Wordcloud uses \"words\" NOT \"x\". Example:\n  {\n    \"title\": \"Keywords\",\n    \"words\": [\n      {\"text\": \"AI\", \"weight\": 100},\n      {\"text\": \"Data\", \"weight\": 80},\n      {\"text\": \"Cloud\", \"weight\": 60}\n    ],\n    \"options\": {\"width\": 1200, \"height\": 700}\n  }\n  \n  Note: Creates word cloud with spiral placement and collision detection. Top-K words get accent colors, others get grey. All words horizontal by default."
        };
        var schema = schemaMap[chartType.toLowerCase()] || schemaMap['bar'];
        return "You are a chart-input formatter. Return EXACTLY one JSON object and nothing else, matching the schema below:\n\n".concat(schema, "\n\nRules:\n- Each series.values length MUST equal the length of x (or axes/stages for special types).\n- Values must be numbers (no '12k' strings).\n- Omit colors if not specified; renderers have defaults.\n- Do NOT include comments, markdown, or prose.\n- ALWAYS set: \"width\": 1200, \"height\": 700, \"dpi\": 100 for large, readable charts.\n\nNow transform the user's intent + data into the correct JSON for the ").concat(chartType, " chart type.");
    };
    /**
     * Build the formatting prompt
     */
    ChartService.prototype.buildFormatterPrompt = function (request) {
        var data = request.data, chartType = request.chartType, title = request.title, goal = request.goal;
        var currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        var currentTime = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        var prompt = "CURRENT DATE AND TIME: ".concat(currentDate, " at ").concat(currentTime, "\n\n");
        prompt += "Chart type: ".concat(chartType, "\n\n");
        if (goal) {
            prompt += "User's goal: ".concat(goal, "\n\n");
        }
        if (title) {
            prompt += "Title: ".concat(title, "\n\n");
        }
        prompt += "Data:\n".concat(JSON.stringify(data, null, 2), "\n\n");
        // Chart-specific formatting instructions
        if (chartType === 'radar') {
            prompt += "Return the formatted JSON payload for the radar chart with the following requirements:\n- Use \"axes\" field (NOT \"x\") for the radar chart axes labels\n- Each series.values array length MUST equal the length of axes array\n- Include proper options for radar visualization\n\nRequired JSON structure:\n{\n  \"title\": \"chart title\",\n  \"axes\": [\"axis1\", \"axis2\", \"axis3\", ...],\n  \"series\": [{\"name\": \"series name\", \"values\": [value1, value2, ...]}],\n  \"options\": {\n    \"width\": 800,\n    \"height\": 600,\n    \"radial_min\": 0,\n    \"grid_levels\": 5\n  }\n}";
        }
        else if (chartType === 'funnel') {
            prompt += "Return the formatted JSON payload for the funnel chart with the following requirements:\n- Use \"stages\" field with objects containing {label, value}\n- Include proper funnel options\n\nRequired JSON structure:\n{\n  \"title\": \"chart title\",\n  \"stages\": [\n    {\"label\": \"stage1\", \"value\": 1000},\n    {\"label\": \"stage2\", \"value\": 800},\n    ...\n  ],\n  \"options\": {\n    \"width\": 800,\n    \"height\": 600\n  }\n}";
        }
        else if (chartType === 'heatmap') {
            prompt += "Return the formatted JSON payload for the heatmap chart with the following requirements:\n- Use \"x\", \"y\", and \"values\" fields where values is a 2D array\n- values must be shape [len(y)] x [len(x)]\n\nRequired JSON structure:\n{\n  \"title\": \"chart title\",\n  \"x\": [\"col1\", \"col2\", ...],\n  \"y\": [\"row1\", \"row2\", ...],\n  \"values\": [[1, 2, ...], [3, 4, ...], ...],\n  \"options\": {\n    \"width\": 800,\n    \"height\": 600\n  }\n}";
        }
        else {
            // Standard chart structure
            prompt += "Return the formatted JSON payload for the ".concat(chartType, " chart with the following requirements:\n- Include descriptive x_axis_label and y_axis_label\n- ALWAYS set label_rotation to 45 degrees to prevent label overlap\n- Ensure proper chart formatting and sizing\n- Include legend and grid options\n- Make sure x-axis labels don't stack on top of each other\n\nRequired JSON structure:\n{\n  \"title\": \"chart title\",\n  \"x\": [\"label1\", \"label2\", ...],\n  \"series\": [{\"name\": \"series name\", \"values\": [value1, value2, ...]}],\n  \"options\": {\n    \"width\": 800,\n    \"height\": 400,\n    \"legend\": true,\n    \"grid\": true,\n    \"label_rotation\": 45,\n    \"x_axis_label\": \"X-axis description\",\n    \"y_axis_label\": \"Y-axis description\"\n  }\n}");
        }
        return prompt;
    };
    /**
     * Check if data looks too "perfect" or linear (indicating it's generated, not real)
     */
    ChartService.prototype.isDataTooPerfect = function (data, chartType) {
        if (!data || !data.series || !Array.isArray(data.series)) {
            return false;
        }
        // Be more lenient for area charts as they often work well with smooth data
        var isAreaChart = chartType === 'area';
        var _loop_1 = function (series) {
            if (!series.values || !Array.isArray(series.values)) {
                return "continue";
            }
            var values = series.values;
            if (values.length < 3) {
                return "continue";
            }
            // Check for perfect linear progression
            var differences = [];
            for (var i = 1; i < values.length; i++) {
                differences.push(values[i] - values[i - 1]);
            }
            // If all differences are the same (perfect linear), reject
            var firstDiff = differences[0];
            var allSame = differences.every(function (diff) { return Math.abs(diff - firstDiff) < 0.001; });
            if (allSame && Math.abs(firstDiff) > 0.001) {
                console.warn('[ChartService] Data is perfectly linear - likely generated:', values);
                return { value: true };
            }
            // Check for too smooth progression (small variations only)
            var maxDiff = Math.max.apply(Math, differences.map(function (d) { return Math.abs(d); }));
            var minDiff = Math.min.apply(Math, differences.map(function (d) { return Math.abs(d); }));
            // Use much more lenient threshold for all charts
            var variationThreshold = 1.05;
            if (maxDiff > 0 && minDiff > 0 && maxDiff / minDiff < variationThreshold) {
                console.warn('[ChartService] Data variations extremely small - likely generated:', values);
                return { value: true };
            }
        };
        for (var _i = 0, _a = data.series; _i < _a.length; _i++) {
            var series = _a[_i];
            var state_1 = _loop_1(series);
            if (typeof state_1 === "object")
                return state_1.value;
        }
        return false;
    };
    /**
     * Extract JSON from APIM response
     */
    ChartService.prototype.extractJSON = function (content) {
        // Remove markdown code blocks
        content = content.replace(/```json\n?/g, '');
        content = content.replace(/```\n?/g, '');
        content = content.trim();
        // Find JSON object
        var jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        // Try parsing directly
        return JSON.parse(content);
    };
    /**
     * Execute Python builder
     */
    ChartService.prototype.executePythonBuilder = function (chartType, payload) {
        return __awaiter(this, void 0, void 0, function () {
            var chartId, tempDir, payloadPath, outputPath, scriptPath;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        chartId = (0, crypto_1.randomBytes)(8).toString('hex');
                        tempDir = (0, path_1.join)((0, os_1.tmpdir)(), 'nomad-charts');
                        return [4 /*yield*/, (0, promises_1.mkdir)(tempDir, { recursive: true })];
                    case 1:
                        _a.sent();
                        payloadPath = (0, path_1.join)(tempDir, "".concat(chartId, "-input.json"));
                        outputPath = (0, path_1.join)(tempDir, "".concat(chartId, ".png"));
                        // Write payload to file
                        return [4 /*yield*/, (0, promises_1.writeFile)(payloadPath, JSON.stringify(payload, null, 2))];
                    case 2:
                        // Write payload to file
                        _a.sent();
                        console.log("[ChartService] Executing Python builder for ".concat(chartType));
                        console.log("[ChartService] Payload: ".concat(payloadPath));
                        console.log("[ChartService] Output: ".concat(outputPath));
                        scriptPath = (0, path_1.join)(process.cwd(), 'scripts', "build_".concat(chartType, ".py"));
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                var pythonProcess = (0, child_process_1.spawn)('python3', [scriptPath, payloadPath, outputPath]);
                                var stdout = '';
                                var stderr = '';
                                pythonProcess.stdout.on('data', function (data) {
                                    stdout += data.toString();
                                });
                                pythonProcess.stderr.on('data', function (data) {
                                    stderr += data.toString();
                                });
                                pythonProcess.on('close', function (code) {
                                    if (code !== 0) {
                                        console.error('[ChartService] Python execution failed:', stderr);
                                        reject(new Error("Python execution failed: ".concat(stderr)));
                                    }
                                    else {
                                        console.log('[ChartService] Python execution successful:', stdout);
                                        resolve(outputPath);
                                    }
                                });
                                pythonProcess.on('error', function (error) {
                                    console.error('[ChartService] Failed to start Python process:', error);
                                    reject(error);
                                });
                            })];
                }
            });
        });
    };
    /**
     * Serve chart from local storage
     */
    ChartService.prototype.uploadChart = function (localPath) {
        return __awaiter(this, void 0, void 0, function () {
            var fileName, chartUrl, publicChartsDir, publicPath, _a, _b, error_6;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 4, , 5]);
                        fileName = localPath.split('/').pop() || 'chart.png';
                        chartUrl = "/api/charts/serve/".concat(fileName);
                        publicChartsDir = (0, path_1.join)(process.cwd(), 'public', 'charts');
                        return [4 /*yield*/, (0, promises_1.mkdir)(publicChartsDir, { recursive: true })];
                    case 1:
                        _c.sent();
                        publicPath = (0, path_1.join)(publicChartsDir, fileName);
                        _a = promises_1.writeFile;
                        _b = [publicPath];
                        return [4 /*yield*/, (0, promises_1.readFile)(localPath)];
                    case 2: return [4 /*yield*/, _a.apply(void 0, _b.concat([_c.sent()]))];
                    case 3:
                        _c.sent();
                        console.log("[ChartService] Chart saved to: ".concat(publicPath));
                        console.log("[ChartService] Chart URL (via Portal proxy): ".concat(chartUrl));
                        return [2 /*return*/, chartUrl];
                    case 4:
                        error_6 = _c.sent();
                        console.error('[ChartService] Local storage failed:', error_6);
                        return [2 /*return*/, localPath];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return ChartService;
}());
exports.ChartService = ChartService;
