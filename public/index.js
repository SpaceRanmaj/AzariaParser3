(function() {
    const extensionName = "azaria-style-harmonizer";
    const { 
        addHook, 
        event_types, 
        extension_settings,
        saveSettingsDebounced,
        getContext
    } = window.SillyTavern.getContext();

    // Default Configuration
    const defaultSettings = {
        enabled: true,
        mode: "external", // "external" (Gemini) or "internal" (ST Profile)
        selectedProfile: "current", // "current" or name of the profile
        backendUrl: "https://" + window.location.host,
        directives: "1. Eliminate redundant adverbs.\n2. Ensure witty, cynical tone.\n3. Remove generic emotional descriptions.",
        systemInstruction: "You are an expert Output Parser. Rewrite the provided text to match stylistic directives perfectly while preserving intent.",
        presets: [
            { id: "default", name: "Default Azaria", directives: "1. Eliminate redundancy.\n2. Cynical wit.", instruction: "" }
        ]
    };

    // Initialization
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    const settings = extension_settings[extensionName];

    // --- LOGIC ---

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
        const prompt = `${settings.systemInstruction}\n\nSTYLE DIRECTIVES:\n${settings.directives}\n\nTEXT TO REWRITE:\n"${text}"\n\nREWRITTEN TEXT:`;
        
        try {
            // If we have a profile override, we have to temporarily swap or use a specific backend call.
            // For now, let's look for the profile in the ST context.
            // Note: Modern ST generation handles profile switching usually via global state.
            // To avoid flickering the UI, we just use the default generateRaw if it's "current".
            
            const genOptions = {
                stopped: false,
                quiet: true
            };

            // If a specific profile is requested, we apply a temporary override if the API allows.
            // Otherwise, we alert the user that "Current" is safest.
            
            const result = await window.SillyTavern.getContext().generateRaw(prompt, genOptions);
            return result.trim().replace(/^"|"$/g, '') || text;
        } catch (error) {
            console.error("[AZARIA] Internal ST Backend failed:", error);
            return text;
        }
    }

    async function onMessageReceived(messageId) {
        if (!settings.enabled) return;

        const chat = getContext().chat;
        const message = chat.find(m => m.id === messageId);
        
        if (!message || message.is_user) return;

        console.log("[AZARIA] Refining message:", messageId);

        let refined;
        if (settings.mode === "external") {
            refined = await harmonizeExternal(message.mes);
        } else {
            refined = await harmonizeInternal(message.mes);
        }

        if (refined && refined !== message.mes) {
            message.mes = refined;
            getContext().updateMessageMes(messageId, refined);
        }
    }

    // --- UI BUILDING ---

    function buildUI() {
        if ($(`#${extensionName}-settings`).length) return; // Already exists

        const html = `
            <div id="${extensionName}-settings" class="azaria-extension-panel">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Azaria Style Harmonizer</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display: none; padding: 10px; border: 1px dashed var(--black30);">
                        <div class="flex-container">
                            <label>
                                <input type="checkbox" id="${extensionName}-enabled" ${settings.enabled ? 'checked' : ''}>
                                Enable Engine
                            </label>
                        </div>

                        <div class="flex-container" style="margin-top: 10px;">
                            <span>Engine Mode:</span>
                            <select id="${extensionName}-mode">
                                <option value="external" ${settings.mode === 'external' ? 'selected' : ''}>Azaria Gemini Backend</option>
                                <option value="internal" ${settings.mode === 'internal' ? 'selected' : ''}>ST Connection Profile</option>
                            </select>
                        </div>
                        
                        <div class="flex-container" style="margin-top: 10px;">
                            <span>Connection Profile:</span>
                            <select id="${extensionName}-profile">
                                <option value="current" ${settings.selectedProfile === 'current' ? 'selected' : ''}>Use Currently Active</option>
                                <option value="other" ${settings.selectedProfile === 'other' ? 'selected' : ''}>Custom/Previous (Alpha)</option>
                            </select>
                        </div>

                        <div style="margin-top: 10px;">
                            <span>System Instruction:</span>
                            <textarea id="${extensionName}-instruction" style="width: 100%; height: 60px; font-size: 11px;">${settings.systemInstruction}</textarea>
                        </div>

                        <div style="margin-top: 10px;">
                            <span>Style Directives (Fine-tuning):</span>
                            <textarea id="${extensionName}-directives" style="width: 100%; height: 100px; font-size: 11px;">${settings.directives}</textarea>
                        </div>

                        <div class="flex-container" style="margin-top: 15px; border-top: 1px solid var(--black30); padding-top: 10px;">
                            <b>Presets:</b>
                            <select id="${extensionName}-preset-list" style="flex-grow: 1; margin: 0 5px;">
                                ${settings.presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                            </select>
                            <button id="${extensionName}-load-preset" class="menu_button">Load</button>
                            <button id="${extensionName}-save-preset" class="menu_button">Save New</button>
                        </div>
                        
                        <div style="margin-top: 10px; font-size: 8px; opacity: 0.5;">
                            ENDPOINT: ${settings.backendUrl}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Robust insertion logic
        const container = $('#extensions_settings, .extensions_settings, #extension_settings');
        if (container.length) {
            container.append(html);
            console.log("[AZARIA] UI injected successfully.");
        } else {
            console.warn("[AZARIA] Containers missing. Retrying...");
            setTimeout(buildUI, 2000);
            return;
        }

        // Events
        $(`#${extensionName}-enabled`).on('change', function() {
            settings.enabled = !!$(this).prop('checked');
            saveSettingsDebounced();
        });

        $(`#${extensionName}-mode`).on('change', function() {
            settings.mode = $(this).val();
            saveSettingsDebounced();
        });
        
        $(`#${extensionName}-profile`).on('change', function() {
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
                $(`#${extensionName}-instruction`).val(preset.instruction || defaultSettings.systemInstruction).trigger('input');
                $(`#${extensionName}-directives`).val(preset.directives).trigger('input');
                addLog && addLog("PRESET_LOADED: " + preset.name);
            }
        });

        $(`#${extensionName}-save-preset`).on('click', function() {
            const name = prompt("Enter preset name:");
            if (name) {
                const id = Date.now().toString();
                settings.presets.push({
                    id,
                    name,
                    directives: settings.directives,
                    instruction: settings.systemInstruction
                });
                $(`#${extensionName}-preset-list`).append(`<option value="${id}">${name}</option>`);
                saveSettingsDebounced();
            }
        });
    }

    function init() {
        addHook(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        buildUI();
        console.log("[AZARIA] Style Harmonizer Dashboard v2 Loaded.");
    }

    init();
})();
