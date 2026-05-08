(function() {
    const extensionName = "azaria-style-harmonizer";
    
    console.log("[AZARIA] Script loading...");

    // Safety check for ST context - retry if context isn't ready
    function getSTContext() {
        if (window.SillyTavern && window.SillyTavern.getContext) {
            return window.SillyTavern.getContext();
        }
        return null;
    }

    async function init(retryCount = 0) {
        const context = getSTContext();
        if (!context) {
            if (retryCount < 20) {
                console.log("[AZARIA] Waiting for SillyTavern context... (" + retryCount + ")");
                setTimeout(() => init(retryCount + 1), 500);
            } else {
                console.error("[AZARIA] SillyTavern context NOT found. Extension initialization aborted.");
            }
            return;
        }

        const { 
            addHook, 
            event_types, 
            extension_settings,
            saveSettingsDebounced,
            getContext
        } = context;

        // Default Configuration
        const defaultSettings = {
            enabled: true,
            mode: "external", 
            selectedProfile: "current", 
            backendUrl: "https://" + window.location.host,
            directives: "1. Eliminate redundant adverbs.\n2. Ensure witty, cynical tone.\n3. Remove generic emotional descriptions.",
            systemInstruction: "You are an expert Output Parser. Rewrite the provided text to match stylistic directives perfectly while preserving intent.",
            presets: [
                { id: "default", name: "Default Azaria", directives: "1. Eliminate redundancy.\n2. Cynical wit.", instruction: "" }
            ]
        };

        // Initialization of settings
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = defaultSettings;
        }
        const settings = extension_settings[extensionName];

        // Export for debug
        window.AzariaHarmonizer = {
            settings,
            harmonize: (text) => harmonizeExternal(text),
            retryUI: () => buildUI(settings, getContext, saveSettingsDebounced)
        };

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
                const genOptions = {
                    stopped: false,
                    quiet: true
                };

                const result = await context.generateRaw(prompt, genOptions);
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

        function buildUI(settings, getContext, saveSettingsDebounced, retryCount = 0) {
            if ($(`#${extensionName}-settings`).length) return; 

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
                                <i>Note: Internal mode currently uses the Active Profile.</i>
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
                                <button id="${extensionName}-save-preset" class="menu_button">Save</button>
                            </div>
                            
                            <div style="margin-top: 10px; font-size: 8px; opacity: 0.5; display: flex; justify-content: space-between;">
                                <span>ENDPOINT: ${settings.backendUrl}</span>
                                <span>v1.3.0</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Modern ST target list
            const targets = [
                '#extensions_settings',
                '.extensions_settings',
                '#extension_settings',
                '#extensions_list',
                '#rm_extensions_block'
            ];
            
            let container = null;
            for (const t of targets) {
                const found = $(t);
                if (found.length) {
                    container = found;
                    break;
                }
            }

            if (container) {
                container.prepend(html);
                console.log("[AZARIA] UI injected successfully into " + container.selector);
                
                // --- EVENTS ---
                $(`#${extensionName}-enabled`).on('change', function() {
                    settings.enabled = !!$(this).prop('checked');
                    saveSettingsDebounced();
                });

                $(`#${extensionName}-mode`).on('change', function() {
                    settings.mode = $(this).val();
                    $(`#${extensionName}-internal-config`).toggle(settings.mode === 'internal');
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
            } else {
                if (retryCount < 15) {
                    setTimeout(() => buildUI(settings, getContext, saveSettingsDebounced, retryCount + 1), 2000);
                } else {
                    console.error("[AZARIA] UI Injection failed - could not find a suitable container.");
                }
            }
        }

        // Start initialization
        addHook(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        console.log("[AZARIA] Engine initialized. Injecting UI...");
        buildUI(settings, getContext, saveSettingsDebounced);
    }

    // Start loading
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
