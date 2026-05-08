console.log("[AZARIA] Script loading...");

/**
 * Azaria Style Harmonizer v1.4.1
 * Refined for ST 1.17+ with internal logging.
 */

const extensionName = "azaria-style-harmonizer";
const logs = [];

function azLog(msg, type = "info") {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.push(entry);
    if (logs.length > 50) logs.shift();
    console.log(`[AZARIA] ${msg}`);
}

// Global Interceptor
globalThis.azariaStyleInterceptor = async function(chat, contextSize, abort, type) {
    if (!settings?.enabled) return;
    azLog(`Interceptor fired: ${type}`);
};

// Default Configuration
const defaultSettings = {
    enabled: true,
    mode: "external", 
    selectedProfile: "current", 
    backendUrl: "REPLACE_ME",
    directApiKey: "",
    directModel: "gemini-3-flash-preview",
    directTemp: 0.7,
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
    const context = SillyTavern.getContext();
    if (!settings?.enabled) return;

    azLog("Message detected, analyzing...");

    // ST 1.17 event data structure lookup
    const messageId = typeof data === 'object' ? data.id : data;
    const chat = context.chat || [];
    const message = chat.find(m => m.id === messageId) || chat[messageId];
    
    if (!message || message.is_user) {
        azLog(`Skipping: ${!message ? "No message" : "Is user message"}`);
        return;
    }

    context.callToast("[AZARIA] Harvesting text...", "info");
    azLog(`Refining message ID: ${messageId}`);

    try {
        const sourceText = message.mes;
        let refined;
        
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 45000));
        
        if (settings.mode === "external") {
            azLog("Sending to External Engine...");
            refined = await Promise.race([harmonizeExternal(sourceText), timeoutPromise]);
        } else {
            azLog("Sending to Internal Generator...");
            refined = await Promise.race([harmonizeInternal(sourceText), timeoutPromise]);
        }

        if (refined && refined !== sourceText) {
            azLog("Style harmony achieved. Updating DOM.");
            message.mes = refined;
            
            if (context.updateMessageMes) {
                context.updateMessageMes(messageId, refined);
            }
            
            // Force re-render for mobile clients
            const $msg = $(`[data-id="${messageId}"]`);
            if ($msg.length) {
                const $text = $msg.find('.mes_text');
                if ($text.length) $text.text(refined);
            }
            
            context.callToast("[AZARIA] Applied Style Harmonization", "success");
        } else {
            azLog("No stylistic variances detected.");
            context.callToast("[AZARIA] Output already harmonious", "info");
        }
    } catch (e) {
        azLog(`Logic failure: ${e.message}`, "error");
        context.callToast(`[AZARIA] Error: ${e.message}`, "error");
    }
}

async function harmonizeExternal(text) {
    const payload = {
        sourceText: text,
        styleDirectives: settings.directives,
        systemInstructionOverride: settings.systemInstruction,
        apiKey: settings.directApiKey,
        modelName: settings.directModel,
        temperature: settings.directTemp
    };

    try {
        const response = await fetch(`${settings.backendUrl}/api/harmonize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return data.refinedText || text;
    } catch (error) {
        azLog(`External API failed: ${error.message}`);
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
                    <div class="flex-container">
                        <label>
                            <input type="checkbox" id="${extensionName}-enabled" ${settings.enabled ? 'checked' : ''}>
                            Enable Engine (Harmonize Outputs)
                        </label>
                    </div>

                    <div class="flex-container" style="margin-top: 10px;">
                        <span>Engine Mode:</span>
                        <select id="${extensionName}-mode">
                            <option value="external" ${settings.mode === 'external' ? 'selected' : ''}>Azaria Gemini Engine</option>
                            <option value="internal" ${settings.mode === 'internal' ? 'selected' : ''}>ST Connection Profile</option>
                        </select>
                    </div>

                    <div id="${extensionName}-direct-config" style="display: ${settings.mode === 'external' ? 'block' : 'none'}; margin-top: 5px; padding: 5px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                        <div style="font-size: 10px; margin-bottom: 5px;">
                            <span>API Key (Optional):</span>
                            <input type="password" id="${extensionName}-api-key" value="${settings.directApiKey || ''}" style="width: 100%; font-size: 9px;">
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <div style="flex: 1;">
                                <span style="font-size: 9px;">Model:</span>
                                <input type="text" id="${extensionName}-direct-model" value="${settings.directModel || 'gemini-3-flash-preview'}" style="width: 100%; font-size: 9px;">
                            </div>
                            <div style="width: 50px;">
                                <span style="font-size: 9px;">Temp:</span>
                                <input type="number" id="${extensionName}-direct-temp" value="${settings.directTemp || 0.7}" step="0.1" style="width: 100%; font-size: 9px;">
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
                    
                    <div style="margin-top: 10px; font-size: 8px; opacity: 0.5; display: flex; justify-content: space-between;">
                        <span>SYNC_URL: ${settings.backendUrl}</span>
                        <span>v1.4.1-log</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const $container = $('#extensions_settings').length ? $('#extensions_settings') : $('#extension_settings');
    
    if ($container.length) {
        $container.append(html);
        azLog("UI appended to settings panel.");

        $(`#${extensionName}-enabled`).on('change', function() {
            settings.enabled = !!$(this).prop('checked');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-mode`).on('change', function() {
            settings.mode = $(this).val();
            $(`#${extensionName}-internal-config`).toggle(settings.mode === 'internal');
            $(`#${extensionName}-direct-config`).toggle(settings.mode === 'external');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-api-key`).on('input', function() {
            settings.directApiKey = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-direct-model`).on('input', function() {
            settings.directModel = $(this).val();
            saveSettingsDebounced();
        });

        $(`#${extensionName}-direct-temp`).on('input', function() {
            settings.directTemp = parseFloat($(this).val());
            saveSettingsDebounced();
        });

        $(`#${extensionName}-profile-select`).on('change', function() {
            settings.selectedProfile = $(this).val();
            saveSettingsDebounced();
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
            context.callToast("Profiles refreshed", "info");
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
                context.callToast(`Preset "${name}" saved`, "success");
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

    // Register Log Command
    try {
        const { SlashCommandParser, SlashCommand } = context;
        if (SlashCommandParser) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'azlog',
                callback: () => {
                    const output = "--- AZARIA DEBUG LOGS ---\n" + logs.join("\n");
                    return output;
                },
                helpString: 'Displays the Azaria Style Engine execution logs.',
            }));
            
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'azaria',
                callback: () => {
                    const status = settings.enabled ? "ACTIVE" : "DISABLED";
                    return `Azaria Style Engine Status: ${status}\nLogs: Use /azlog to view details.`;
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
