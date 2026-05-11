console.log("[AZARIA] Script loading...");

/**
 * Azaria Style Harmonizer v1.6.2
 * Refined for ST 1.17+ with Multi-Engine support, Swipe awareness, and Manual Edit Guard.
 */

const extensionName = "azaria-style-harmonizer";
let logs = [];
let isGenerating = false;
let lastGenerationTime = 0;

function azLog(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    logs.push(entry);
    if (logs.length > 100) logs.shift();
    console.log(`[AZARIA] ${msg}`);
}

function safeToast(msg, type = "info") {
    try {
        const context = SillyTavern.getContext();
        // Try context first, then toastr (standard in ST), then fallback to log
        if (context.callToast) {
            context.callToast(msg, type);
        } else if (window.toastr && typeof window.toastr[type] === 'function') {
            window.toastr[type](msg);
        } else {
            azLog(`[Toast Fallback] ${msg}`);
        }
    } catch (e) {
        azLog(`Toast failed: ${e.message}`);
    }
}

// Ensure logs are visible globally for extreme debugging
globalThis.AZARIA_LOGS = logs;

// Global Interceptor
globalThis.azariaStyleInterceptor = async function(chat, contextSize, abort, type) {
    if (!settings?.enabled) return;
    azLog(`Interceptor activity detected: ${type}`);
};

// Default Configuration
const defaultSettings = {
    enabled: true,
    compareLogs: false,
    mode: "gemini", // Default to Direct Gemini
    selectedProfile: "current", 
    backendUrl: "REPLACE_ME",
    characterProfile: "",
    timeout: 120000,
    directApiKey: "",
    directModel: "gemini-1.5-flash",
    directTemp: 0.7,
    openRouterApiKey: "",
    openRouterModel: "google/gemini-2.0-flash-001",
    openRouterTemp: 0.7,
    deepseekApiKey: "",
    deepseekModel: "deepseek-chat",
    deepseekTemp: 0.7,
    directives: "1. Eliminate redundant adverbs.\n2. Ensure witty, cynical tone.\n3. Remove generic emotional descriptions.",
    systemInstruction: "You are an expert Output Parser. Rewrite the provided text to match stylistic directives perfectly while preserving intent.",
    presets: [
        { id: "default", name: "Default Azaria", directives: "1. Eliminate redundancy.\n2. Cynical wit.", instruction: "You are an expert Output Parser." }
    ]
};

let settings;

/**
 * Handle message refinement logic
 */
async function onMessageReceived(data) {
    try {
        const context = SillyTavern.getContext();
        if (!settings?.enabled) return;

        azLog("Event received (MESSAGE_RECEIVED/RENDERED)");

        const chat = context.chat || [];
        let message = null;
        let messageIndex = -1;

        // Robust message lookup for 1.17
        if (typeof data === 'number') {
            messageIndex = data;
            message = chat[messageIndex];
        } else if (typeof data === 'object' && data !== null) {
            // Check for index or id in payload
            const id = data.id !== undefined ? data.id : data.index;
            if (id !== undefined) {
                messageIndex = id;
                message = chat[messageIndex] || chat.find(m => m.id === id);
            } else if (data.mes !== undefined) {
                // data IS the message object
                message = data;
                messageIndex = chat.indexOf(message);
            }
        }

        if (!message) {
            azLog("Could not resolve message from event data.");
            return;
        }

        if (message.is_user || message.is_system) {
            return;
        }

        // Manual Edit Guard: If already processed and changed while NOT generating, it's a manual edit.
        // We allow re-harmonization if it's within a 5 second window of a generation/swipe event.
        const isRecentlyGenerated = (Date.now() - lastGenerationTime < 5000) || isGenerating;
        
        if (message.azaria_processed && message.mes !== message.last_harmonized) {
            if (!isRecentlyGenerated) {
                azLog("Manual edit detected. Skipping harmonization to preserve user changes.");
                message.last_harmonized = message.mes; // Update to the new baseline
                return;
            }
            azLog("Content change detected during generation/swipe window. Proceeding with harmonization.");
        } else if (message.azaria_processed) {
            // Already processed and no change
            return;
        }

        azLog(`Refining message: "${message.mes?.substring(0, 30)}..."`);
        safeToast("[AZARIA] Harvesting text...", "info");

        const sourceText = message.mes;
        let refined;
        
        const timeoutMs = settings.timeout || 120000;
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs));
        
        if (settings.mode === "external") {
            azLog("Sending to Azaria Proxy Engine...");
            refined = await Promise.race([harmonizeExternal(sourceText), timeoutPromise]);
        } else if (settings.mode === "internal") {
            azLog("Sending to Internal Generator...");
            refined = await Promise.race([harmonizeInternal(sourceText), timeoutPromise]);
        } else {
            azLog(`Sending to Direct Engine: ${settings.mode}`);
            refined = await Promise.race([harmonizeDirect(sourceText), timeoutPromise]);
        }

        if (refined && refined !== sourceText) {
            if (settings.compareLogs) {
                azLog("--- HARMONIZATION COMPARISON ---");
                azLog(`[ORIGINAL]: ${sourceText}`);
                azLog(`[HARMONIZED]: ${refined}`);
                azLog("---------------------------------");
            }

            azLog("Style harmony achieved. Updating.");
            message.mes = refined;
            message.last_harmonized = refined; // Track what we did
            message.azaria_processed = true; // Mark to avoid loops
            
            // Try to sync with backend
            if (context.updateMessageMes && messageIndex !== -1) {
                try {
                    context.updateMessageMes(messageIndex, refined);
                } catch (e) {
                    azLog(`Sync failed (Expected in some ST versions): ${e.message}`);
                }
            }
            
            // Force re-render with better selector
            const $msg = $(`[data-id="${messageIndex}"]`).length ? $(`[data-id="${messageIndex}"]`) : $(`.mes[data-id="${messageIndex}"]`);
            if ($msg.length) {
                const $text = $msg.find('.mes_text');
                if ($text.length) {
                    $text.html(context.substituteParams(refined));
                }
            }
            
            safeToast("[AZARIA] Applied Style Harmonization", "success");
        } else {
            azLog("No stylistic variances detected.");
        }
    } catch (e) {
        azLog(`Refinement failure: ${e.message}`, "error");
        safeToast(`Logic error: ${e.message}`, "error");
    }
}

async function harmonizeDirect(text) {
    const context = SillyTavern.getContext();
    const character = context.characters?.[context.character_id];
    const profile = settings.characterProfile || character?.description || character?.personality || "";
    
    const prompt = `${settings.systemInstruction}

Character Context:
${profile}

Style Directives:
${settings.directives}

Text to harmonize:
"${text}"`;

    try {
        if (settings.mode === 'gemini') {
            const key = settings.directApiKey;
            if (!key) throw new Error("Gemini API Key missing.");
            
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.directModel}:generateContent?key=${key}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: settings.directTemp }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.replace(/^"|"$/g, '') || text;
        }

        if (settings.mode === 'openrouter') {
            const key = settings.openRouterApiKey;
            if (!key) throw new Error("OpenRouter API Key missing.");

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`,
                    "HTTP-Referer": "https://github.com/SillyTavern/SillyTavern",
                    "X-Title": "Azaria Style Harmonizer"
                },
                body: JSON.stringify({
                    model: settings.openRouterModel,
                    messages: [{ role: "user", content: prompt }],
                    temperature: settings.openRouterTemp
                })
            });

            if (!response.ok) throw new Error(`OpenRouter Error: ${response.status}`);
            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g, '') || text;
        }

        if (settings.mode === 'deepseek') {
            const key = settings.deepseekApiKey;
            if (!key) throw new Error("Deepseek API Key missing.");

            const response = await fetch("https://api.deepseek.com/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: settings.deepseekModel,
                    messages: [{ role: "user", content: prompt }],
                    temperature: settings.deepseekTemp
                })
            });

            if (!response.ok) throw new Error(`Deepseek Error: ${response.status}`);
            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g, '') || text;
        }
    } catch (error) {
        azLog(`Direct Harmonize [${settings.mode}] Failed: ${error.message}`);
        throw error;
    }
}

async function harmonizeExternal(text) {
    // Determine the char profile if available
    const context = SillyTavern.getContext();
    const character = context.characters?.[context.character_id];
    const profile = settings.characterProfile || character?.description || character?.personality || "";

    // Proxy Fallback
    const payload = {
        sourceText: text,
        styleDirectives: settings.directives,
        systemInstructionOverride: settings.systemInstruction,
        characterProfile: profile,
        apiKey: settings.directApiKey,
        modelName: settings.directModel,
        temperature: settings.directTemp
    };

    azLog(`Hitting Proxy: ${settings.backendUrl}/api/harmonize`);

    try {
        const response = await fetch(`${settings.backendUrl}/api/harmonize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.refinedText || text;
    } catch (error) {
        azLog(`Proxy API failed: ${error.message}`);
        // If it's a TypeError and the URL is REPLACE_ME, it's definitely a config issue
        if (settings.backendUrl === "REPLACE_ME") {
            safeToast("Engine not ready. Provide API Key or Sync URL.", "error");
        }
        return text;
    }
}

async function harmonizeInternal(text) {
    const context = SillyTavern.getContext();
    const generator = context.generateQuietPrompt || context.generateRaw;
    
    if (!generator) {
        azLog("No usable generator found in context.");
        return text;
    }

    const prompt = `${settings.systemInstruction}\n\nSTYLE DIRECTIVES:\n${settings.directives}\n\nTEXT TO REWRITE:\n"${text}"\n\nREWRITTEN TEXT:`;
    
    try {
        const options = {
            prompt: prompt,
            quiet: true,
            ...(settings.selectedProfile !== 'current' ? { api_preset: settings.selectedProfile } : {})
        };

        const result = await generator(options);
        return result.trim().replace(/^"|"$/g, '') || text;
    } catch (error) {
        azLog(`Internal Gen failed: ${error.message}`);
        return text;
    }
}

/**
 * UI Building Logic
 */
async function buildUI() {
    const context = SillyTavern.getContext();
    const { extensionSettings, saveSettingsDebounced } = context;

    if ($(`#${extensionName}-settings`).length) return; 

    azLog("Building Extension UI...");

    if (!extensionSettings[extensionName]) {
        extensionSettings[extensionName] = JSON.parse(JSON.stringify(defaultSettings));
    }
    settings = extensionSettings[extensionName];

    const getProfiles = () => {
        const st = window.SillyTavern || {};
        const candidates = [
            context.settings?.api_presets,
            st.api_presets,
            context.api_presets,
            st.presets,
            context.presets,
            context.settings?.presets
        ];

        for (const list of candidates) {
            if (Array.isArray(list) && list.length > 0) return list;
        }
        return [];
    };

    const profiles = getProfiles();
    const profileOptions = profiles.map(p => {
        const name = typeof p === 'string' ? p : p.name;
        if (!name) return '';
        return `<option value="${name}" ${settings.selectedProfile === name ? 'selected' : ''}>${name}</option>`;
    }).join('');

    const html = `
        <div id="${extensionName}-settings" class="azaria-extension-panel">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b style="color: var(--gold);">Azaria Style Harmonizer</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                </div>
                <div class="inline-drawer-content" style="display: none; padding: 10px; border: 1px dashed var(--black30);">
                    <div class="flex-container" style="justify-content: space-between; margin-bottom: 10px;">
                        <button id="${extensionName}-diag-btn" class="menu_button" title="Test Connection" style="font-size: 9px; padding: 2px 10px;">Diagnostics</button>
                        <button id="${extensionName}-test-btn" class="menu_button" title="Reprocess Last Message" style="font-size: 9px; padding: 2px 10px;">Test Last</button>
                        <button id="${extensionName}-show-logs" class="menu_button" title="View Debug Logs" style="font-size: 9px; padding: 2px 10px;">Logs</button>
                        <button id="${extensionName}-clear-logs" class="menu_button" title="Clear All Logs" style="font-size: 9px; padding: 2px 10px;">Clear</button>
                    </div>

                    <div class="flex-container">
                        <label>
                            <input type="checkbox" id="${extensionName}-enabled" ${settings.enabled ? 'checked' : ''}>
                            Enable Engine
                        </label>
                        <label style="margin-left: 15px;">
                            <input type="checkbox" id="${extensionName}-compare" ${settings.compareLogs ? 'checked' : ''}>
                            Comparison Logs
                        </label>
                    </div>

                    <div style="margin-top: 10px;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                           <span style="font-size: 10px;">Timeout: <span id="${extensionName}-timeout-val">${settings.timeout}</span>ms</span>
                           <input type="range" id="${extensionName}-timeout" min="10000" max="300000" step="5000" value="${settings.timeout}" style="flex: 1; margin-left: 10px;">
                        </div>
                    </div>

                    <div class="flex-container" style="margin-top: 10px;">
                        <span>Engine:</span>
                        <select id="${extensionName}-mode">
                            <option value="gemini" ${settings.mode === 'gemini' ? 'selected' : ''}>Gemini (Direct)</option>
                            <option value="openrouter" ${settings.mode === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                            <option value="deepseek" ${settings.mode === 'deepseek' ? 'selected' : ''}>Deepseek</option>
                            <option value="external" ${settings.mode === 'external' ? 'selected' : ''}>Azaria Proxy (External)</option>
                            <option value="internal" ${settings.mode === 'internal' ? 'selected' : ''}>ST Connection Profile</option>
                        </select>
                    </div>

                    <div id="${extensionName}-gemini-config" style="display: ${settings.mode === 'gemini' ? 'block' : 'none'}; margin-top: 5px; padding: 5px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--gold);">
                        <div style="font-size: 10px; margin-bottom: 5px;">
                            <span>Gemini API Key:</span>
                            <input type="password" id="${extensionName}-gemini-key" value="${settings.directApiKey || ''}" style="width: 100%; font-size: 9px;">
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <div style="flex: 1;">
                                <span style="font-size: 9px;">Model:</span>
                                <input type="text" id="${extensionName}-gemini-model" value="${settings.directModel || 'gemini-1.5-flash'}" style="width: 100%; font-size: 9px;">
                            </div>
                            <div style="width: 50px;">
                                <span style="font-size: 9px;">Temp:</span>
                                <input type="number" id="${extensionName}-gemini-temp" value="${settings.directTemp || 0.7}" step="0.1" style="width: 100%; font-size: 9px;">
                            </div>
                        </div>
                    </div>

                    <div id="${extensionName}-openrouter-config" style="display: ${settings.mode === 'openrouter' ? 'block' : 'none'}; margin-top: 5px; padding: 5px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid #7c3aed;">
                        <div style="font-size: 10px; margin-bottom: 5px;">
                            <span>OpenRouter API Key:</span>
                            <input type="password" id="${extensionName}-openrouter-key" value="${settings.openRouterApiKey || ''}" style="width: 100%; font-size: 9px;">
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <div style="flex: 1;">
                                <span style="font-size: 9px;">Model:</span>
                                <input type="text" id="${extensionName}-openrouter-model" value="${settings.openRouterModel || 'google/gemini-2.0-flash-001'}" style="width: 100%; font-size: 9px;">
                            </div>
                            <div style="width: 50px;">
                                <span style="font-size: 9px;">Temp:</span>
                                <input type="number" id="${extensionName}-openrouter-temp" value="${settings.openRouterTemp || 0.7}" step="0.1" style="width: 100%; font-size: 9px;">
                            </div>
                        </div>
                    </div>

                    <div id="${extensionName}-deepseek-config" style="display: ${settings.mode === 'deepseek' ? 'block' : 'none'}; margin-top: 5px; padding: 5px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid #10b981;">
                        <div style="font-size: 10px; margin-bottom: 5px;">
                            <span>Deepseek API Key:</span>
                            <input type="password" id="${extensionName}-deepseek-key" value="${settings.deepseekApiKey || ''}" style="width: 100%; font-size: 9px;">
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <div style="flex: 1;">
                                <span style="font-size: 9px;">Model:</span>
                                <input type="text" id="${extensionName}-deepseek-model" value="${settings.deepseekModel || 'deepseek-chat'}" style="width: 100%; font-size: 9px;">
                            </div>
                            <div style="width: 50px;">
                                <span style="font-size: 9px;">Temp:</span>
                                <input type="number" id="${extensionName}-deepseek-temp" value="${settings.deepseekTemp || 0.7}" step="0.1" style="width: 100%; font-size: 9px;">
                            </div>
                        </div>
                    </div>
                    
                    <div id="${extensionName}-internal-config" style="display: ${settings.mode === 'internal' ? 'block' : 'none'}; margin-top: 5px; font-size: 10px; color: var(--gold);">
                        <div class="flex-container">
                            <span>Target Profile:</span>
                            <select id="${extensionName}-profile-select" style="font-size: 9px; margin-left: 5px; flex-grow: 1;">
                                <option value="current" ${settings.selectedProfile === 'current' ? 'selected' : ''}>[Active Profile]</option>
                                ${profileOptions}
                            </select>
                            <button id="${extensionName}-refresh-profiles" class="menu_button fa-solid fa-rotate" style="margin-left: 5px; padding: 2px 4px; font-size: 8px;"></button>
                        </div>
                    </div>

                    <div style="margin-top: 10px;">
                        <span style="font-size: 10px; opacity: 0.8;">Character Profile Override (Leave empty to auto-detect):</span>
                        <textarea id="${extensionName}-char-profile" style="width: 100%; height: 50px; font-size: 10px; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--black30);">${settings.characterProfile || ''}</textarea>
                    </div>

                    <div style="margin-top: 10px;">
                        <span style="font-size: 10px; opacity: 0.8;">System Instruction:</span>
                        <textarea id="${extensionName}-instruction" style="width: 100%; height: 50px; font-size: 10px; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--black30);">${settings.systemInstruction}</textarea>
                    </div>

                    <div style="margin-top: 10px;">
                        <span style="font-size: 10px; opacity: 0.8;">Style Directives:</span>
                        <textarea id="${extensionName}-directives" style="width: 100%; height: 80px; font-size: 10px; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--black30);">${settings.directives}</textarea>
                    </div>

                    <div class="flex-container" style="margin-top: 15px; border-top: 1px solid var(--black30); padding-top: 10px; gap: 5px;">
                        <b>Presets:</b>
                        <select id="${extensionName}-preset-list" style="flex-grow: 1; min-width: 0;">
                            ${(settings.presets || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                        <button id="${extensionName}-load-preset" class="menu_button" style="padding: 2px 8px;">Load</button>
                        <button id="${extensionName}-save-preset" class="menu_button" style="padding: 2px 8px;">Save</button>
                    </div>
                    
                    <div style="margin-top: 10px; font-size: 8px; opacity: 0.5; display: flex; flex-direction: column; border-top: 1px solid var(--black30); padding-top: 5px;">
                        <span id="${extensionName}-sync-url-display">PROXY_URL: ${settings.backendUrl}</span>
                        <span style="color: var(--gold); margin-top: 2px;">LOCAL_ENGINE: ${window.AZARIA_ENGINE_ORIGIN || 'Detecting...'}</span>
                        <span style="align-self: flex-end;">v1.6.2-STABLE</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const $container = $('#extensions_settings').length ? $('#extensions_settings') : 
                       ($('#extension_settings').length ? $('#extension_settings') : 
                       ($('#extensions-settings').length ? $('#extensions-settings') : $('#extension-settings')));
    
    if ($container.length) {
        $container.append(html);
        azLog(`UI appended to ${$container.attr('id')}`);

        $(`#${extensionName}-test-btn`).on('click', () => {
            const chat = context.chat || [];
            if (chat.length > 0) {
                azLog("Manual Test Triggered");
                onMessageReceived(chat.length - 1);
            }
        });

        $(`#${extensionName}-sync-btn`).on('click', () => {
            const currentUrl = window.AZARIA_ENGINE_ORIGIN || window.location.origin;
            const newUrl = prompt(`Enter Azaria Engine URL.\n(Detection suggests: ${currentUrl})`, settings.backendUrl === "REPLACE_ME" ? currentUrl : settings.backendUrl);
            
            if (newUrl) {
                settings.backendUrl = newUrl.replace(/\/$/, "");
                $(`#${extensionName}-sync-url-display`).text(`SYNC_URL: ${settings.backendUrl}`);
                saveSettingsDebounced();
                safeToast("Sync URL Refinement Complete", "success");
                azLog(`Engine target shifted to: ${settings.backendUrl}`);
            }
        });

        $(`#${extensionName}-char-profile`).on('input', function() {
            settings.characterProfile = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-enabled`).on('change', function() {
            settings.enabled = !!$(this).prop('checked');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-compare`).on('change', function() {
            settings.compareLogs = !!$(this).prop('checked');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-timeout`).on('input', function() {
            const val = parseInt($(this).val());
            settings.timeout = val;
            $(`#${extensionName}-timeout-val`).text(val);
            saveSettingsDebounced();
        });

        $(`#${extensionName}-mode`).on('change', function() {
            settings.mode = $(this).val();
            $(`#${extensionName}-internal-config`).toggle(settings.mode === 'internal');
            $(`#${extensionName}-gemini-config`).toggle(settings.mode === 'gemini');
            $(`#${extensionName}-openrouter-config`).toggle(settings.mode === 'openrouter');
            $(`#${extensionName}-deepseek-config`).toggle(settings.mode === 'deepseek');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-gemini-key`).on('input', function() {
            settings.directApiKey = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-gemini-model`).on('input', function() {
            settings.directModel = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-gemini-temp`).on('input', function() {
            settings.directTemp = parseFloat($(this).val());
            saveSettingsDebounced();
        });

        $(`#${extensionName}-openrouter-key`).on('input', function() {
            settings.openRouterApiKey = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-openrouter-model`).on('input', function() {
            settings.openRouterModel = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-openrouter-temp`).on('input', function() {
            settings.openRouterTemp = parseFloat($(this).val());
            saveSettingsDebounced();
        });

        $(`#${extensionName}-deepseek-key`).on('input', function() {
            settings.deepseekApiKey = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-deepseek-model`).on('input', function() {
            settings.deepseekModel = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-deepseek-temp`).on('input', function() {
            settings.deepseekTemp = parseFloat($(this).val());
            saveSettingsDebounced();
        });

        $(`#${extensionName}-profile-select`).on('change', function() {
            settings.selectedProfile = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-show-logs`).on('click', () => {
            const { Popup } = SillyTavern.getContext();
            const logContent = logs.join("\n") || "No analysis data captured in this session.";
            
            if (Popup) {
                // Use a slightly larger popup view if possible, or just formatted text
                Popup.show.text(`<div style="font-family: monospace; font-size: 11px; white-space: pre-wrap; max-height: 500px; overflow-y: auto; text-align: left;">${logContent}</div>`, "Azaria Debug Pulse");
            } else {
                alert(logContent);
            }
        });

        $(`#${extensionName}-clear-logs`).on('click', () => {
            logs = [`[AZARIA] Data stream reset at ${new Date().toLocaleTimeString()}`];
            globalThis.AZARIA_LOGS = logs;
            safeToast("Logs cleared", "info");
        });

        $(`#${extensionName}-diag-btn`).on('click', async () => {
            azLog("Starting Diagnostic Scan...");
            safeToast("Diagnostics running...", "info");
            
            try {
                const response = await fetch(`${settings.backendUrl}/api/harmonize`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sourceText: "TEST", styleDirectives: "REWRITE AS 'OK'" })
                });
                const data = await response.json();
                azLog(`External API Test: ${data.refinedText === 'OK' ? 'PASS' : 'FAIL (Unexpected result)'}`);
                safeToast("Diagnostic: Connection OK", "success");
            } catch (e) {
                azLog(`External API Test: FAIL (${e.message})`);
                safeToast("Diagnostic: Connection Failed", "error");
            }
        });

        $(`#${extensionName}-refresh-profiles`).on('click', function() {
            const freshProfiles = getProfiles();
            const $select = $(`#${extensionName}-profile-select`);
            const current = $select.val();
            $select.empty();
            $select.append(`<option value="current" ${current === 'current' ? 'selected' : ''}>[Active Profile]</option>`);
            freshProfiles.forEach(p => {
                const name = typeof p === 'string' ? p : p.name;
                if (name) $select.append(`<option value="${name}" ${current === name ? 'selected' : ''}>${name}</option>`);
            });
            safeToast("Profiles refreshed", "info");
        });

        $(`#${extensionName}-instruction`).on('input', function() {
            settings.systemInstruction = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-directives`).on('input', function() {
            settings.directives = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-load-preset`).on('click', function() {
            const id = $(`#${extensionName}-preset-list`).val();
            const preset = settings.presets.find(p => p.id === id);
            if (preset) {
                $(`#${extensionName}-instruction`).val(preset.instruction).trigger('input');
                $(`#${extensionName}-directives`).val(preset.directives).trigger('input');
                context.callToast(`Preset "${preset.name}" loaded`, "info");
            }
        });

        $(`#${extensionName}-save-preset`).on('click', function() {
            const name = prompt("Enter preset name:");
            if (name) {
                const id = Date.now().toString();
                settings.presets = settings.presets || [];
                settings.presets.push({ id, name, directives: settings.directives, instruction: settings.systemInstruction });
                $(`#${extensionName}-preset-list`).append(`<option value="${id}">${name}</option>`);
                saveSettingsDebounced();
                safeToast(`Preset "${name}" saved`, "success");
            }
        });
    } else {
        azLog("Settings container not found yet. Retrying buildUI...");
        setTimeout(buildUI, 2000);
    }
}

/**
 * LIFECYCLE HOOK: Activate
 */
export async function onActivate() {
    azLog("Activating...");
    const context = SillyTavern.getContext();
    const { eventSource, event_types, extensionSettings } = context;

    if (!extensionSettings[extensionName]) {
        extensionSettings[extensionName] = JSON.parse(JSON.stringify(defaultSettings));
    }
    settings = extensionSettings[extensionName];

    // Listen to multiple event types to ensure capture
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_UPDATED, onMessageReceived);

    eventSource.on(event_types.GENERATION_STARTED, () => {
        isGenerating = true;
        azLog("Generation process initiated.");
    });
    eventSource.on(event_types.GENERATION_STOPPED, () => {
        isGenerating = false;
        lastGenerationTime = Date.now();
        azLog("Generation process concluded.");
    });

    // Register Log Command
    try {
        const { SlashCommandParser, SlashCommand, Popup } = context;
        if (SlashCommandParser) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'azlog',
                callback: () => {
                    const output = logs.join("\n") || "Logs are empty. Is the extension enabled?";
                    if (Popup) {
                        Popup.show.text("Azaria Debug Logs", output);
                        return "Opening log popup...";
                    } else {
                        return output;
                    }
                },
                helpString: 'Displays the Azaria Style Engine execution logs in a popup.',
            }));
            
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'azaria',
                callback: () => {
                    const status = settings.enabled ? "ACTIVE" : "DISABLED";
                    const mode = settings.mode;
                    return `Azaria Style Engine Status: ${status}\nMode: ${mode}\nUse /azlog for detailed internals.`;
                },
                helpString: 'Check engine status.',
            }));
        }
    } catch (e) {
        azLog(`Slash command failure: ${e.message}`);
    }

    eventSource.on(event_types.APP_READY, buildUI);
    
    if (document.readyState === 'complete') {
        buildUI();
    }
}

window.onActivate = onActivate;
