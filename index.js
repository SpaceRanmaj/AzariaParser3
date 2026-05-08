console.log("[AZARIA] Script loading...");

/**
 * Azaria Style Harmonizer v1.3.6
 * Refines and harmonizes AI outputs using the Azaria Functions Style Engine.
 */

const extensionName = "azaria-style-harmonizer";

// Default Configuration
const defaultSettings = {
    enabled: true,
    mode: "external", 
    selectedProfile: "current", 
    backendUrl: "REPLACE_ME",
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
async function onMessageReceived(messageId) {
    const context = SillyTavern.getContext();
    if (!settings.enabled) return;

    const chat = context.chat;
    const message = chat.find(m => m.id === messageId);
    
    if (!message || message.is_user) return;

    console.log("[AZARIA] Refining message:", messageId);

    let refined;
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000));
        
        if (settings.mode === "external") {
            refined = await Promise.race([harmonizeExternal(message.mes), timeoutPromise]);
        } else {
            refined = await Promise.race([harmonizeInternal(message.mes), timeoutPromise]);
        }
    } catch (e) {
        console.error("[AZARIA] Refinement failed (timeout or error):", e);
        return;
    }

    if (refined && refined !== message.mes) {
        message.mes = refined;
        context.updateMessageMes(messageId, refined);
    }
}

async function harmonizeExternal(text) {
    try {
        const response = await fetch(`${settings.backendUrl}/api/harmonize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sourceText: text,
                styleDirectives: settings.directives,
                systemInstructionOverride: settings.systemInstruction
            })
        });
        const data = await response.json();
        return data.refinedText || text;
    } catch (error) {
        console.error("[AZARIA] External API failed:", error);
        return text;
    }
}

async function harmonizeInternal(text) {
    const context = SillyTavern.getContext();
    const { generateQuietPrompt } = context;
    
    // Fallback if generateQuietPrompt is missing
    const generator = generateQuietPrompt || context.generateRaw;
    
    if (!generator) {
        console.error("[AZARIA] No generation function found in context.");
        return text;
    }

    const prompt = `${settings.systemInstruction}\n\nSTYLE DIRECTIVES:\n${settings.directives}\n\nTEXT TO REWRITE:\n"${text}"\n\nREWRITTEN TEXT:`;
    
    try {
        // Prepare generation options
        const options = {
            prompt: prompt,
            quiet: true,
            // Try to use the selected profile if it's not "current"
            ...(settings.selectedProfile !== 'current' ? { api_preset: settings.selectedProfile } : {})
        };

        const result = await generator(options);
        return result.trim().replace(/^"|"$/g, '') || text;
    } catch (error) {
        console.error("[AZARIA] Internal ST Backend failed:", error);
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

    // Sync settings with ST storage
    if (!extensionSettings[extensionName]) {
        extensionSettings[extensionName] = JSON.parse(JSON.stringify(defaultSettings));
    }
    settings = extensionSettings[extensionName];

    // Profile handling - expanded search for ST 1.17
    const getProfiles = () => {
        const ctxSettings = context.settings || {};
        return ctxSettings.api_presets || 
               window.SillyTavern?.api_presets || 
               context.api_presets || 
               [];
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
                    
                    <div id="${extensionName}-internal-config" style="display: ${settings.mode === 'internal' ? 'block' : 'none'}; margin-top: 5px; font-size: 10px; color: var(--gold);">
                        <div class="flex-container">
                            <span>Target Profile:</span>
                            <select id="${extensionName}-profile-select" style="font-size: 9px; margin-left: 5px; flex-grow: 1;">
                                <option value="current" ${settings.selectedProfile === 'current' ? 'selected' : ''}>[Active Profile]</option>
                                ${profileOptions}
                            </select>
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
                        <span>v1.3.6-mod</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Modern 1.12+ extension settings container
    const $container = $('#extensions_settings').length ? $('#extensions_settings') : $('#extension_settings');
    
    if ($container.length) {
        $container.append(html);
        console.log("[AZARIA] UI appended to extension settings.");

        // Wire up events
        $(`#${extensionName}-enabled`).on('change', function() {
            settings.enabled = !!$(this).prop('checked');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-mode`).on('change', function() {
            settings.mode = $(this).val();
            $(`#${extensionName}-internal-config`).toggle(settings.mode === 'internal');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-profile-select`).on('change', function() {
            settings.selectedProfile = $(this).val();
            saveSettingsDebounced();
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
                settings.presets.push({
                    id,
                    name,
                    directives: settings.directives,
                    instruction: settings.systemInstruction
                });
                $(`#${extensionName}-preset-list`).append(`<option value="${id}">${name}</option>`);
                saveSettingsDebounced();
                context.callToast(`Preset "${name}" saved`, "success");
            }
        });
    } else {
        console.warn("[AZARIA] Settings container not found yet. Retrying in 2s.");
        setTimeout(buildUI, 2000);
    }
}

/**
 * LIFECYCLE HOOK: Activate
 */
export async function onActivate() {
    console.log("[AZARIA] Activating Azaria Style Harmonizer...");
    const context = SillyTavern.getContext();
    const { eventSource, event_types, extensionSettings } = context;

    // Load settings
    if (!extensionSettings[extensionName]) {
        extensionSettings[extensionName] = JSON.parse(JSON.stringify(defaultSettings));
    }
    settings = extensionSettings[extensionName];

    // Register Event Hooks
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);

    // Register Slash Command (Modern API)
    try {
        const { SlashCommandParser, SlashCommand, SlashCommandArgument } = context;
        if (SlashCommandParser && SlashCommand) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'azaria',
                callback: (namedArgs, unnamedArgs) => {
                    const status = settings.enabled ? "ACTIVE" : "DISABLED";
                    const mode = settings.mode === 'external' ? "Gemini Engine" : "ST Profile";
                    return `Azaria Style Engine Status: ${status}\nMode: ${mode}`;
                },
                helpString: 'Check the status of the Azaria Style Harmonizer engine.',
                aliases: ['az']
            }));
            console.log("[AZARIA] Slash command /azaria registered.");
        }
    } catch (e) {
        console.warn("[AZARIA] Failed to register slash command object:", e);
    }

    // Build UI on APP_READY
    eventSource.on(event_types.APP_READY, buildUI);
    
    // In case App is already ready
    if (document.readyState === 'complete') {
        buildUI();
    }
}

// Global fallback for legacy loaders
window.onActivate = onActivate;
